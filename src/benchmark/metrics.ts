import type { MiniPlugin } from '../plugin.js'
import { estimateTokens } from '../plugins/context-manager-plugin.js'
import type { AgentEventService } from '../services/events.js'
import type {
  ModelRequest,
  ModelResponse,
  ModelService,
  ModelUsage,
} from '../services/model.js'
import type { RunMetrics } from './types.js'

/**
 * 模型调用级 Token 计数器。
 *
 * 统计一次 Agent Run 中全部模型调用的 Token 用量，包括
 * Agent Loop 的每轮请求、Prompt Optimizer 的改写请求和
 * Context Manager 的摘要请求，保证消融对比的公平性。
 */
export class ModelCallTracker {
  /** 模型调用次数。 */
  calls = 0

  /** 请求侧 Token 总量。 */
  promptTokens = 0

  /** 输出侧 Token 总量。 */
  completionTokens = 0

  /** Token 总量。 */
  totalTokens = 0

  /** 记录一次模型调用的用量。 */
  record(usage: ModelUsage): void {
    this.calls += 1
    this.promptTokens += usage.promptTokens
    this.completionTokens += usage.completionTokens
    this.totalTokens += usage.totalTokens
  }
}

/**
 * 用跟踪器包装一个 Model Service。
 *
 * @param model - 被包装的模型服务。
 * @param tracker - Token 计数器。
 * @returns 记录用量的模型服务。
 */
export function wrapModelService(
  model: ModelService,
  tracker: ModelCallTracker,
): ModelService {
  return {
    async complete(request: ModelRequest): Promise<ModelResponse> {
      const response = await model.complete(request)
      tracker.record(
        response.usage ?? estimateUsage(request, response),
      )
      return response
    },
  }
}

/**
 * 创建在 setup 时包装内层模型插件的插件。
 *
 * 内层插件负责创建真实模型服务，本插件把注册到 `model`
 * 的服务替换为带 Token 计数的包装版本。因此内层模型插件
 * 只允许注册 `model` 服务本身，不允许持有其他资源。
 *
 * @param inner - 内层模型插件。
 * @param tracker - Token 计数器。
 * @returns 包装后的模型插件。
 */
export function createTrackedModelPlugin(
  inner: MiniPlugin,
  tracker: ModelCallTracker,
): MiniPlugin {
  return {
    name: 'model-tracked',

    setup(context) {
      const disposeInner = inner.setup(context)

      if (typeof disposeInner !== 'function') {
        throw new Error(
          'tracked model plugin requires the inner model plugin ' +
            'to register its service with a disposer',
        )
      }

      const model = context.get<ModelService>('model')

      // 先注销内层服务，再注册包装版本。
      disposeInner()

      return context.provide(
        'model',
        wrapModelService(model, tracker),
      )
    },
  }
}

/**
 * 事件级运行指标收集器。
 *
 * 从 Agent 事件总线统计：
 *
 * - 模型请求轮次（Agent Loop 内的 model-request-start）；
 * - 工具调用数与工具失败数（tool-end）。
 */
export class RunMetricsCollector {
  private modelRounds = 0
  private toolCalls = 0
  private toolErrors = 0

  /**
   * 订阅 Agent 事件。
   *
   * @param events - Agent 事件服务。
   * @returns 取消订阅函数。
   */
  subscribe(events: AgentEventService): () => void {
    return events.subscribe((event) => {
      switch (event.type) {
        case 'model-request-start':
          this.modelRounds += 1
          return
        case 'tool-end':
          this.toolCalls += 1
          if (event.status === 'error') {
            this.toolErrors += 1
          }
          return
        default:
          return
      }
    })
  }

  /**
   * 汇总本次运行的指标。
   *
   * @param tracker - Token 计数器。
   * @param latencyMs - 端到端耗时。
   * @param status - Run 结束状态。
   * @returns 运行指标。
   */
  snapshot(
    tracker: ModelCallTracker,
    latencyMs: number,
    status: RunMetrics['status'],
  ): RunMetrics {
    return {
      modelRounds: this.modelRounds,
      toolCalls: this.toolCalls,
      toolErrors: this.toolErrors,
      promptTokens: tracker.promptTokens,
      completionTokens: tracker.completionTokens,
      totalTokens: tracker.totalTokens,
      latencyMs,
      status,
    }
  }
}

/** 在模型未提供 usage 时按请求内容估算 Token。 */
function estimateUsage(
  request: ModelRequest,
  response: ModelResponse,
): ModelUsage {
  const promptTokens = estimateTokens(JSON.stringify({
    systemPrompt: request.systemPrompt,
    messages: request.messages,
    tools: request.tools,
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
