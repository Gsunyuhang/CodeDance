import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { MiniContext } from '../context.js'
import type { MiniPlugin } from '../plugin.js'
import {
  createAgentLoopPlugin,
} from '../plugins/agent-loop-plugin.js'
import {
  createDeepSeekModelPlugin,
} from '../plugins/deepseek-model-plugin.js'
import { agentEventsPlugin } from '../plugins/events-plugin.js'
import {
  createFileToolsPlugin,
} from '../plugins/file-tools-plugin.js'
import { createMockModelPlugin } from '../plugins/mock-model-plugin.js'
import {
  createPermissionPlugin,
} from '../plugins/permission-plugin.js'
import {
  createContextManagerPlugin,
} from '../plugins/context-manager-plugin.js'
import { promptOptimizerPlugin } from '../plugins/prompt-optimizer-plugin.js'
import { createSessionPlugin } from '../plugins/session-plugin.js'
import {
  createShellToolsPlugin,
} from '../plugins/shell-tools-plugin.js'
import { toolsPlugin } from '../plugins/tools-plugin.js'
import { AgentBudgetExceededError } from '../services/agent-loop.js'
import type { AgentLoopService } from '../services/agent-loop.js'
import type { AgentEventService } from '../services/events.js'
import type {
  ContextManagerService,
} from '../services/context-manager.js'
import type {
  PromptOptimizerService,
} from '../services/prompt-optimizer.js'
import { evaluateTask } from './evaluator.js'
import {
  createTrackedModelPlugin,
  ModelCallTracker,
  RunMetricsCollector,
} from './metrics.js'
import { createSimModelPlugin } from './sim-model.js'
import {
  createNaiveContextManagerPlugin,
  HARNESS_VARIANTS,
} from './variants.js'
import { BENCHMARK_TASKS as ALL_TASKS } from './tasks.js'
import type {
  BenchmarkOptions,
  BenchmarkTask,
  HarnessVariant,
  RunMetrics,
  TaskRunResult,
  VariantName,
  VariantSummary,
} from './types.js'

/** 一次（变体 x 任务）运行的完整记录。 */
export interface BenchmarkRun {
  /** 全部运行结果，按变体、任务顺序。 */
  readonly results: readonly TaskRunResult[]

  /** 各变体汇总指标。 */
  readonly summaries: readonly VariantSummary[]
}

/**
 * 运行消融实验。
 *
 * 对每个（变体 x 任务）组合：
 *
 * 1. 生成干净的任务 workspace（fixture 落盘）；
 * 2. 按变体组装 Runtime（差异只有 Context Manager 插件和
 *    是否调用 Prompt Optimizer）；
 * 3. 统一权限策略（全部自动授权）、统一预算执行 Agent 任务；
 * 4. 自动 Evaluator 检查 workspace 最终状态和最终回答；
 * 5. 采集 6 类指标并汇总。
 *
 * @param options - 实验配置。
 * @returns 运行结果与汇总。
 */
export async function runBenchmark(
  options: BenchmarkOptions,
): Promise<BenchmarkRun> {
  const variants = options.variants.map((name) => {
    const variant = HARNESS_VARIANTS[name]
    if (variant === undefined) {
      throw new Error(`unknown variant: ${name}`)
    }
    return variant
  })
  const tasks = selectTasks(options)
  const results: TaskRunResult[] = []

  for (const variant of variants) {
    for (const task of tasks) {
      const result = await runSingleTask(variant, task, options)
      results.push(result)
      options.onRun?.(result)
    }
  }

  return {
    results,
    summaries: summarize(variants, results),
  }
}

/** 选择参与实验的任务。 */
function selectTasks(
  options: BenchmarkOptions,
): readonly BenchmarkTask[] {
  if (options.taskIds === undefined || options.taskIds.length === 0) {
    // 动态导入避免循环依赖：tasks 不依赖 runner。
    return ALL_TASKS
  }

  const selected = options.taskIds.map((taskId) => {
    const task = ALL_TASKS.find((item) => item.id === taskId)
    if (task === undefined) {
      throw new Error(`unknown task id: ${taskId}`)
    }
    return task
  })
  return selected
}

/** 执行单个（变体 x 任务）运行。 */
async function runSingleTask(
  variant: HarnessVariant,
  task: BenchmarkTask,
  options: BenchmarkOptions,
): Promise<TaskRunResult> {
  const workspaceRoot = materializeWorkspace(
    task,
    join(options.outputDir, 'workspaces', variant.name, task.id),
  )
  const sessionDir = join(
    options.outputDir,
    'sessions',
    variant.name,
  )
  mkdirSync(sessionDir, { recursive: true })

  const tracker = new ModelCallTracker()
  const collector = new RunMetricsCollector()
  const context = buildRunContext({
    variant,
    task,
    model: options.model,
    workspaceRoot,
    sessionDir,
    tracker,
    maxModelRounds: options.maxModelRounds,
    maxToolCalls: options.maxToolCalls,
    timeoutMs: options.timeoutMs,
  })

  const startedAt = Date.now()
  let status: RunMetrics['status'] = 'completed'
  let finalAnswer = ''

  try {
    const events = context.get<AgentEventService>('agent-events')
    const unsubscribe = collector.subscribe(events)

    try {
      const agentLoop = context.get<AgentLoopService>('agent-loop')
      let systemPrompt: string | undefined

      if (variant.usePromptOptimizer) {
        const optimizer = context.get<PromptOptimizerService>(
          'prompt-optimizer',
        )
        systemPrompt = await optimizer.optimize(task.prompt, {
          workspaceRoot,
        })
      }

      finalAnswer = await agentLoop.run(task.prompt, {
        systemPrompt,
        taskId: `${variant.name}-${task.id}`,
      })
    } finally {
      unsubscribe()
    }
  } catch (error: unknown) {
    status =
      error instanceof AgentBudgetExceededError
        ? 'budget-exceeded'
        : 'error'
  } finally {
    context.dispose()
  }

  const metrics = collector.snapshot(
    tracker,
    Date.now() - startedAt,
    status,
  )
  const evaluation = evaluateTask(task, workspaceRoot, finalAnswer)

  return {
    variant: variant.name,
    taskId: task.id,
    passed: evaluation.passed,
    metrics,
    checkResults: evaluation.results,
    ...(evaluation.failureReason === undefined
      ? {}
      : { failureReason: evaluation.failureReason }),
  }
}

