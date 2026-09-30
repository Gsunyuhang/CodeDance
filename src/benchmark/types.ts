/**
 * Benchmark 与消融实验的共享类型。
 *
 * 一个 Benchmark 任务由四部分组成：
 *
 * - workspace 初始文件（fixture）；
 * - 用户任务提示词；
 * - 自动 Evaluator 的检查项；
 * - 离线模拟模型的执行脚本（仅 `--model sim` 使用）。
 */

/** Benchmark 任务类别。 */
export type TaskCategory =
  | 'code-understanding'
  | 'bug-fix'
  | 'feature'
  | 'refactor'
  | 'test-writing'

/** 模拟模型脚本中的一个工具调用。 */
export interface SimToolCall {
  readonly name: string
  readonly arguments: Record<string, unknown>
}

/**
 * 模拟模型脚本中的一步。
 *
 * 一步对应一次模型响应：要么发起一组工具调用，要么给出最终回答。
 */
export type SimStep =
  | { readonly kind: 'calls'; readonly calls: readonly SimToolCall[] }
  | { readonly kind: 'answer'; readonly content: string }

/**
 * 任务在消融条件下的成败规则。
 *
 * - `pass-always`：所有变体都应通过；
 * - `needs-prompt-optimizer`：需求模糊，缺少 Prompt Optimizer 时理解偏差；
 * - `needs-context-manager`：长程任务，缺少 Context Manager 时上下文膨胀失焦；
 * - `needs-both`：同时受两种机制影响；
 * - `fail-always`：超出模拟模型能力，所有变体都失败。
 */
export type SimOutcomeRule =
  | 'pass-always'
  | 'needs-prompt-optimizer'
  | 'needs-context-manager'
  | 'needs-both'
  | 'fail-always'

/** 离线模拟模型在一个任务上的行为设定。 */
export interface TaskSimulation {
  /** 成败规则。 */
  readonly outcome: SimOutcomeRule

  /** 成功路径脚本。 */
  readonly success: readonly SimStep[]

  /**
   * 缺少 Prompt Optimizer 时（需求理解偏差）走的失败脚本。
   *
   * 不提供时使用 failure。
   */
  readonly failureAmbiguous?: readonly SimStep[]

  /**
   * 缺少 Context Manager 时（上下文膨胀、执行失焦）走的失败脚本。
   *
   * 不提供时使用 failure。
   */
  readonly failureDistracted?: readonly SimStep[]

  /** 失败路径脚本，也是 fail-always 任务的唯一脚本。 */
  readonly failure: readonly SimStep[]

  /** 需求是否模糊（无 Prompt Optimizer 时会产生理解偏差）。 */
  readonly ambiguous: boolean

  /** 是否长程任务（无 Context Manager 时上下文膨胀、执行失焦）。 */
  readonly longHorizon: boolean

  /** Prompt Optimizer 生成的澄清版提示词（模拟）。 */
  readonly optimizedPrompt: string
}

/**
 * 自动 Evaluator 的一个检查项。
 *
 * 检查全部通过才算任务成功。
 */
export type TaskCheck =
  | { readonly kind: 'file-exists'; readonly path: string }
  | {
      readonly kind: 'file-contains'
      readonly path: string
      /** 正则表达式。 */
      readonly pattern: string
    }
  | {
      readonly kind: 'file-not-contains'
      readonly path: string
      readonly pattern: string
    }
  | {
      /** 最终回答必须命中的全部正则。 */
      readonly kind: 'answer-contains'
      readonly patterns: readonly string[]
    }
  | {
      /** 在 workspace 中执行命令，退出码为 0 才算通过。 */
      readonly kind: 'command-succeeds'
      readonly command: string
    }
  | {
      /** 测试文件中 test( 用例数量下限。 */
      readonly kind: 'test-count'
      readonly path: string
      readonly min: number
    }

/** 一个 Benchmark 任务。 */
export interface BenchmarkTask {
  /** 任务 id，例如 T01。 */
  readonly id: string

  /** 任务类别。 */
  readonly category: TaskCategory

  /** 任务标题。 */
  readonly title: string

  /** 用户任务提示词。 */
  readonly prompt: string

  /** workspace 初始文件：相对路径 -> 文件内容。 */
  readonly files: Readonly<Record<string, string>>

  /** 自动评测检查项。 */
  readonly checks: readonly TaskCheck[]

  /** 离线模拟模型的行为设定。 */
  readonly sim: TaskSimulation
}

/** 消融实验的 Harness 变体。 */
export type VariantName =
  | 'baseline'
  | 'context-manager'
  | 'prompt-optimizer'
  | 'full'

/** Harness 变体定义。 */
export interface HarnessVariant {
  readonly name: VariantName

  /** 展示名称。 */
  readonly label: string

  /** 是否启用 Context Manager 压缩插件。 */
  readonly useContextManager: boolean

  /** 是否启用 Prompt Optimizer。 */
  readonly usePromptOptimizer: boolean

  /** 变体说明。 */
  readonly description: string
}

/** 一次 Agent Run 的运行指标。 */
export interface RunMetrics {
  /** 模型请求轮次。 */
  readonly modelRounds: number

  /** 工具调用次数。 */
  readonly toolCalls: number

  /** 工具执行失败次数。 */
  readonly toolErrors: number

  /** 模型请求侧 Token 总量。 */
  readonly promptTokens: number

  /** 模型输出侧 Token 总量。 */
  readonly completionTokens: number

  /** Token 总量。 */
  readonly totalTokens: number

  /** Agent Run 端到端耗时。 */
  readonly latencyMs: number

  /** Run 的结束状态。 */
  readonly status: 'completed' | 'budget-exceeded' | 'error'
}

/** 单个检查项的评测结果。 */
export interface CheckResult {
  readonly check: TaskCheck
  readonly passed: boolean
  /** 失败原因或补充信息。 */
  readonly detail: string
}

/** 一次（变体 x 任务）运行的结果。 */
export interface TaskRunResult {
  readonly variant: VariantName
  readonly taskId: string
  readonly passed: boolean
  readonly metrics: RunMetrics
  readonly checkResults: readonly CheckResult[]
  /** 未通过时的简要原因。 */
  readonly failureReason?: string
}

/** 一个变体在全部任务上的汇总指标。 */
export interface VariantSummary {
  readonly variant: VariantName
  readonly label: string
  readonly description: string
  readonly totalTasks: number
  readonly passedTasks: number
  /** 成功率，0 到 1。 */
  readonly successRate: number
  readonly avgModelRounds: number
  readonly avgToolCalls: number
  readonly avgToolErrors: number
  readonly avgTotalTokens: number
  readonly avgLatencyMs: number
}

/** Benchmark 运行配置。 */
export interface BenchmarkOptions {
  /** 模型来源：sim 为离线模拟模型，deepseek 为真实模型。 */
  readonly model: 'sim' | 'mock' | 'deepseek'

  /** 参与实验的变体。 */
  readonly variants: readonly VariantName[]

  /** 参与实验的任务 id；不传表示全部 20 个。 */
  readonly taskIds?: readonly string[]

  /** 结果输出目录。 */
  readonly outputDir: string

  /** 最大模型请求轮次预算。 */
  readonly maxModelRounds: number

  /** 最大工具调用数预算。 */
  readonly maxToolCalls: number

  /** 单次任务超时毫秒。 */
  readonly timeoutMs: number

  /** 每次运行的进度回调。 */
  readonly onRun?: (result: TaskRunResult) => void
}
