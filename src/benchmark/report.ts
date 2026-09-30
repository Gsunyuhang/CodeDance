import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type {
  BenchmarkOptions,
  TaskRunResult,
  VariantSummary,
} from './types.js'

/**
 * 渲染控制台汇总表。
 *
 * 包含 6 类指标：成功率、Model Rounds、Tool Calls、Tool Errors、
 * Tokens、Latency。
 *
 * @param summaries - 各变体汇总。
 * @returns 表格文本。
 */
export function renderSummaryTable(
  summaries: readonly VariantSummary[],
): string {
  const header = [
    'Variant',
    'Success',
    'ModelRounds',
    'ToolCalls',
    'ToolErrors',
    'Tokens',
    'Latency(ms)',
  ]
  const rows = summaries.map((summary) => [
    summary.label,
    `${summary.passedTasks}/${summary.totalTasks} (${formatPercent(summary.successRate)})`,
    summary.avgModelRounds.toFixed(1),
    summary.avgToolCalls.toFixed(1),
    summary.avgToolErrors.toFixed(1),
    summary.avgTotalTokens.toFixed(0),
    summary.avgLatencyMs.toFixed(0),
  ])

  return renderTable(header, rows)
}

/**
 * 渲染任务 x 变体的成功矩阵。
 *
 * @param results - 全部运行结果。
 * @param variantNames - 变体顺序。
 * @returns 表格文本。
 */
export function renderTaskMatrix(
  results: readonly TaskRunResult[],
  variantNames: readonly string[],
): string {
  const taskIds = [...new Set(results.map((result) => result.taskId))]
  const header = ['Task', ...variantNames]
  const rows = taskIds.map((taskId) => [
    taskId,
    ...variantNames.map((variantName) => {
      const result = results.find(
        (item) => item.taskId === taskId && item.variant === variantName,
      )
      return result === undefined ? '-' : result.passed ? 'PASS' : 'FAIL'
    }),
  ])

  return renderTable(header, rows)
}

/**
 * 生成 Markdown 实验报告。
 *
 * @param summaries - 各变体汇总。
 * @param results - 全部运行结果。
 * @param options - 实验配置。
 * @returns Markdown 文本。
 */
