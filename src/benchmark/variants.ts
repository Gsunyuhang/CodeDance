import type { MiniPlugin } from '../plugin.js'
import {
  DEFAULT_CONTEXT_MAX_TOKENS,
  estimateTokens,
} from '../plugins/context-manager-plugin.js'
import type {
  ContextBuildOptions,
  ContextManagerService,
  ContextSnapshot,
  ContextUsage,
} from '../services/context-manager.js'
import type { SessionMessage, SessionService } from '../services/session.js'
import type { ToolSchema, ToolsService } from '../services/tools.js'
import type { HarnessVariant, VariantName } from './types.js'

/**
 * 消融实验的四个 Harness 变体。
 *
 * 四个变体共享同一套 Session、工具、权限和执行预算，只替换
 * Context Manager 插件和是否调用 Prompt Optimizer：
 *
 * | 变体 | Context Manager | Prompt Optimizer |
 * | --- | --- | --- |
 * | baseline | 透传（不压缩） | 否 |
 * | context-manager | 摘要压缩 | 否 |
 * | prompt-optimizer | 透传（不压缩） | 是 |
 * | full | 摘要压缩 | 是 |
 */
export const HARNESS_VARIANTS: Readonly<
  Record<VariantName, HarnessVariant>
> = {
  baseline: {
    name: 'baseline',
    label: 'Baseline',
    useContextManager: false,
    usePromptOptimizer: false,
    description: '完整历史直接发送，原始用户输入直接执行',
  },
  'context-manager': {
    name: 'context-manager',
    label: '+Context Manager',
    useContextManager: true,
    usePromptOptimizer: false,
    description: '80% 阈值摘要压缩 + 保留最近 12 条 + 截断大工具结果',
  },
  'prompt-optimizer': {
    name: 'prompt-optimizer',
    label: '+Prompt Optimizer',
    useContextManager: false,
    usePromptOptimizer: true,
    description: '模糊需求先改写为清晰 Worker 提示词，历史不压缩',
  },
  full: {
    name: 'full',
    label: 'Full Harness',
    useContextManager: true,
    usePromptOptimizer: true,
    description: 'Context Manager 与 Prompt Optimizer 同时启用',
  },
}

/** 全部变体名，按消融顺序排列。 */
export const VARIANT_ORDER: readonly VariantName[] = [
  'baseline',
  'context-manager',
  'prompt-optimizer',
  'full',
]

/**
 * 透传 Context Manager 插件（Baseline 消融）。
 *
 * 它提供和真实 Context Manager 相同的 `context-manager` service，
 * 但不做任何压缩：完整 Session 历史原样发送给模型。这正是
 * “插件可独立替换而无需修改执行循环”的消融用法——Agent Loop
 * 不感知差异，只有上下文投影策略不同。
 *
 * @returns 提供 `context-manager` service 的透传插件。
 */
export function createNaiveContextManagerPlugin(): MiniPlugin {
  return {
    name: 'context-manager-naive',
    dependencies: ['session', 'tools'],

    setup(context) {
      const session = context.get<SessionService>('session')
      const tools = context.get<ToolsService>('tools')
      let latest: ContextSnapshot | undefined

      const service: ContextManagerService = {
        async build(
          options: ContextBuildOptions = {},
        ): Promise<ContextSnapshot> {
          const messages = session.messages()
          const toolSchemas = tools.schemas()
          const snapshot = createSnapshot(
            options,
            messages,
            toolSchemas,
          )
          latest = snapshot
          return snapshot
        },

        current(): ContextSnapshot | undefined {
          return latest
        },

        async compact(
          options: ContextBuildOptions = {},
        ): Promise<ContextSnapshot> {
          return this.build(options)
        },
      }

      return context.provide<ContextManagerService>(
        'context-manager',
        service,
      )
    },
  }
}

/** 构建不做任何压缩的上下文快照。 */
function createSnapshot(
  options: ContextBuildOptions,
  messages: readonly SessionMessage[],
  tools: readonly ToolSchema[],
): ContextSnapshot {
  const systemPromptTokens = estimateTokens(options.systemPrompt ?? '')
  const messageTokens = estimateTokens(JSON.stringify(messages))
  const toolTokens = estimateTokens(JSON.stringify(tools))
  const taskTokens = estimateTokens(JSON.stringify({
    taskSpecification: options.taskSpecification,
    taskProgress: options.taskProgress,
  }))
  const estimatedTokens =
    systemPromptTokens + messageTokens + toolTokens + taskTokens

  const usage: ContextUsage = {
    estimatedTokens,
    maxTokens: DEFAULT_CONTEXT_MAX_TOKENS,
    usageRatio: estimatedTokens / DEFAULT_CONTEXT_MAX_TOKENS,
    systemPromptTokens,
    messageTokens,
    toolTokens,
    taskTokens,
    originalMessageCount: messages.length,
    includedMessageCount: messages.length,
    compacted: false,
  }

  return {
    ...(options.systemPrompt === undefined
      ? {}
      : { systemPrompt: options.systemPrompt }),
    messages,
    tools,
    ...(options.taskSpecification === undefined
      ? {}
      : { taskSpecification: options.taskSpecification }),
    ...(options.taskProgress === undefined
      ? {}
      : { taskProgress: options.taskProgress }),
    usage,
  }
}
