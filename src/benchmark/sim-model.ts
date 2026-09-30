import type { MiniPlugin } from '../plugin.js'
import { estimateTokens } from '../plugins/context-manager-plugin.js'
import type {
  ModelRequest,
  ModelResponse,
  ModelService,
  ModelToolCall,
  ModelUsage,
} from '../services/model.js'
import type {
  BenchmarkTask,
  SimStep,
  SimToolCall,
  TaskSimulation,
} from './types.js'

/**
 * 离线模拟模型（Simulated Coding Model）。
 *
 * 它不是真实 LLM，而是一套确定性的脚本模型，用于在没有
 * DEEPSEEK_API_KEY 的环境里验证 Benchmark、Evaluator、指标采集
 * 与消融统计管线的正确性：
 *
 * - 工具调用会真实执行（真实读写 workspace、真实运行测试）；
 * - Token 用量按真实模型请求内容估算，因此 Context Manager 的
 *   压缩效果会被真实测量；
 * - 脚本化的“成败模式”按任务的消融规则（needs-prompt-optimizer /
 *   needs-context-manager / needs-both / fail-always）驱动，
 *   真实实验请使用 `--model deepseek`。
 *
 * 模拟模型响应三类系统指令：
 *
 * - Prompt Optimizer：返回任务预置的澄清版提示词；
 * - 历史摘要：返回简短摘要；
 * - Worker：按任务脚本逐步发出工具调用或最终回答。
 */
export class SimModelService implements ModelService {
  /** Worker 脚本（含噪声注入），首次 Worker 请求时构建。 */
  private steps: readonly SimStep[] | undefined

  /** 当前执行到的脚本步。 */
  private stepIndex = 0

  /** 全局工具调用计数，用于生成稳定的工具调用 id。 */
  private callIndex = 0

  /**
   * @param task - 当前 Benchmark 任务。
   * @param hasContextManager - 当前变体是否启用 Context Manager。
   * @param hasPromptOptimizer - 当前变体是否启用 Prompt Optimizer。
   */
  constructor(
    private readonly task: BenchmarkTask,
    private readonly hasContextManager: boolean,
    private readonly hasPromptOptimizer: boolean,
  ) {}

  /** 请求模拟模型。 */
  async complete(request: ModelRequest): Promise<ModelResponse> {
    throwIfAborted(request.signal)

    const systemPrompt = request.systemPrompt ?? ''

    if (systemPrompt.includes('lightweight Prompt Optimizer')) {
      return withUsage(
        {
          kind: 'final',
          content: this.task.sim.optimizedPrompt,
        },
        request,
      )
    }

    if (systemPrompt.includes('summarize historical coding-agent')) {
      return withUsage(
        {
          kind: 'final',
          content:
            'EARLIER SUMMARY: the agent inspected workspace files and ' +
            'performed the requested edits; remaining work is to verify ' +
            'the final state against the original request.',
        },
        request,
      )
    }

    return withUsage(this.nextWorkerStep(), request)
  }

  /** 生成 Worker 的下一次响应。 */
  private nextWorkerStep(): ModelResponse {
    if (this.steps === undefined) {
      this.steps = injectNoise(
        selectPlan(
          this.task.sim,
          this.hasPromptOptimizer,
          this.hasContextManager,
        ),
        this.task.sim.ambiguous && !this.hasPromptOptimizer,
        this.task.sim.longHorizon && !this.hasContextManager,
        () => this.readFirstFixturePath(),
      )
    }

    const step = this.steps[this.stepIndex]

    if (step === undefined) {
      // 脚本执行完仍未给出最终回答时兜底结束，避免死循环。
      return {
        kind: 'final',
        content: '任务已完成。',
      }
    }

    this.stepIndex += 1

    if (step.kind === 'answer') {
      return { kind: 'final', content: step.content }
    }

    return {
      kind: 'tool-call',
      calls: step.calls.map((call) => this.toModelToolCall(call)),
    }
  }

  /** 把脚本工具调用转换为带 id 的模型工具调用。 */
  private toModelToolCall(call: SimToolCall): ModelToolCall {
    this.callIndex += 1
    return {
      id: `sim-call-${this.callIndex}`,
      name: call.name,
      arguments: structuredClone(call.arguments),
    }
  }

  /** 返回任务 fixture 中的第一个文件路径，用于构造无害的噪声读取。 */
  private readFirstFixturePath(): string {
    const first = Object.keys(this.task.files)[0]
    return first ?? 'src/index.js'
  }
}

/**
 * 选择当前消融条件下的执行脚本。
 *
 * @param sim - 任务模拟设定。
 * @param hasPromptOptimizer - 是否启用 Prompt Optimizer。
 * @param hasContextManager - 是否启用 Context Manager。
 * @returns 执行脚本。
 */
