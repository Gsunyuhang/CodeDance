import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { runBenchmark } from './runner.js'
import {
  renderSummaryTable,
  renderTaskMatrix,
  writeReports,
} from './report.js'
import { BENCHMARK_TASKS } from './tasks.js'
import { VARIANT_ORDER } from './variants.js'
import type {
  BenchmarkOptions,
  TaskRunResult,
  VariantName,
} from './types.js'

/** 默认模型来源：离线模拟模型。 */
const DEFAULT_MODEL: BenchmarkOptions['model'] = 'sim'

/** 默认输出目录。 */
const DEFAULT_OUTPUT_DIR = 'benchmark-results'

/** 与 Agent Loop 默认一致的统一预算。 */
const DEFAULT_MAX_MODEL_ROUNDS = 64
const DEFAULT_MAX_TOOL_CALLS = 128
const DEFAULT_TIMEOUT_MS = 10 * 60 * 1000

/**
 * Benchmark CLI 入口。
 *
 * 用法：
 *
 * ```text
 * npm run benchmark                       # 离线模拟模型跑全部 20 任务 x 4 变体
 * npm run benchmark -- --model deepseek   # 真实 DeepSeek 实验（需 DEEPSEEK_API_KEY）
 * npm run benchmark -- --tasks T01,T05    # 只跑部分任务
 * npm run benchmark -- --variants baseline,full
 * ```
 *
 * @param args - 命令行参数。
 */
export async function runBenchmarkCli(
  args: readonly string[],
): Promise<void> {
  const options = parseArgs(args)

  if (options.help) {
    printHelp()
    return
  }

  process.stdout.write(
    `benchmark: model=${options.model} ` +
      `variants=${options.variants.join(',')} ` +
      `tasks=${options.taskIds?.join(',') ?? 'all'} ` +
      `output=${options.outputDir}\n\n`,
  )

  if (options.model === 'deepseek') {
    const apiKey = process.env.DEEPSEEK_API_KEY
    if (apiKey === undefined || apiKey.trim().length === 0) {
      throw new Error(
        '--model deepseek requires DEEPSEEK_API_KEY; ' +
          'use --model sim for the offline pipeline run',
      )
    }
  }

  const run = await runBenchmark({
    ...options,
    onRun: (result) => printRunLine(result),
  })

  process.stdout.write(`\n${renderSummaryTable(run.summaries)}\n\n`)
  process.stdout.write(
    `${renderTaskMatrix(
      run.results,
      run.summaries.map((summary) => summary.variant),
    )}\n\n`,
  )

  const paths = writeReports(options.outputDir, run.summaries, run.results, {
    model: options.model,
    maxModelRounds: options.maxModelRounds,
    maxToolCalls: options.maxToolCalls,
    timeoutMs: options.timeoutMs,
  })

  process.stdout.write(`report: ${paths.markdownPath}\n`)
  process.stdout.write(`json:   ${paths.jsonPath}\n`)
}

/** CLI 解析结果。 */
interface BenchmarkCliOptions extends BenchmarkOptions {
  readonly help: boolean
  readonly outputDir: string
}

/** 解析命令行参数。 */
function parseArgs(args: readonly string[]): BenchmarkCliOptions {
  let model: BenchmarkOptions['model'] = DEFAULT_MODEL
  let variants: readonly VariantName[] = VARIANT_ORDER
  let taskIds: readonly string[] | undefined
  let outputDir = DEFAULT_OUTPUT_DIR
  let maxModelRounds = DEFAULT_MAX_MODEL_ROUNDS
  let maxToolCalls = DEFAULT_MAX_TOOL_CALLS
  let timeoutMs = DEFAULT_TIMEOUT_MS
  let help = false

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]

    if (arg === '--help' || arg === '-h') {
      help = true
      continue
    }

    if (arg === '--model') {
      model = parseModel(requireNext(args, index, arg))
      index += 1
      continue
    }

    if (arg.startsWith('--model=')) {
      model = parseModel(valueAfterEquals(arg, '--model'))
      continue
    }

    if (arg === '--variants') {
      variants = parseVariants(requireNext(args, index, arg))
      index += 1
      continue
    }

    if (arg.startsWith('--variants=')) {
      variants = parseVariants(valueAfterEquals(arg, '--variants'))
      continue
    }

    if (arg === '--tasks') {
      taskIds = parseTasks(requireNext(args, index, arg))
      index += 1
      continue
    }

    if (arg.startsWith('--tasks=')) {
      taskIds = parseTasks(valueAfterEquals(arg, '--tasks'))
      continue
    }

    if (arg === '--out') {
      outputDir = requireNext(args, index, arg)
      index += 1
      continue
    }

    if (arg.startsWith('--out=')) {
      outputDir = valueAfterEquals(arg, '--out')
      continue
    }

    if (arg === '--max-model-rounds') {
      maxModelRounds = parsePositiveInt(
        requireNext(args, index, arg),
        arg,
      )
      index += 1
      continue
    }

    if (arg === '--max-tool-calls') {
      maxToolCalls = parsePositiveInt(
        requireNext(args, index, arg),
        arg,
      )
      index += 1
      continue
    }

    if (arg === '--timeout-ms') {
      timeoutMs = parsePositiveInt(requireNext(args, index, arg), arg)
      index += 1
      continue
    }

    throw new Error(`unknown option: ${arg}`)
  }

  return {
    model,
    variants,
    ...(taskIds === undefined ? {} : { taskIds }),
    outputDir: resolve(outputDir),
    maxModelRounds,
    maxToolCalls,
    timeoutMs,
    help,
  }
}