/** 组装一次运行使用的 Runtime。 */
function buildRunContext(deps: {
  readonly variant: HarnessVariant
  readonly task: BenchmarkTask
  readonly model: BenchmarkOptions['model']
  readonly workspaceRoot: string
  readonly sessionDir: string
  readonly tracker: ModelCallTracker
  readonly maxModelRounds: number
  readonly maxToolCalls: number
  readonly timeoutMs: number
}): MiniContext {
  const context = new MiniContext()

  try {
    context.use(
      createSessionPlugin({
        rootDir: deps.sessionDir,
        sessionId: `${deps.variant.name}-${deps.task.id}-${randomUUID()}`,
        cwd: deps.workspaceRoot,
      }),
    )
    context.use(agentEventsPlugin)
    // 统一权限策略：benchmark 中全部工具调用自动授权。
    context.use(createPermissionPlugin({ approve: () => 'allow-session' }))
    context.use(toolsPlugin)
    context.use(
      createTrackedModelPlugin(
        createModelPlugin(deps.model, deps.task, deps.variant),
        deps.tracker,
      ),
    )

    if (deps.variant.useContextManager) {
      context.use(createContextManagerPlugin())
    } else {
      context.use(createNaiveContextManagerPlugin())
    }

    if (deps.variant.usePromptOptimizer) {
      context.use(promptOptimizerPlugin)
    }

    context.use(createFileToolsPlugin({ rootDir: deps.workspaceRoot }))
    context.use(createShellToolsPlugin({ rootDir: deps.workspaceRoot }))
    context.use(
      createAgentLoopPlugin({
        maxModelRounds: deps.maxModelRounds,
        maxToolCalls: deps.maxToolCalls,
        timeoutMs: deps.timeoutMs,
      }),
    )

    return context
  } catch (error: unknown) {
    context.dispose()
    throw error
  }
}

/** 按配置创建模型插件。 */
function createModelPlugin(
  model: BenchmarkOptions['model'],
  task: BenchmarkTask,
  variant: HarnessVariant,
): MiniPlugin {
  switch (model) {
    case 'sim':
      return createSimModelPlugin({
        task,
        hasContextManager: variant.useContextManager,
        hasPromptOptimizer: variant.usePromptOptimizer,
      })
    case 'mock':
      return createMockModelPlugin()
    case 'deepseek':
      return createDeepSeekModelPlugin()
  }
}

/**
 * 生成一个干净的任务 workspace。
 *
 * @param task - Benchmark 任务。
 * @param workspaceDir - workspace 目录。
 * @returns workspace 根目录。
 */
function materializeWorkspace(
  task: BenchmarkTask,
  workspaceDir: string,
): string {
  rmSync(workspaceDir, { force: true, recursive: true })
  mkdirSync(workspaceDir, { recursive: true })

  const files: Record<string, string> = {
    // 保证 fixture 中的 ESM 文件按 Node ESM 规则执行。
    'package.json': '{ "type": "module" }\n',
    ...task.files,
  }

  for (const [path, content] of Object.entries(files)) {
    const target = join(workspaceDir, path)
    mkdirSync(dirname(target), { recursive: true })
    writeFileSync(target, content, 'utf8')
  }

  return workspaceDir
}

/** 按变体汇总全部任务指标。 */
export function summarize(
  variants: readonly HarnessVariant[],
  results: readonly TaskRunResult[],
): readonly VariantSummary[] {
  return variants.map((variant) => {
    const runs = results.filter(
      (result) => result.variant === variant.name,
    )
    const passedTasks = runs.filter((result) => result.passed).length
    const total = runs.length

    return {
      variant: variant.name,
      label: variant.label,
      description: variant.description,
      totalTasks: total,
      passedTasks,
      successRate: total === 0 ? 0 : passedTasks / total,
      avgModelRounds: average(runs, (run) => run.metrics.modelRounds),
      avgToolCalls: average(runs, (run) => run.metrics.toolCalls),
      avgToolErrors: average(runs, (run) => run.metrics.toolErrors),
      avgTotalTokens: average(runs, (run) => run.metrics.totalTokens),
      avgLatencyMs: average(runs, (run) => run.metrics.latencyMs),
    }
  })
}

/** 计算平均值（保留两位小数）。 */
function average(
  runs: readonly TaskRunResult[],
  select: (run: TaskRunResult) => number,
): number {
  if (runs.length === 0) {
    return 0
  }

  const sum = runs.reduce((total, run) => total + select(run), 0)
  return Math.round((sum / runs.length) * 100) / 100
}
