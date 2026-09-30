import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type {
  BenchmarkTask,
  CheckResult,
  TaskCheck,
} from './types.js'

/** 一个任务的评测结果。 */
export interface EvaluationResult {
  /** 全部检查项是否通过。 */
  readonly passed: boolean

  /** 各检查项结果。 */
  readonly results: readonly CheckResult[]

  /** 未通过检查项的简要原因。 */
  readonly failureReason?: string
}

/** 检查命令的超时时间。 */
const COMMAND_TIMEOUT_MS = 60_000

/**
 * 自动评测一个任务的执行结果。
 *
 * 评测只看 workspace 最终状态和 Agent 的最终回答，不看过程：
 *
 * - 文件检查读取 workspace 中的真实文件；
 * - `command-succeeds` 在 workspace 中真实执行命令（例如
 *   `node --test test`），以退出码判定；
 * - `answer-contains` 检查 Agent 的最终回答文本。
 *
 * @param task - Benchmark 任务。
 * @param workspaceRoot - 任务 workspace 根目录。
 * @param finalAnswer - Agent 的最终回答；失败时传空字符串。
 * @returns 评测结果。
 */
export function evaluateTask(
  task: BenchmarkTask,
  workspaceRoot: string,
  finalAnswer: string,
): EvaluationResult {
  const results = task.checks.map((check) =>
    runCheck(check, workspaceRoot, finalAnswer),
  )
  const failed = results.filter((result) => !result.passed)

  return {
    passed: failed.length === 0,
    results,
    ...(failed.length === 0
      ? {}
      : {
          failureReason: failed
            .map((result) => result.detail)
            .join('; '),
        }),
  }
}

/** 执行单个检查项。 */
function runCheck(
  check: TaskCheck,
  workspaceRoot: string,
  finalAnswer: string,
): CheckResult {
  try {
    switch (check.kind) {
      case 'file-exists':
        return checkFileExists(check.path, workspaceRoot)
      case 'file-contains':
        return checkFilePattern(
          check.path,
          check.pattern,
          workspaceRoot,
          true,
        )
      case 'file-not-contains':
        return checkFilePattern(
          check.path,
          check.pattern,
          workspaceRoot,
          false,
        )
      case 'answer-contains':
        return checkAnswer(check.patterns, finalAnswer)
      case 'command-succeeds':
        return checkCommand(check.command, workspaceRoot)
      case 'test-count':
        return checkTestCount(check.path, check.min, workspaceRoot)
    }
  } catch (error: unknown) {
    return {
      check,
      passed: false,
      detail: `check error: ${getErrorMessage(error)}`,
    }
  }
}

/** 检查文件存在。 */
function checkFileExists(
  path: string,
  workspaceRoot: string,
): CheckResult {
  const check: TaskCheck = { kind: 'file-exists', path }

  try {
    readFileSync(join(workspaceRoot, path), 'utf8')
    return { check, passed: true, detail: `file exists: ${path}` }
  } catch {
    return { check, passed: false, detail: `file missing: ${path}` }
  }
}

/** 检查文件内容命中（或不命中）正则。 */
function checkFilePattern(
  path: string,
  pattern: string,
  workspaceRoot: string,
  expectMatch: boolean,
): CheckResult {
  const check: TaskCheck = expectMatch
    ? { kind: 'file-contains', path, pattern }
    : { kind: 'file-not-contains', path, pattern }

  let content: string

  try {
    content = readFileSync(join(workspaceRoot, path), 'utf8')
  } catch {
    return { check, passed: false, detail: `file missing: ${path}` }
  }

  const matched = new RegExp(pattern).test(content)

  if (matched === expectMatch) {
    return {
      check,
      passed: true,
      detail: expectMatch
        ? `${path} matches /${pattern}/`
        : `${path} does not contain /${pattern}/`,
    }
  }

  return {
    check,
    passed: false,
    detail: expectMatch
      ? `${path} does not match /${pattern}/`
      : `${path} still contains /${pattern}/`,
  }
}

/** 检查最终回答命中全部正则。 */
function checkAnswer(
  patterns: readonly string[],
  finalAnswer: string,
): CheckResult {
  const check: TaskCheck = { kind: 'answer-contains', patterns }
  const missing = patterns.filter(
    (pattern) => !new RegExp(pattern, 'i').test(finalAnswer),
  )

  if (missing.length === 0) {
    return {
      check,
      passed: true,
      detail: 'answer matches all patterns',
    }
  }

  return {
    check,
    passed: false,
    detail: `answer misses /${missing.join(', /')}/`,
  }
}

/** 在 workspace 中执行命令，以退出码判定。 */
function checkCommand(
  command: string,
  workspaceRoot: string,
): CheckResult {
  const check: TaskCheck = { kind: 'command-succeeds', command }
  const result = spawnSync(command, {
    cwd: workspaceRoot,
    shell: true,
    timeout: COMMAND_TIMEOUT_MS,
    encoding: 'utf8',
  })

  if (result.status === 0) {
    return {
      check,
      passed: true,
      detail: `command succeeded: ${command}`,
    }
  }

  const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}`.trim()
  return {
    check,
    passed: false,
    detail:
      `command failed (exit ${result.status ?? 'signal'}): ${command}` +
      (output.length === 0
        ? ''
        : ` — ${output.split('\n').slice(-3).join(' | ')}`),
  }
}

/** 检查测试文件中的用例数量。 */
function checkTestCount(
  path: string,
  min: number,
  workspaceRoot: string,
): CheckResult {
  const check: TaskCheck = { kind: 'test-count', path, min }

  let content: string

  try {
    content = readFileSync(join(workspaceRoot, path), 'utf8')
  } catch {
    return { check, passed: false, detail: `file missing: ${path}` }
  }

  const count = countTestCases(content)

  if (count >= min) {
    return {
      check,
      passed: true,
      detail: `${path} has ${count} test cases (min ${min})`,
    }
  }

  return {
    check,
    passed: false,
    detail: `${path} has ${count} test cases, expected at least ${min}`,
  }
}

/** 统计 node:test 风格的用例数量。 */
export function countTestCases(content: string): number {
  const matches = content.match(/\b(?:test|it)\s*\(/g)
  return matches?.length ?? 0
}

/** 将未知错误转换为文本。 */
function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