export function selectPlan(
  sim: TaskSimulation,
  hasPromptOptimizer: boolean,
  hasContextManager: boolean,
): readonly SimStep[] {
  switch (sim.outcome) {
    case 'pass-always':
      return sim.success
    case 'needs-prompt-optimizer':
      return hasPromptOptimizer
        ? sim.success
        : sim.failureAmbiguous ?? sim.failure
    case 'needs-context-manager':
      return hasContextManager
        ? sim.success
        : sim.failureDistracted ?? sim.failure
    case 'needs-both':
      if (hasPromptOptimizer && hasContextManager) {
        return sim.success
      }
      // 需求明确但长程失焦。
      if (hasPromptOptimizer) {
        return sim.failureDistracted ?? sim.failure
      }
      // 需求理解偏差（无论是否压缩上下文）。
      return sim.failureAmbiguous ?? sim.failure
    case 'fail-always':
      return sim.failure
  }
}

/**
 * 向脚本中注入噪声轮次和失败工具调用。
 *
 * 这模拟真实模型在需求模糊或上下文膨胀时的低效行为：
 * 重复读取已经看过的文件、调用不存在的路径导致工具报错。
 * 噪声是确定性的，保证实验可复现。
 *
 * @param plan - 原始脚本。
 * @param ambiguousNoise - 是否注入需求模糊噪声。
 * @param distractedNoise - 是否注入上下文膨胀噪声。
 * @param firstFixturePath - 噪声读取使用的 fixture 路径。
 * @returns 注入噪声后的脚本。
 */
export function injectNoise(
  plan: readonly SimStep[],
  ambiguousNoise: boolean,
  distractedNoise: boolean,
  firstFixturePath: () => string,
): readonly SimStep[] {
  const noise: SimStep[] = []

  if (ambiguousNoise) {
    noise.push(
      {
        kind: 'calls',
        calls: [{ name: 'read_file', arguments: { path: firstFixturePath() } }],
      },
      {
        kind: 'calls',
        calls: [{ name: 'read_file', arguments: { path: 'NOTES.md' } }],
      },
    )
  }

  if (distractedNoise) {
    noise.push(
      {
        kind: 'calls',
        calls: [{ name: 'read_file', arguments: { path: firstFixturePath() } }],
      },
      {
        kind: 'calls',
        calls: [{ name: 'read_file', arguments: { path: 'docs/missing.md' } }],
      },
      {
        kind: 'calls',
        calls: [{ name: 'read_file', arguments: { path: 'tmp/scratch.md' } }],
      },
    )
  }

  if (noise.length === 0) {
    return plan
  }

  if (plan.length <= 1) {
    return [...noise, ...plan]
  }

  // 一半噪声插在起步阶段，另一半插在最终回答之前。
  const split = Math.ceil(noise.length / 2)
  const head = noise.slice(0, split)
  const tail = noise.slice(split)
  const last = plan.length - 1

  return [
    ...plan.slice(0, 1),
    ...head,
    ...plan.slice(1, last),
    ...tail,
    plan[last],
  ]
}

/** 为模型响应填充本地估算的 Token 用量。 */
function withUsage(
  response: ModelResponse,
  request: ModelRequest,
): ModelResponse {
  if (response.usage !== undefined) {
    return response
  }

  return { ...response, usage: estimateUsage(request, response) }
}

/** 粗略估算一次模拟请求的 Token 用量。 */
function estimateUsage(
  request: ModelRequest,
  response: ModelResponse,
): ModelUsage {
  const promptTokens = estimateTokens(JSON.stringify({
    systemPrompt: request.systemPrompt,
    messages: request.messages,
    tools: request.tools,
    taskSpecification: request.taskSpecification,
    taskProgress: request.taskProgress,
  }))
  const completionTokens = estimateTokens(
    response.kind === 'final'
      ? response.content
      : JSON.stringify(response.calls),
  )

  return {
    promptTokens,
    completionTokens,
    totalTokens: promptTokens + completionTokens,
  }
}

/** 在模拟请求之间传播取消信号。 */
function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) {
    throw signal.reason instanceof Error
      ? signal.reason
      : new Error('agent run cancelled')
  }
}

/** 模拟模型插件配置。 */
export interface SimModelPluginOptions {
  /** 当前 Benchmark 任务。 */
  readonly task: BenchmarkTask

  /** 当前变体是否启用 Context Manager。 */
  readonly hasContextManager: boolean

  /** 当前变体是否启用 Prompt Optimizer。 */
  readonly hasPromptOptimizer: boolean
}

/**
 * 创建离线模拟模型插件。
 *
 * 每次（变体 x 任务）运行都会创建独立实例，保证脚本状态互不影响。
 *
 * @param options - 模拟模型配置。
 * @returns 提供 `model` service 的插件。
 */
export function createSimModelPlugin(
  options: SimModelPluginOptions,
): MiniPlugin {
  return {
    name: 'model',

    setup(context) {
      const model = new SimModelService(
        options.task,
        options.hasContextManager,
        options.hasPromptOptimizer,
      )

      return context.provide('model', model)
    },
  }
}