/** 解析模型来源。 */
function parseModel(value: string): BenchmarkOptions['model'] {
  if (value === 'sim' || value === 'mock' || value === 'deepseek') {
    return value
  }
  throw new Error(`invalid model "${value}"; use sim, mock, or deepseek`)
}

/** 解析变体列表。 */
function parseVariants(value: string): readonly VariantName[] {
  const names = value
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item.length > 0)

  for (const name of names) {
    if (!VARIANT_ORDER.includes(name as VariantName)) {
      throw new Error(
        `invalid variant "${name}"; use ${VARIANT_ORDER.join(', ')}`,
      )
    }
  }

  return names as VariantName[]
}

/** 解析任务 id 列表。 */
function parseTasks(value: string): readonly string[] {
  const ids = value
    .split(',')
    .map((item) => item.trim().toUpperCase())
    .filter((item) => item.length > 0)

  for (const id of ids) {
    if (!BENCHMARK_TASKS.some((task) => task.id === id)) {
      throw new Error(`unknown task id "${id}"`)
    }
  }

  return ids
}

/** 打印单次运行结果。 */
function printRunLine(result: TaskRunResult): void {
  const mark = result.passed ? 'PASS' : 'FAIL'
  process.stdout.write(
    `  [${result.variant.padEnd(15)}] ${result.taskId} ${mark}  ` +
      `rounds=${result.metrics.modelRounds} ` +
      `tools=${result.metrics.toolCalls}(err ${result.metrics.toolErrors}) ` +
      `tokens=${result.metrics.totalTokens} ` +
      `${result.metrics.latencyMs}ms\n`,
  )
}

/** 打印帮助。 */
function printHelp(): void {
  process.stdout.write(
    [
      'CodeDance benchmark usage:',
      '',
      '  npm run benchmark',
      '  npm run benchmark -- --model sim --tasks T01,T05',
      '  npm run benchmark -- --model deepseek',
      '',
      'options:',
      '  --model <sim|mock|deepseek>  model source (default: sim)',
      '  --variants <csv>             subset of variants',
      `                               (default: ${VARIANT_ORDER.join(',')})`,
      '  --tasks <csv>                task ids, e.g. T01,T02',
      '  --out <dir>                  output directory (default: benchmark-results)',
      '  --max-model-rounds N         unified model round budget',
      '  --max-tool-calls N           unified tool call budget',
      '  --timeout-ms N               unified per-task timeout',
      '  --help                       show this help',
      '',
    ].join('\n'),
  )
}

/** 获取下一个参数。 */
function requireNext(
  args: readonly string[],
  index: number,
  option: string,
): string {
  const value = args[index + 1]
  if (value === undefined || value.trim().length === 0) {
    throw new Error(`${option} requires a value`)
  }
  return value
}

/** 获取等号后的参数值。 */
function valueAfterEquals(arg: string, option: string): string {
  const value = arg.slice(arg.indexOf('=') + 1)
  if (value.trim().length === 0) {
    throw new Error(`${option} requires a value`)
  }
  return value
}

/** 解析正整数。 */
function parsePositiveInt(value: string, option: string): number {
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`${option} must be a positive integer`)
  }
  return parsed
}

/** 仅在该文件被直接执行时启动 CLI。 */
const currentModulePath = resolve(fileURLToPath(import.meta.url))
const invokedModulePath =
  process.argv[1] === undefined ? undefined : resolve(process.argv[1])

if (
  invokedModulePath !== undefined &&
  invokedModulePath === currentModulePath
) {
  void runBenchmarkCli(process.argv.slice(2)).catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error)
    process.stderr.write(`fatal: ${message}\n`)
    process.exitCode = 1
  })
}