export function renderMarkdownReport(
  summaries: readonly VariantSummary[],
  results: readonly TaskRunResult[],
  options: Pick<BenchmarkOptions, 'model' | 'maxModelRounds' | 'maxToolCalls' | 'timeoutMs'>,
): string {
  const variantNames = summaries.map((summary) => summary.variant)
  const lines: string[] = []

  lines.push('# CodeDance Benchmark 消融实验报告')
  lines.push('')
  lines.push(`- 模型来源：\`${options.model}\``)
  lines.push(
    `- 统一预算：maxModelRounds=${options.maxModelRounds}，` +
      `maxToolCalls=${options.maxToolCalls}，timeoutMs=${options.timeoutMs}`,
  )
  lines.push('- 统一权限：全部工具调用自动授权（allow-session）')
  lines.push(`- 生成时间：${new Date().toISOString()}`)
  lines.push('')

  if (options.model === 'sim') {
    lines.push(
      '> 注意：`sim` 是离线模拟模型。工具执行、workspace 状态、',
    )
    lines.push(
      '> 测试命令与 Evaluator 评测全部真实运行，Token 用量按真实',
    )
    lines.push(
      '> 模型请求内容估算；模型本身的“成败模式”由任务的消融规则',
    )
    lines.push(
      '> （needs-prompt-optimizer / needs-context-manager / needs-both /',
    )
    lines.push(
      '> fail-always）脚本驱动，用于验证评测与统计管线。',
    )
    lines.push(
      '> 真实 LLM 实验请使用 `--model deepseek`（需 DEEPSEEK_API_KEY）。',
    )
    lines.push('')
  }

  lines.push('## 汇总指标（6 类）')
  lines.push('')
  lines.push(
    '| Variant | Success Rate | Model Rounds | Tool Calls | Tool Errors | Tokens | Latency (ms) |',
  )
  lines.push('| --- | --- | --- | --- | --- | --- | --- |')
  for (const summary of summaries) {
    lines.push(
      `| ${summary.label} ` +
        `| ${summary.passedTasks}/${summary.totalTasks} (${formatPercent(summary.successRate)}) ` +
        `| ${summary.avgModelRounds.toFixed(1)} ` +
        `| ${summary.avgToolCalls.toFixed(1)} ` +
        `| ${summary.avgToolErrors.toFixed(1)} ` +
        `| ${summary.avgTotalTokens.toFixed(0)} ` +
        `| ${summary.avgLatencyMs.toFixed(0)} |`,
    )
  }
  lines.push('')

  lines.push('## 任务 x 变体 成败矩阵')
  lines.push('')
  lines.push(`| Task | ${variantNames.join(' | ')} |`)
  lines.push(`| --- | ${variantNames.map(() => '---').join(' | ')} |`)
  const taskIds = [...new Set(results.map((result) => result.taskId))]
  for (const taskId of taskIds) {
    const cells = variantNames.map((variantName) => {
      const result = results.find(
        (item) => item.taskId === taskId && item.variant === variantName,
      )
      return result === undefined ? '-' : result.passed ? 'PASS' : 'FAIL'
    })
    lines.push(`| ${taskId} | ${cells.join(' | ')} |`)
  }
  lines.push('')

  lines.push('## 失败明细')
  lines.push('')
  const failures = results.filter((result) => !result.passed)
  if (failures.length === 0) {
    lines.push('全部任务通过。')
  } else {
    for (const failure of failures) {
      lines.push(
        `- **${failure.variant} / ${failure.taskId}**：` +
          `${failure.failureReason ?? 'checks failed'}`,
      )
    }
  }
  lines.push('')

  return lines.join('\n')
}

/**
 * 把实验结果写入输出目录。
 *
 * @param outputDir - 输出目录。
 * @param summaries - 各变体汇总。
 * @param results - 全部运行结果。
 * @param options - 实验配置。
 * @returns 写入的文件路径。
 */
export function writeReports(
  outputDir: string,
  summaries: readonly VariantSummary[],
  results: readonly TaskRunResult[],
  options: Pick<BenchmarkOptions, 'model' | 'maxModelRounds' | 'maxToolCalls' | 'timeoutMs'>,
): { readonly jsonPath: string; readonly markdownPath: string } {
  mkdirSync(outputDir, { recursive: true })

  const jsonPath = join(outputDir, 'summary.json')
  const markdownPath = join(outputDir, 'summary.md')

  writeFileSync(
    jsonPath,
    `${JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        config: {
          model: options.model,
          maxModelRounds: options.maxModelRounds,
          maxToolCalls: options.maxToolCalls,
          timeoutMs: options.timeoutMs,
        },
        summaries,
        results,
      },
      null,
      2,
    )}\n`,
    'utf8',
  )

  writeFileSync(
    markdownPath,
    renderMarkdownReport(summaries, results, options),
    'utf8',
  )

  return { jsonPath, markdownPath }
}

/** 渲染等宽文本表格。 */
function renderTable(
  header: readonly string[],
  rows: readonly (readonly string[])[],
): string {
  const widths = header.map((title, index) =>
    Math.max(
      title.length,
      ...rows.map((row) => (row[index] ?? '').length),
    ),
  )

  const formatRow = (cells: readonly string[]): string =>
    cells
      .map((cell, index) => cell.padEnd(widths[index] ?? cell.length))
      .join('  ')
      .trimEnd()

  return [
    formatRow(header),
    widths.map((width) => '-'.repeat(width)).join('  '),
    ...rows.map(formatRow),
  ].join('\n')
}

/** 格式化百分比。 */
function formatPercent(value: number): string {
  return `${(value * 100).toFixed(0)}%`
}
