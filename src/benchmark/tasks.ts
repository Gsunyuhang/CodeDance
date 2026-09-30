import type {
  BenchmarkTask,
  SimStep,
  SimToolCall,
} from './types.js'

/**
 * 20 个 Benchmark 任务。
 *
 * 覆盖五类能力，每类 4 个任务：
 *
 * - code-understanding：代码理解（T01-T04）
 * - bug-fix：Bug 修复（T05-T08）
 * - feature：功能实现（T09-T12）
 * - refactor：重构（T13-T16）
 * - test-writing：测试编写（T17-T20）
 *
 * 其中 5 个任务是消融实验的关键样本：
 *
 * - T03：需求模糊，考察 Prompt Optimizer；
 * - T11：长程多文件实现，考察 Context Manager；
 * - T19：需求模糊 + 多模块，考察两种机制的组合；
 * - T15、T20：超出模拟模型能力上限的难题。
 */

/** 用多行文本构造文件内容。 */
function lines(...parts: readonly string[]): string {
  return `${parts.join('\n')}\n`
}

/** 脚本中的一个工具调用步骤。 */
function calls(...items: readonly SimToolCall[]): SimStep {
  return { kind: 'calls', calls: items }
}

/** 脚本中的最终回答步骤。 */
function answer(content: string): SimStep {
  return { kind: 'answer', content }
}

const read = (path: string): SimToolCall => ({
  name: 'read_file',
  arguments: { path },
})

const write = (path: string, content: string): SimToolCall => ({
  name: 'write_file',
  arguments: { path, content },
})

const edit = (
  path: string,
  oldText: string,
  newText: string,
): SimToolCall => ({
  name: 'edit_file',
  arguments: { path, oldText, newText },
})

const run = (command: string): SimToolCall => ({
  name: 'run_command',
  arguments: { command },
})

const T01: BenchmarkTask = {
  id: 'T01',
  category: 'code-understanding',
  title: '理解 factorial 函数',
  prompt: lines(
    '阅读 src/math.js，说明 factorial 函数的行为：',
    '它接受什么输入、返回什么、如何递归、负数输入会发生什么。',
    '不要修改任何文件。',
  ),
  files: {
    'src/math.js': lines(
      'export function add(a, b) {',
      '  return a + b',
      '}',
      '',
      'export function factorial(n) {',
      '  if (n < 0) throw new Error("negative input")',
      '  if (n <= 1) return 1',
      '  return n * factorial(n - 1)',
      '}',
    ),
  },
  checks: [
    { kind: 'answer-contains', patterns: ['factorial'] },
    { kind: 'answer-contains', patterns: ['递归|recursive'] },
    { kind: 'answer-contains', patterns: ['负数|negative'] },
  ],
  sim: {
    outcome: 'pass-always',
    ambiguous: false,
    longHorizon: false,
    optimizedPrompt:
      '阅读 src/math.js 中的 factorial 函数，说明输入、输出、递归终止条件和负数边界行为，不要修改文件。',
    success: [
      calls(read('src/math.js')),
      answer(
        lines(
          'src/math.js 中的 factorial(n) 用递归计算阶乘：',
          '当 n <= 1 时返回 1（递归终止条件），否则返回 n * factorial(n - 1)。',
          '输入应为非负整数，返回 n! ；负数输入会抛出 "negative input" 错误。',
        ),
      ),
    ],
    failure: [
      calls(read('src/math.js')),
      answer('这个文件包含一些基础的数学函数，看起来比较简单。'),
    ],
  },
}

const T02: BenchmarkTask = {
  id: 'T02',
  category: 'code-understanding',
  title: '追踪 greet 的调用链',
  prompt: lines(
    '说明 src/app.js 中 greet 的调用链：',
    '它依赖哪些函数、这些函数分别在哪个文件实现？不要修改文件。',
  ),
  files: {
    'src/app.js': lines(
      'import { createUser } from "./user.js"',
      'import { formatName } from "./format.js"',
      '',
      'export function greet(first, last) {',
      '  const user = createUser(first, last)',
      '  return `hello ${formatName(user)}`',
      '}',
    ),
    'src/user.js': lines(
      'export function createUser(first, last) {',
      '  return { first, last }',
      '}',
    ),
    'src/format.js': lines(
      'export function formatName(user) {',
      '  return `${user.first} ${user.last}`',
      '}',
    ),
  },
  checks: [
    { kind: 'answer-contains', patterns: ['createUser', 'user\\.js'] },
    { kind: 'answer-contains', patterns: ['formatName', 'format\\.js'] },
  ],
  sim: {
    outcome: 'pass-always',
    ambiguous: false,
    longHorizon: false,
    optimizedPrompt:
      '阅读 src/app.js 并追踪 greet 的调用链，说明每个依赖函数及其所在文件，不要修改文件。',
    success: [
      calls(read('src/app.js'), read('src/user.js'), read('src/format.js')),
      answer(
        lines(
          'greet 的调用链：',
          '1. createUser(first, last) 在 src/user.js 中实现，创建 user 对象；',
          '2. formatName(user) 在 src/format.js 中实现，把 user 格式化为全名；',
          '3. greet 在 src/app.js 中组合两者并返回问候语。',
        ),
      ),
    ],
    failure: [
      calls(read('src/app.js')),
      answer('greet 会调用其他辅助函数完成问候语拼接。'),
    ],
  },
}

const T03: BenchmarkTask = {
  id: 'T03',
  category: 'code-understanding',
  title: '模糊需求：说明项目情况',
  prompt: '看看这个小项目，说说它是什么情况。',
  files: {
    'src/parser.js': lines(
      'export function parse(text) {',
      '  return text.split(",").map((part) => part.trim())',
      '}',
    ),
    'src/logger.js': lines(
      'export function log(level, message) {',
      '  return `[${level}] ${message}`',
      '}',
    ),
    'src/cache.js': lines(
      'export function memo(fn) {',
      '  const store = new Map()',
      '  return (key) => {',
      '    if (!store.has(key)) store.set(key, fn(key))',
      '    return store.get(key)',
      '  }',
      '}',
    ),
    'src/index.js': lines(
      'export { parse } from "./parser.js"',
      'export { log } from "./logger.js"',
      'export { memo } from "./cache.js"',
    ),
  },
  checks: [
    {
      kind: 'answer-contains',
      patterns: ['parser\\.js', 'logger\\.js', 'cache\\.js', 'index\\.js'],
    },
  ],
  sim: {
    outcome: 'needs-prompt-optimizer',
    ambiguous: true,
    longHorizon: false,
    optimizedPrompt: lines(
      '检查当前 workspace 的 src/ 目录，逐个列出每个文件名',
      '（parser.js、logger.js、cache.js、index.js）并说明其职责，',
      '最后总结项目整体结构。',
    ),
    success: [
      calls(run('dir src'), read('src/parser.js'), read('src/logger.js')),
      calls(read('src/cache.js'), read('src/index.js')),
      answer(
        lines(
          '项目包含四个文件：',
          '- src/parser.js：parse，按逗号切分并去除空白；',
          '- src/logger.js：log，拼接 [level] message 日志行；',
          '- src/cache.js：memo，基于 Map 的记忆化包装；',
          '- src/index.js：统一再导出以上三个模块。',
        ),
      ),
    ],
    failureAmbiguous: [
      calls(read('src/index.js')),
      answer(
        '这是一个小型工具项目，包含一些模块和入口文件，整体结构比较简单，代码量不大。',
      ),
    ],
    failure: [
      calls(read('src/index.js')),
      answer('这是一个简单的 JavaScript 小项目。'),
    ],
  },
}

const T04: BenchmarkTask = {
  id: 'T04',
  category: 'code-understanding',
  title: '定位日期格式化 bug',
  prompt: lines(
    'src/date.js 里有一个隐藏 bug。',
    '指出问题所在的函数名和原因，不要修改文件。',
  ),
  files: {
    'src/date.js': lines(
      'export function formatDate(date) {',
      '  const year = date.getFullYear()',
      '  const month = date.getMonth()',
      '  const day = date.getDate()',
      '  return `${year}-${month}-${day}`',
      '}',
    ),
  },
  checks: [
    { kind: 'answer-contains', patterns: ['formatDate'] },
    { kind: 'answer-contains', patterns: ['getMonth'] },
    { kind: 'answer-contains', patterns: ['\\+\\s*1|加\\s*了?\\s*1'] },
  ],
  sim: {
    outcome: 'pass-always',
    ambiguous: false,
    longHorizon: false,
    optimizedPrompt:
      '检查 src/date.js 中的日期格式化 bug，指出函数名、原因（月份是否少加 1）和影响，不要修改文件。',
    success: [
      calls(read('src/date.js')),
      answer(
        lines(
          'bug 在 formatDate：date.getMonth() 返回 0-11，',
          '直接拼进 `${year}-${month}-${day}` 少加了 1，应写成 getMonth() + 1，',
          '而且月、日没有补零，例如 2024-01-05 会输出成 2024-1-5。',
        ),
      ),
    ],
    failure: [
      calls(read('src/date.js')),
      answer('formatDate 看起来完成了基本的日期拼接工作。'),
    ],
  },
}

const T05: BenchmarkTask = {
  id: 'T05',
  category: 'bug-fix',
  title: '修复 sumRange off-by-one',
  prompt: lines(
    'test/range.test.js 有用例失败。',
    '修复 src/range.js 使全部测试通过，不要修改测试文件。',
  ),
  files: {
    'src/range.js': lines(
      'export function sumRange(start, end) {',
      '  let total = 0',
      '  for (let i = start; i < end; i += 1) {',
      '    total += i',
      '  }',
      '  return total',
      '}',
    ),
    'test/range.test.js': lines(
      'import test from "node:test"',
      'import assert from "node:assert/strict"',
      'import { sumRange } from "../src/range.js"',
      '',
      'test("sumRange sums an inclusive range", () => {',
      '  assert.equal(sumRange(1, 4), 10)',
      '})',
      '',
      'test("sumRange handles a single value", () => {',
      '  assert.equal(sumRange(5, 5), 5)',
      '})',
    ),
  },
  checks: [
    { kind: 'command-succeeds', command: 'node --test' },
    { kind: 'file-contains', path: 'src/range.js', pattern: 'i <= end' },
  ],
  sim: {
    outcome: 'pass-always',
    ambiguous: false,
    longHorizon: false,
    optimizedPrompt: lines(
      'test/range.test.js 有用例失败。定位 src/range.js 的 off-by-one',
      '（闭区间求和被写成开区间），修复后运行 node --test 确认全部通过，',
      '不要修改测试文件。',
    ),
    success: [
      calls(run('node --test'), read('src/range.js')),
      calls(edit('src/range.js', 'i < end', 'i <= end')),
      calls(run('node --test')),
      answer(
        '已修复 sumRange 的 off-by-one：循环条件从 i < end 改为 i <= end，闭区间求和。node --test 全部通过。',
      ),
    ],
    failure: [
      calls(read('src/range.js')),
      answer('我检查了 src/range.js，问题应该已经解决了。'),
    ],
  },
}

const T06: BenchmarkTask = {
  id: 'T06',
  category: 'bug-fix',
  title: '修复 parseConfig 默认值崩溃',
  prompt: lines(
    'test/config.test.js 失败：parseConfig 在缺少 timeout 时崩溃。',
    '修复 src/config.js，为 timeout 提供默认值 30，不要修改测试。',
  ),
  files: {
    'src/config.js': lines(
      'export function parseConfig(raw) {',
      '  return {',
      '    host: raw.host,',
      '    timeout: raw.timeout.toFixed(0),',
      '  }',
      '}',
    ),
    'test/config.test.js': lines(
      'import test from "node:test"',
      'import assert from "node:assert/strict"',
      'import { parseConfig } from "../src/config.js"',
      '',
      'test("timeout defaults to 30", () => {',
      '  assert.deepEqual(parseConfig({ host: "x" }), {',
      '    host: "x",',
      '    timeout: "30",',
      '  })',
      '})',
      '',
      'test("explicit timeout is formatted", () => {',
      '  assert.equal(parseConfig({ host: "y", timeout: 5.4 }).timeout, "5")',
      '})',
    ),
  },
  checks: [
    { kind: 'command-succeeds', command: 'node --test' },
    { kind: 'file-contains', path: 'src/config.js', pattern: '30' },
  ],
  sim: {
    outcome: 'pass-always',
    ambiguous: false,
    longHorizon: false,
    optimizedPrompt: lines(
      '修复 src/config.js：parseConfig 在缺少 timeout 时应使用默认值 30，',
      '保证 test/config.test.js 的两个用例全部通过，不要修改测试。',
    ),
    success: [
      calls(run('node --test'), read('src/config.js')),
      calls(
        edit(
          'src/config.js',
          'timeout: raw.timeout.toFixed(0),',
          'timeout: (raw.timeout ?? 30).toFixed(0),',
        ),
      ),
      calls(run('node --test')),
      answer('已为 timeout 增加默认值 30（raw.timeout ?? 30），node --test 全部通过。'),
    ],
    failure: [
      calls(read('src/config.js')),
      answer('已处理 parseConfig 的问题。'),
    ],
  },
}

const T07: BenchmarkTask = {
  id: 'T07',
  category: 'bug-fix',
  title: '修复 formatDay 日期格式',
  prompt: lines(
    'test/datefmt.test.js 失败：formatDay 输出的日期格式不符合预期。',
    '按测试期望修复 src/datefmt.js（输出 YYYY-MM-DD，例如 2024-01-05），',
    '不要修改测试文件。',
  ),
  files: {
    'src/datefmt.js': lines(
      'export function formatDay(date) {',
      '  const day = String(date.getDate()).padStart(2, "0")',
      '  const month = String(date.getMonth() + 1).padStart(2, "0")',
      '  return `${day}/${month}/${date.getFullYear()}`',
      '}',
    ),
    'test/datefmt.test.js': lines(
      'import test from "node:test"',
      'import assert from "node:assert/strict"',
      'import { formatDay } from "../src/datefmt.js"',
      '',
      'test("formatDay uses YYYY-MM-DD", () => {',
      '  assert.equal(formatDay(new Date(2024, 0, 5)), "2024-01-05")',
      '})',
    ),
  },
  checks: [
    { kind: 'command-succeeds', command: 'node --test' },
    {
      kind: 'file-contains',
      path: 'src/datefmt.js',
      pattern: '\\$\\{year\\}-\\$\\{month\\}-\\$\\{day\\}',
    },
  ],
  sim: {
    outcome: 'pass-always',
    ambiguous: false,
    longHorizon: false,
    optimizedPrompt: lines(
      'test/datefmt.test.js 明确期望 formatDay 输出 YYYY-MM-DD（如 2024-01-05）。',
      '修改 src/datefmt.js 符合该测试并运行 node --test 确认通过，不要改测试。',
    ),
    success: [
      calls(read('test/datefmt.test.js'), read('src/datefmt.js')),
      calls(
        write(
          'src/datefmt.js',
          lines(
            'export function formatDay(date) {',
            '  const year = String(date.getFullYear())',
            '  const month = String(date.getMonth() + 1).padStart(2, "0")',
            '  const day = String(date.getDate()).padStart(2, "0")',
            '  return `${year}-${month}-${day}`',
            '}',
          ),
        ),
      ),
      calls(run('node --test')),
      answer('已把 formatDay 改为 YYYY-MM-DD 输出（2024-01-05），node --test 通过。'),
    ],
    failure: [
      calls(read('src/datefmt.js')),
      calls(
        write(
          'src/datefmt.js',
          lines(
            'export function formatDay(date) {',
            '  const day = String(date.getDate()).padStart(2, "0")',
            '  const month = String(date.getMonth() + 1).padStart(2, "0")',
            '  return `${day}/${month}/${date.getFullYear()}`',
            '}',
          ),
        ),
      ),
      answer('已按 DD/MM/YYYY 规范补齐了补零逻辑。'),
    ],
  },
}

const T08: BenchmarkTask = {
  id: 'T08',
  category: 'bug-fix',
  title: '修复 readConfig 缺少 await',
  prompt: lines(
    'test/load.test.js 失败：readConfig 没有正确等待文件读取。',
    '修复 src/load.js，不要修改测试。',
  ),
  files: {
    'src/load.js': lines(
      'import { readFile } from "node:fs/promises"',
      '',
      'export function readConfig(path) {',
      '  const text = readFile(path, "utf8")',
      '  return JSON.parse(text)',
      '}',
    ),
    'test/load.test.js': lines(
      'import test from "node:test"',
      'import assert from "node:assert/strict"',
      'import { writeFileSync, rmSync } from "node:fs"',
      'import { readConfig } from "../src/load.js"',
      '',
      'test("readConfig parses JSON", async () => {',
      '  writeFileSync("tmp-config.json", \'{"retries":3}\')',
      '  try {',
      '    const config = await readConfig("tmp-config.json")',
      '    assert.equal(config.retries, 3)',
      '  } finally {',
      '    rmSync("tmp-config.json", { force: true })',
      '  }',
      '})',
    ),
  },
  checks: [
    { kind: 'command-succeeds', command: 'node --test' },
    { kind: 'file-contains', path: 'src/load.js', pattern: 'await readFile' },
  ],
  sim: {
    outcome: 'pass-always',
    ambiguous: false,
    longHorizon: false,
    optimizedPrompt: lines(
      '修复 src/load.js：readConfig 必须 await readFile 后再 JSON.parse，',
      '改为 async 函数，保证 test/load.test.js 通过，不要修改测试。',
    ),
    success: [
      calls(read('test/load.test.js'), read('src/load.js')),
      calls(
        edit(
          'src/load.js',
          'export function readConfig(path) {\n  const text = readFile(path, "utf8")',
          'export async function readConfig(path) {\n  const text = await readFile(path, "utf8")',
        ),
      ),
      calls(run('node --test')),
      answer('已把 readConfig 改为 async 并 await readFile，node --test 通过。'),
    ],
    failure: [
      calls(read('src/load.js')),
      answer('已修复 readConfig 的问题。'),
    ],
  },
}

const T09: BenchmarkTask = {
  id: 'T09',
  category: 'feature',
  title: '实现 clamp',
  prompt: lines(
    '实现 src/clamp.js 的 clamp(value, min, max)：',
    '把 value 限制在 [min, max] 范围内，使 test/clamp.test.js 全部通过。',
  ),
  files: {
    'src/clamp.js': lines(
      'export function clamp(value, min, max) {',
      '  return value',
      '}',
    ),
    'test/clamp.test.js': lines(
      'import test from "node:test"',
      'import assert from "node:assert/strict"',
      'import { clamp } from "../src/clamp.js"',
      '',
      'test("clamps above range", () => {',
      '  assert.equal(clamp(5, 1, 3), 3)',
      '})',
      '',
      'test("clamps below range", () => {',
      '  assert.equal(clamp(0, 1, 3), 1)',
      '})',
      '',
      'test("keeps value inside range", () => {',
      '  assert.equal(clamp(2, 1, 3), 2)',
      '})',
    ),
  },
  checks: [
    { kind: 'command-succeeds', command: 'node --test' },
    { kind: 'file-contains', path: 'src/clamp.js', pattern: 'Math\\.min|Math\\.max' },
  ],
  sim: {
    outcome: 'pass-always',
    ambiguous: false,
    longHorizon: false,
    optimizedPrompt: lines(
      '实现 src/clamp.js 的 clamp(value, min, max)，把值限制在 [min, max]，',
      '运行 node --test 确认 test/clamp.test.js 全部通过。',
    ),
    success: [
      calls(read('test/clamp.test.js'), read('src/clamp.js')),
      calls(
        write(
          'src/clamp.js',
          lines(
            'export function clamp(value, min, max) {',
            '  return Math.min(Math.max(value, min), max)',
            '}',
          ),
        ),
      ),
      calls(run('node --test')),
      answer('已实现 clamp（Math.min/Math.max），node --test 全部通过。'),
    ],
    failure: [
      calls(read('src/clamp.js')),
      answer('已实现 clamp。'),
    ],
  },
}

const T10: BenchmarkTask = {
  id: 'T10',
  category: 'feature',
  title: '实现 stable unique',
  prompt: lines(
    '实现 src/dedupe.js 的 unique(items)：按首次出现顺序去重，',
    '使 test/dedupe.test.js 全部通过。',
  ),
  files: {
    'src/dedupe.js': lines(
      'export function unique(items) {',
      '  return items',
      '}',
    ),
    'test/dedupe.test.js': lines(
      'import test from "node:test"',
      'import assert from "node:assert/strict"',
      'import { unique } from "../src/dedupe.js"',
      '',
      'test("keeps first occurrence order", () => {',
      '  assert.deepEqual(unique([3, 1, 3, 2, 1]), [3, 1, 2])',
      '})',
      '',
      'test("handles empty input", () => {',
      '  assert.deepEqual(unique([]), [])',
      '})',
    ),
  },
  checks: [
    { kind: 'command-succeeds', command: 'node --test' },
    { kind: 'file-contains', path: 'src/dedupe.js', pattern: 'Set|indexOf|includes' },
  ],
  sim: {
    outcome: 'pass-always',
    ambiguous: false,
    longHorizon: false,
    optimizedPrompt: lines(
      '实现 src/dedupe.js 的 unique(items)，按首次出现顺序稳定去重，',
      '运行 node --test 确认全部通过。',
    ),
    success: [
      calls(read('test/dedupe.test.js'), read('src/dedupe.js')),
      calls(
        write(
          'src/dedupe.js',
          lines(
            'export function unique(items) {',
            '  const seen = new Set()',
            '  const result = []',
            '  for (const item of items) {',
            '    if (!seen.has(item)) {',
            '      seen.add(item)',
            '      result.push(item)',
            '    }',
            '  }',
            '  return result',
            '}',
          ),
        ),
      ),
      calls(run('node --test')),
      answer('已用 Set 实现稳定去重 unique，node --test 全部通过。'),
    ],
    failure: [
      calls(read('src/dedupe.js')),
      answer('已实现 unique。'),
    ],
  },
}

const T11: BenchmarkTask = {
  id: 'T11',
  category: 'feature',
  title: '实现多模块工具库并统一导出',
  prompt: lines(
    '实现 src/ 下缺失的工具模块（strings.js、numbers.js、arrays.js、objects.js），',
    '并在 src/index.js 统一导出（包括 VERSION 常量），',
    '使 test/utils.test.js 全部通过。',
  ),
  files: {
    'test/utils.test.js': lines(
      'import test from "node:test"',
      'import assert from "node:assert/strict"',
      'import { slugify } from "../src/strings.js"',
      'import { clamp } from "../src/numbers.js"',
      'import { chunk } from "../src/arrays.js"',
      'import { pick } from "../src/objects.js"',
      'import { VERSION } from "../src/index.js"',
      '',
      'test("slugify", () => {',
      '  assert.equal(slugify("Hello World"), "hello-world")',
      '})',
      '',
      'test("clamp", () => {',
      '  assert.equal(clamp(10, 0, 5), 5)',
      '})',
      '',
      'test("chunk", () => {',
      '  assert.deepEqual(chunk([1, 2, 3], 2), [[1, 2], [3]])',
      '})',
      '',
      'test("pick", () => {',
      '  assert.deepEqual(pick({ a: 1, b: 2 }, ["a"]), { a: 1 })',
      '})',
      '',
      'test("version export", () => {',
      '  assert.equal(VERSION, "1.0.0")',
      '})',
    ),
  },
  checks: [
    { kind: 'file-exists', path: 'src/strings.js' },
    { kind: 'file-exists', path: 'src/numbers.js' },
    { kind: 'file-exists', path: 'src/arrays.js' },
    { kind: 'file-exists', path: 'src/objects.js' },
    { kind: 'file-contains', path: 'src/index.js', pattern: 'objects' },
    { kind: 'command-succeeds', command: 'node --test' },
  ],
  sim: {
    outcome: 'needs-context-manager',
    ambiguous: false,
    longHorizon: true,
    optimizedPrompt: lines(
      '实现 src/strings.js（slugify）、src/numbers.js（clamp）、',
      'src/arrays.js（chunk）、src/objects.js（pick），',
      '在 src/index.js 全部再导出并提供 VERSION="1.0.0"，',
      '运行 node --test 确认 test/utils.test.js 全部通过。',
    ),
    success: [
      calls(read('test/utils.test.js')),
      calls(
        write(
          'src/strings.js',
          lines(
            'export function slugify(text) {',
            '  return text.trim().toLowerCase().replace(/\\s+/g, "-")',
            '}',
          ),
        ),
        write(
          'src/numbers.js',
          lines(
            'export function clamp(value, min, max) {',
            '  return Math.min(Math.max(value, min), max)',
            '}',
          ),
        ),
      ),
      calls(
        write(
          'src/arrays.js',
          lines(
            'export function chunk(items, size) {',
            '  const result = []',
            '  for (let i = 0; i < items.length; i += size) {',
            '    result.push(items.slice(i, i + size))',
            '  }',
            '  return result',
            '}',
          ),
        ),
        write(
          'src/objects.js',
          lines(
            'export function pick(source, keys) {',
            '  const result = {}',
            '  for (const key of keys) {',
            '    if (key in source) result[key] = source[key]',
            '  }',
            '  return result',
            '}',
          ),
        ),
      ),
      calls(
        write(
          'src/index.js',
          lines(
            'export { slugify } from "./strings.js"',
            'export { clamp } from "./numbers.js"',
            'export { chunk } from "./arrays.js"',
            'export { pick } from "./objects.js"',
            '',
            'export const VERSION = "1.0.0"',
          ),
        ),
      ),
      calls(run('node --test')),
      answer(
        '已实现四个工具模块并在 src/index.js 统一导出（含 VERSION="1.0.0"），node --test 全部通过。',
      ),
    ],
    failureDistracted: [
      calls(read('test/utils.test.js')),
      calls(
        write(
          'src/strings.js',
          lines(
            'export function slugify(text) {',
            '  return text.trim().toLowerCase().replace(/\\s+/g, "-")',
            '}',
          ),
        ),
        write(
          'src/numbers.js',
          lines(
            'export function clamp(value, min, max) {',
            '  return Math.min(Math.max(value, min), max)',
            '}',
          ),
        ),
      ),
      calls(
        write(
          'src/arrays.js',
          lines(
            'export function chunk(items, size) {',
            '  const result = []',
            '  for (let i = 0; i < items.length; i += size) {',
            '    result.push(items.slice(i, i + size))',
            '  }',
            '  return result',
            '}',
          ),
        ),
        write(
          'src/objects.js',
          lines(
            'export function pick(source, keys) {',
            '  const result = {}',
            '  for (const key of keys) {',
            '    if (key in source) result[key] = source[key]',
            '  }',
            '  return result',
            '}',
          ),
        ),
      ),
      calls(
        write(
          'src/index.js',
          lines(
            'export { slugify } from "./strings.js"',
            'export { clamp } from "./numbers.js"',
            '',
            'export const VERSION = "1.0.0"',
          ),
        ),
      ),
      calls(run('node --test')),
      answer('四个工具模块已实现，src/index.js 已统一导出。'),
    ],
    failure: [
      calls(read('test/utils.test.js')),
      calls(write('src/strings.js', 'export function slugify(text) {\n  return text\n}\n')),
      answer('已开始实现工具模块。'),
    ],
  },
}

const T12: BenchmarkTask = {
  id: 'T12',
  category: 'feature',
  title: '实现 parseQuery',
  prompt: lines(
    '实现 src/query.js 的 parseQuery(query)：',
    '把 "a=1&b=2" 解析成对象，空字符串返回空对象，使 test/query.test.js 通过。',
  ),
  files: {
    'src/query.js': lines(
      'export function parseQuery(query) {',
      '  return {}',
      '}',
    ),
    'test/query.test.js': lines(
      'import test from "node:test"',
      'import assert from "node:assert/strict"',
      'import { parseQuery } from "../src/query.js"',
      '',
      'test("parses pairs", () => {',
      '  assert.deepEqual(parseQuery("a=1&b=2"), { a: "1", b: "2" })',
      '})',
      '',
      'test("empty query", () => {',
      '  assert.deepEqual(parseQuery(""), {})',
      '})',
      '',
      'test("single pair", () => {',
      '  assert.deepEqual(parseQuery("msg=hi"), { msg: "hi" })',
      '})',
    ),
  },
  checks: [
    { kind: 'command-succeeds', command: 'node --test' },
    { kind: 'file-contains', path: 'src/query.js', pattern: 'split' },
  ],
  sim: {
    outcome: 'pass-always',
    ambiguous: false,
    longHorizon: false,
    optimizedPrompt: lines(
      '实现 src/query.js 的 parseQuery(query)：按 & 和 = 切分键值对，',
      '空字符串返回空对象，运行 node --test 确认全部通过。',
    ),
    success: [
      calls(read('test/query.test.js'), read('src/query.js')),
      calls(
        write(
          'src/query.js',
          lines(
            'export function parseQuery(query) {',
            '  const result = {}',
            '  if (query === "") return result',
            '  for (const pair of query.split("&")) {',
            '    const index = pair.indexOf("=")',
            '    if (index === -1) continue',
            '    result[pair.slice(0, index)] = pair.slice(index + 1)',
            '  }',
            '  return result',
            '}',
          ),
        ),
      ),
      calls(run('node --test')),
      answer('已实现 parseQuery（split(& 与 =)），node --test 全部通过。'),
    ],
    failure: [
      calls(read('src/query.js')),
      answer('已实现 parseQuery。'),
    ],
  },
}

const T13: BenchmarkTask = {
  id: 'T13',
  category: 'refactor',
  title: '消除 invoice 重复折扣逻辑',
  prompt: lines(
    '重构 src/invoice.js：消除 finalPriceRegular 与 finalPriceMember 中',
    '重复的合计与折扣逻辑，抽出共享函数 calcTotal 与 applyDiscount，',
    '保持导出与行为不变，使 test/invoice.test.js 继续通过。',
  ),
  files: {
    'src/invoice.js': lines(
      'export function finalPriceRegular(items) {',
      '  const total = items.reduce((sum, item) => sum + item.price * item.qty, 0)',
      '  return total > 200 ? total * 0.9 : total',
      '}',
      '',
      'export function finalPriceMember(items) {',
      '  const total = items.reduce((sum, item) => sum + item.price * item.qty, 0)',
      '  return total > 200 ? total * 0.9 : total',
      '}',
    ),
    'test/invoice.test.js': lines(
      'import test from "node:test"',
      'import assert from "node:assert/strict"',
      'import { finalPriceRegular, finalPriceMember } from "../src/invoice.js"',
      '',
      'const items = [{ price: 100, qty: 3 }]',
      '',
      'test("discount applies above 200", () => {',
      '  assert.equal(finalPriceRegular(items), 270)',
      '  assert.equal(finalPriceMember(items), 270)',
      '})',
      '',
      'test("no discount at exactly 200", () => {',
      '  const small = [{ price: 100, qty: 2 }]',
      '  assert.equal(finalPriceRegular(small), 200)',
      '})',
    ),
  },
  checks: [
    { kind: 'file-contains', path: 'src/invoice.js', pattern: 'calcTotal' },
    { kind: 'file-contains', path: 'src/invoice.js', pattern: 'applyDiscount' },
    { kind: 'command-succeeds', command: 'node --test' },
  ],
  sim: {
    outcome: 'pass-always',
    ambiguous: false,
    longHorizon: false,
    optimizedPrompt: lines(
      '重构 src/invoice.js：抽出 calcTotal(items) 与 applyDiscount(total)',
      '共享函数，finalPriceRegular/finalPriceMember 行为与导出不变，',
      '运行 node --test 确认继续通过。',
    ),
    success: [
      calls(read('src/invoice.js'), read('test/invoice.test.js')),
      calls(
        write(
          'src/invoice.js',
          lines(
            'function calcTotal(items) {',
            '  return items.reduce((sum, item) => sum + item.price * item.qty, 0)',
            '}',
            '',
            'function applyDiscount(total) {',
            '  return total > 200 ? total * 0.9 : total',
            '}',
            '',
            'export function finalPriceRegular(items) {',
            '  return applyDiscount(calcTotal(items))',
            '}',
            '',
            'export function finalPriceMember(items) {',
            '  return applyDiscount(calcTotal(items))',
            '}',
          ),
        ),
      ),
      calls(run('node --test')),
      answer('已抽出 calcTotal 与 applyDiscount，行为与导出不变，node --test 通过。'),
    ],
    failure: [
      calls(read('src/invoice.js')),
      answer('重构完成，导出保持不变。'),
    ],
  },
}

const T14: BenchmarkTask = {
  id: 'T14',
  category: 'refactor',
  title: '回调风格改为 Promise',
  prompt: lines(
    '把 src/legacy.js 的回调风格 fetchValue 改造为 Promise 风格的 fetchValueAsync',
    '（async 函数，错误通过 reject 抛出），使 test/legacy.test.js 通过。',
  ),
  files: {
    'src/legacy.js': lines(
      'export function fetchValue(key, callback) {',
      '  setTimeout(() => {',
      '    if (key == null) {',
      '      callback(new Error("key required"))',
      '      return',
      '    }',
      '    callback(null, `value:${key}`)',
      '  }, 1)',
      '}',
    ),
    'test/legacy.test.js': lines(
      'import test from "node:test"',
      'import assert from "node:assert/strict"',
      'import { fetchValueAsync } from "../src/legacy.js"',
      '',
      'test("resolves with the value", async () => {',
      '  assert.equal(await fetchValueAsync("a"), "value:a")',
      '})',
      '',
      'test("rejects without a key", async () => {',
      '  await assert.rejects(() => fetchValueAsync(null), /key required/)',
      '})',
    ),
  },
  checks: [
    { kind: 'command-succeeds', command: 'node --test' },
    { kind: 'file-contains', path: 'src/legacy.js', pattern: 'fetchValueAsync' },
    { kind: 'file-contains', path: 'src/legacy.js', pattern: 'async|Promise' },
  ],
  sim: {
    outcome: 'pass-always',
    ambiguous: false,
    longHorizon: false,
    optimizedPrompt: lines(
      '把 src/legacy.js 改造为 Promise 风格：提供 async 的 fetchValueAsync，',
      'key 为空时 reject(new Error("key required"))，否则 resolve `value:${key}`，',
      '运行 node --test 确认通过。',
    ),
    success: [
      calls(read('test/legacy.test.js'), read('src/legacy.js')),
      calls(
        write(
          'src/legacy.js',
          lines(
            'export async function fetchValueAsync(key) {',
            '  if (key == null) {',
            '    throw new Error("key required")',
            '  }',
            '  return `value:${key}`',
            '}',
          ),
        ),
      ),
      calls(run('node --test')),
      answer('已改造为 async fetchValueAsync，错误通过 throw/reject 传递，测试通过。'),
    ],
    failure: [
      calls(read('src/legacy.js')),
      answer('改造完成。'),
    ],
  },
}

const T15: BenchmarkTask = {
  id: 'T15',
  category: 'refactor',
  title: '跨文件提取 CHUNK_SIZE 常量',
  prompt: lines(
    'src/upload.js、src/download.js、src/preview.js、src/archive.js 中',
    '各自重复定义了 1024 这个块大小常量。',
    '把它们提取到 src/constants.js 的 CHUNK_SIZE 并在四个文件中统一引用，',
    '保持行为不变，使 test/chunk.test.js 继续通过。',
  ),
  files: {
    'src/upload.js': lines(
      'export const UPLOAD_CHUNK = 1024',
      '',
      'export function uploadParts(bytes) {',
      '  return Math.ceil(bytes / UPLOAD_CHUNK)',
      '}',
    ),
    'src/download.js': lines(
      'export const DOWNLOAD_CHUNK = 1024',
      '',
      'export function downloadParts(bytes) {',
      '  return Math.ceil(bytes / DOWNLOAD_CHUNK)',
      '}',
    ),
    'src/preview.js': lines(
      'export const PREVIEW_CHUNK = 1024',
      '',
      'export function previewParts(bytes) {',
      '  return Math.ceil(bytes / PREVIEW_CHUNK)',
      '}',
    ),
    'src/archive.js': lines(
      'export const ARCHIVE_CHUNK = 1024',
      '',
      'export function archiveParts(bytes) {',
      '  return Math.ceil(bytes / ARCHIVE_CHUNK)',
      '}',
    ),
    'test/chunk.test.js': lines(
      'import test from "node:test"',
      'import assert from "node:assert/strict"',
      'import { UPLOAD_CHUNK, uploadParts } from "../src/upload.js"',
      'import { DOWNLOAD_CHUNK, downloadParts } from "../src/download.js"',
      'import { PREVIEW_CHUNK, previewParts } from "../src/preview.js"',
      'import { ARCHIVE_CHUNK, archiveParts } from "../src/archive.js"',
      '',
      'test("chunk size stays 1024", () => {',
      '  assert.equal(UPLOAD_CHUNK, 1024)',
      '  assert.equal(DOWNLOAD_CHUNK, 1024)',
      '  assert.equal(PREVIEW_CHUNK, 1024)',
      '  assert.equal(ARCHIVE_CHUNK, 1024)',
      '})',
      '',
      'test("parts are computed per chunk", () => {',
      '  assert.equal(uploadParts(2048), 2)',
      '  assert.equal(downloadParts(1025), 2)',
      '  assert.equal(previewParts(1024), 1)',
      '  assert.equal(archiveParts(10), 1)',
      '})',
    ),
  },
  checks: [
    { kind: 'file-exists', path: 'src/constants.js' },
    { kind: 'file-contains', path: 'src/constants.js', pattern: 'CHUNK_SIZE' },
    { kind: 'file-not-contains', path: 'src/upload.js', pattern: '1024' },
    { kind: 'file-not-contains', path: 'src/download.js', pattern: '1024' },
    { kind: 'file-not-contains', path: 'src/preview.js', pattern: '1024' },
    { kind: 'file-not-contains', path: 'src/archive.js', pattern: '1024' },
    { kind: 'command-succeeds', command: 'node --test' },
  ],
  sim: {
    outcome: 'fail-always',
    ambiguous: false,
    longHorizon: true,
    optimizedPrompt: lines(
      '把 src/upload.js、src/download.js、src/preview.js、src/archive.js 中',
      '重复的 1024 常量提取为 src/constants.js 的 CHUNK_SIZE 并在四个文件中引用，',
      '四个文件都不得再出现 1024 字面量，行为不变，node --test 需通过。',
    ),
    success: [
      calls(read('src/upload.js'), read('src/download.js')),
      calls(read('src/preview.js'), read('src/archive.js')),
      calls(
        write(
          'src/constants.js',
          lines('export const CHUNK_SIZE = 1024'),
        ),
      ),
      calls(
        write(
          'src/upload.js',
          lines(
            'import { CHUNK_SIZE } from "./constants.js"',
            '',
            'export const UPLOAD_CHUNK = CHUNK_SIZE',
            '',
            'export function uploadParts(bytes) {',
            '  return Math.ceil(bytes / UPLOAD_CHUNK)',
            '}',
          ),
        ),
        write(
          'src/download.js',
          lines(
            'import { CHUNK_SIZE } from "./constants.js"',
            '',
            'export const DOWNLOAD_CHUNK = CHUNK_SIZE',
            '',
            'export function downloadParts(bytes) {',
            '  return Math.ceil(bytes / DOWNLOAD_CHUNK)',
            '}',
          ),
        ),
      ),
      calls(
        write(
          'src/preview.js',
          lines(
            'import { CHUNK_SIZE } from "./constants.js"',
            '',
            'export const PREVIEW_CHUNK = CHUNK_SIZE',
            '',
            'export function previewParts(bytes) {',
            '  return Math.ceil(bytes / PREVIEW_CHUNK)',
            '}',
          ),
        ),
        write(
          'src/archive.js',
          lines(
            'import { CHUNK_SIZE } from "./constants.js"',
            '',
            'export const ARCHIVE_CHUNK = CHUNK_SIZE',
            '',
            'export function archiveParts(bytes) {',
            '  return Math.ceil(bytes / ARCHIVE_CHUNK)',
            '}',
          ),
        ),
      ),
      calls(run('node --test')),
      answer('常量已提取到 src/constants.js，四个文件统一引用 CHUNK_SIZE，测试通过。'),
    ],
    // 模拟模型的重构遗漏了 archive.js，行为仍正确但迁移不完整。
    failure: [
      calls(read('src/upload.js'), read('src/download.js')),
      calls(read('src/preview.js'), read('src/archive.js')),
      calls(
        write(
          'src/constants.js',
          lines('export const CHUNK_SIZE = 1024'),
        ),
      ),
      calls(
        write(
          'src/upload.js',
          lines(
            'import { CHUNK_SIZE } from "./constants.js"',
            '',
            'export const UPLOAD_CHUNK = CHUNK_SIZE',
            '',
            'export function uploadParts(bytes) {',
            '  return Math.ceil(bytes / UPLOAD_CHUNK)',
            '}',
          ),
        ),
        write(
          'src/download.js',
          lines(
            'import { CHUNK_SIZE } from "./constants.js"',
            '',
            'export const DOWNLOAD_CHUNK = CHUNK_SIZE',
            '',
            'export function downloadParts(bytes) {',
            '  return Math.ceil(bytes / DOWNLOAD_CHUNK)',
            '}',
          ),
        ),
      ),
      calls(
        write(
          'src/preview.js',
          lines(
            'import { CHUNK_SIZE } from "./constants.js"',
            '',
            'export const PREVIEW_CHUNK = CHUNK_SIZE',
            '',
            'export function previewParts(bytes) {',
            '  return Math.ceil(bytes / PREVIEW_CHUNK)',
            '}',
          ),
        ),
      ),
      calls(run('node --test')),
      answer('常量已提取到 src/constants.js，相关文件已改为引用 CHUNK_SIZE，测试通过。'),
    ],
  },
}

const T16: BenchmarkTask = {
  id: 'T16',
  category: 'refactor',
  title: '嵌套条件重构为 guard clauses',
  prompt: lines(
    '重构 src/ship.js：把嵌套的条件分支改写为 guard clauses（提前 return/throw），',
    '行为与导出保持不变，使 test/ship.test.js 继续通过。',
  ),
  files: {
    'src/ship.js': lines(
      'export function shippingFee(weight, express, member) {',
      '  if (weight > 0) {',
      '    if (express) {',
      '      if (member) {',
      '        return 5',
      '      }',
      '      return 10',
      '    } else {',
      '      return 3',
      '    }',
      '  } else {',
      '    throw new Error("invalid weight")',
      '  }',
      '}',
    ),
    'test/ship.test.js': lines(
      'import test from "node:test"',
      'import assert from "node:assert/strict"',
      'import { shippingFee } from "../src/ship.js"',
      '',
      'test("express member", () => {',
      '  assert.equal(shippingFee(1, true, true), 5)',
      '})',
      '',
      'test("express non-member", () => {',
      '  assert.equal(shippingFee(1, true, false), 10)',
      '})',
      '',
      'test("standard", () => {',
      '  assert.equal(shippingFee(1, false, true), 3)',
      '})',
      '',
      'test("invalid weight", () => {',
      '  assert.throws(() => shippingFee(0, true, true), /invalid weight/)',
      '})',
    ),
  },
  checks: [
    { kind: 'file-contains', path: 'src/ship.js', pattern: 'invalid weight' },
    { kind: 'command-succeeds', command: 'node --test' },
  ],
  sim: {
    outcome: 'pass-always',
    ambiguous: false,
    longHorizon: false,
    optimizedPrompt: lines(
      '重构 src/ship.js 为 guard clauses 风格（提前 return/throw），',
      '行为与导出不变，运行 node --test 确认 test/ship.test.js 继续通过。',
    ),
    success: [
      calls(read('src/ship.js'), read('test/ship.test.js')),
      calls(
        write(
          'src/ship.js',
          lines(
            'export function shippingFee(weight, express, member) {',
            '  if (weight <= 0) {',
            '    throw new Error("invalid weight")',
            '  }',
            '  if (!express) {',
            '    return 3',
            '  }',
            '  if (member) {',
            '    return 5',
            '  }',
            '  return 10',
            '}',
          ),
        ),
      ),
      calls(run('node --test')),
      answer('已重构为 guard clauses（提前 throw/return），行为不变，测试通过。'),
    ],
    failure: [
      calls(read('src/ship.js')),
      answer('重构完成。'),
    ],
  },
}

const T17: BenchmarkTask = {
  id: 'T17',
  category: 'test-writing',
  title: '为 str.js 编写测试',
  prompt: lines(
    '为 src/str.js 编写 test/str.test.js，覆盖 titleCase 与 truncate 的',
    '正常与边界情况（空串、超长截断等），至少 3 个用例，',
    '保证 node --test 全部通过。',
  ),
  files: {
    'src/str.js': lines(
      'export function titleCase(text) {',
      '  return text',
      '    .split(" ")',
      '    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))',
      '    .join(" ")',
      '}',
      '',
      'export function truncate(text, max) {',
      '  return text.length <= max ? text : text.slice(0, max) + "..."',
      '}',
    ),
  },
  checks: [
    { kind: 'file-exists', path: 'test/str.test.js' },
    { kind: 'test-count', path: 'test/str.test.js', min: 3 },
    { kind: 'command-succeeds', command: 'node --test' },
  ],
  sim: {
    outcome: 'pass-always',
    ambiguous: false,
    longHorizon: false,
    optimizedPrompt: lines(
      '为 src/str.js 的 titleCase 与 truncate 编写 test/str.test.js，',
      '覆盖空串、普通输入、超长截断等边界，至少 3 个用例，',
      '运行 node --test 确认全部通过。',
    ),
    success: [
      calls(read('src/str.js')),
      calls(
        write(
          'test/str.test.js',
          lines(
            'import test from "node:test"',
            'import assert from "node:assert/strict"',
            'import { titleCase, truncate } from "../src/str.js"',
            '',
            'test("titleCase capitalizes words", () => {',
            '  assert.equal(titleCase("hello world"), "Hello World")',
            '})',
            '',
            'test("titleCase handles empty string", () => {',
            '  assert.equal(titleCase(""), "")',
            '})',
            '',
            'test("truncate keeps short text", () => {',
            '  assert.equal(truncate("abc", 5), "abc")',
            '})',
            '',
            'test("truncate appends ellipsis", () => {',
            '  assert.equal(truncate("abcdef", 3), "abc...")',
            '})',
          ),
        ),
      ),
      calls(run('node --test')),
      answer('已编写 test/str.test.js（4 个用例，含空串与截断边界），node --test 全部通过。'),
    ],
    failure: [
      calls(read('src/str.js')),
      answer('测试已补充。'),
    ],
  },
}

const T18: BenchmarkTask = {
  id: 'T18',
  category: 'test-writing',
  title: '为 Stack 类编写测试',
  prompt: lines(
    '为 src/stack.js 的 Stack 类编写 test/stack.test.js，',
    '覆盖 push/pop/peek、空栈错误和 size，至少 4 个用例，',
    '保证 node --test 全部通过。',
  ),
  files: {
    'src/stack.js': lines(
      'export class Stack {',
      '  constructor() {',
      '    this.items = []',
      '  }',
      '',
      '  push(item) {',
      '    this.items.push(item)',
      '  }',
      '',
      '  pop() {',
      '    if (this.items.length === 0) {',
      '      throw new Error("stack is empty")',
      '    }',
      '    return this.items.pop()',
      '  }',
      '',
      '  peek() {',
      '    if (this.items.length === 0) {',
      '      throw new Error("stack is empty")',
      '    }',
      '    return this.items[this.items.length - 1]',
      '  }',
      '',
      '  get size() {',
      '    return this.items.length',
      '  }',
      '}',
    ),
  },
  checks: [
    { kind: 'file-exists', path: 'test/stack.test.js' },
    { kind: 'test-count', path: 'test/stack.test.js', min: 4 },
    { kind: 'command-succeeds', command: 'node --test' },
  ],
  sim: {
    outcome: 'pass-always',
    ambiguous: false,
    longHorizon: false,
    optimizedPrompt: lines(
      '为 src/stack.js 的 Stack 类编写 test/stack.test.js，',
      '覆盖 push/pop/peek、空栈 pop/peek 抛错、size 统计，至少 4 个用例，',
      '运行 node --test 确认全部通过。',
    ),
    success: [
      calls(read('src/stack.js')),
      calls(
        write(
          'test/stack.test.js',
          lines(
            'import test from "node:test"',
            'import assert from "node:assert/strict"',
            'import { Stack } from "../src/stack.js"',
            '',
            'test("push and pop are LIFO", () => {',
            '  const stack = new Stack()',
            '  stack.push(1)',
            '  stack.push(2)',
            '  assert.equal(stack.pop(), 2)',
            '  assert.equal(stack.pop(), 1)',
            '})',
            '',
            'test("peek does not remove", () => {',
            '  const stack = new Stack()',
            '  stack.push("x")',
            '  assert.equal(stack.peek(), "x")',
            '  assert.equal(stack.size, 1)',
            '})',
            '',
            'test("pop on empty throws", () => {',
            '  assert.throws(() => new Stack().pop(), /stack is empty/)',
            '})',
            '',
            'test("peek on empty throws", () => {',
            '  assert.throws(() => new Stack().peek(), /stack is empty/)',
            '})',
            '',
            'test("size tracks pushes", () => {',
            '  const stack = new Stack()',
            '  stack.push(1)',
            '  stack.push(2)',
            '  assert.equal(stack.size, 2)',
            '})',
          ),
        ),
      ),
      calls(run('node --test')),
      answer('已编写 test/stack.test.js（5 个用例，含空栈错误），node --test 全部通过。'),
    ],
    failure: [
      calls(read('src/stack.js')),
      answer('测试已补充。'),
    ],
  },
}

const T19: BenchmarkTask = {
  id: 'T19',
  category: 'test-writing',
  title: '模糊需求：补充项目测试',
  prompt: '这个项目的测试不够，补一补。',
  files: {
    'src/store.js': lines(
      'export function createStore(initial = {}) {',
      '  const state = { ...initial }',
      '  return {',
      '    get(key) {',
      '      return state[key]',
      '    },',
      '    set(key, value) {',
      '      state[key] = value',
      '    },',
      '    remove(key) {',
      '      delete state[key]',
      '    },',
      '  }',
      '}',
    ),
    'src/serialize.js': lines(
      'export function serialize(state) {',
      '  return JSON.stringify(state)',
      '}',
      '',
      'export function deserialize(text) {',
      '  const parsed = JSON.parse(text)',
      '  if (typeof parsed !== "object" || parsed === null) {',
      '    throw new Error("invalid state")',
      '  }',
      '  return parsed',
      '}',
    ),
  },
  checks: [
    { kind: 'file-exists', path: 'test/store.test.js' },
    { kind: 'file-exists', path: 'test/serialize.test.js' },
    { kind: 'test-count', path: 'test/store.test.js', min: 2 },
    { kind: 'test-count', path: 'test/serialize.test.js', min: 2 },
    { kind: 'command-succeeds', command: 'node --test' },
  ],
  sim: {
    outcome: 'needs-both',
    ambiguous: true,
    longHorizon: true,
    optimizedPrompt: lines(
      '为 src/store.js 与 src/serialize.js 补充测试：',
      'test/store.test.js 覆盖 get/set/remove，',
      'test/serialize.test.js 覆盖序列化、反序列化和非法 JSON 抛错，',
      '每个文件至少 2 个用例，运行 node --test 确认全部通过。',
    ),
    success: [
      calls(read('src/store.js'), read('src/serialize.js')),
      calls(
        write(
          'test/store.test.js',
          lines(
            'import test from "node:test"',
            'import assert from "node:assert/strict"',
            'import { createStore } from "../src/store.js"',
            '',
            'test("set and get", () => {',
            '  const store = createStore()',
            '  store.set("a", 1)',
            '  assert.equal(store.get("a"), 1)',
            '})',
            '',
            'test("remove deletes a key", () => {',
            '  const store = createStore({ a: 1 })',
            '  store.remove("a")',
            '  assert.equal(store.get("a"), undefined)',
            '})',
            '',
            'test("initial state", () => {',
            '  const store = createStore({ b: 2 })',
            '  assert.equal(store.get("b"), 2)',
            '})',
          ),
        ),
      ),
      calls(
        write(
          'test/serialize.test.js',
          lines(
            'import test from "node:test"',
            'import assert from "node:assert/strict"',
            'import { serialize, deserialize } from "../src/serialize.js"',
            '',
            'test("round trip", () => {',
            '  assert.deepEqual(deserialize(serialize({ a: 1 })), { a: 1 })',
            '})',
            '',
            'test("deserialize rejects invalid JSON", () => {',
            '  assert.throws(() => deserialize("{bad"), /JSON|token/)',
            '})',
            '',
            'test("deserialize rejects non-object", () => {',
            '  assert.throws(() => deserialize(\'"str"\'), /invalid state/)',
            '})',
          ),
        ),
      ),
      calls(run('node --test')),
      answer(
        '已为 store 与 serialize 补充测试：test/store.test.js（3 个用例）和 test/serialize.test.js（3 个用例，含非法 JSON 抛错），node --test 全部通过。',
      ),
    ],
    // 需求模糊时只理解成“给 store 补测试”。
    failureAmbiguous: [
      calls(read('src/store.js')),
      calls(
        write(
          'test/store.test.js',
          lines(
            'import test from "node:test"',
            'import assert from "node:assert/strict"',
            'import { createStore } from "../src/store.js"',
            '',
            'test("set and get", () => {',
            '  const store = createStore()',
            '  store.set("a", 1)',
            '  assert.equal(store.get("a"), 1)',
            '})',
            '',
            'test("remove deletes a key", () => {',
            '  const store = createStore({ a: 1 })',
            '  store.remove("a")',
            '  assert.equal(store.get("a"), undefined)',
            '})',
          ),
        ),
      ),
      calls(run('node --test')),
      answer('已为 src/store.js 补充测试 test/store.test.js，node --test 通过。'),
    ],
    // 需求明确但长程执行失焦：serialize 测试写得不完整。
    failureDistracted: [
      calls(read('src/store.js'), read('src/serialize.js')),
      calls(
        write(
          'test/store.test.js',
          lines(
            'import test from "node:test"',
            'import assert from "node:assert/strict"',
            'import { createStore } from "../src/store.js"',
            '',
            'test("set and get", () => {',
            '  const store = createStore()',
            '  store.set("a", 1)',
            '  assert.equal(store.get("a"), 1)',
            '})',
            '',
            'test("remove deletes a key", () => {',
            '  const store = createStore({ a: 1 })',
            '  store.remove("a")',
            '  assert.equal(store.get("a"), undefined)',
            '})',
          ),
        ),
      ),
      calls(
        write(
          'test/serialize.test.js',
          lines(
            'import test from "node:test"',
            'import assert from "node:assert/strict"',
            'import { serialize, deserialize } from "../src/serialize.js"',
            '',
            'test("round trip", () => {',
            '  assert.deepEqual(deserialize(serialize({ a: 1 })), { a: 1 })',
            '})',
            '',
            'test("deserialize is lenient", () => {',
            '  assert.deepEqual(deserialize("{bad"), {})',
            '})',
            '',
            'test("deserialize accepts strings", () => {',
            '  assert.equal(deserialize(\'"str"\'), "str")',
            '})',
          ),
        ),
      ),
      calls(run('node --test')),
      answer('已为 store 与 serialize 补充测试。'),
    ],
    failure: [
      calls(read('src/store.js')),
      calls(
        write(
          'test/store.test.js',
          lines(
            'import test from "node:test"',
            'import assert from "node:assert/strict"',
            'import { createStore } from "../src/store.js"',
            '',
            'test("set and get", () => {',
            '  const store = createStore()',
            '  store.set("a", 1)',
            '  assert.equal(store.get("a"), 1)',
            '})',
          ),
        ),
      ),
      answer('已补充基础测试。'),
    ],
  },
}

const T20: BenchmarkTask = {
  id: 'T20',
  category: 'test-writing',
  title: '实现引号感知 tokenizer 并编写测试',
  prompt: lines(
    '实现 src/tokenize.js 的 tokenize(input)：按空白切分命令行，',
    '支持单引号、双引号与嵌套/转义引号（例如 \\"a \\\'b\\\' c\\" 作为一个参数），',
    '并编写 test/tokenize.test.js（至少 5 个用例，覆盖嵌套引号），',
    '保证 node --test 全部通过。',
  ),
  files: {
    'src/tokenize.js': lines(
      'export function tokenize(input) {',
      '  return []',
      '}',
    ),
  },
  checks: [
    { kind: 'file-exists', path: 'test/tokenize.test.js' },
    { kind: 'test-count', path: 'test/tokenize.test.js', min: 5 },
    { kind: 'file-contains', path: 'src/tokenize.js', pattern: 'tokenize' },
    { kind: 'command-succeeds', command: 'node --test' },
  ],
  sim: {
    outcome: 'fail-always',
    ambiguous: false,
    longHorizon: true,
    optimizedPrompt: lines(
      '实现 src/tokenize.js 的 tokenize(input)：按空白切分，',
      '支持单/双引号与嵌套、转义引号；',
      '编写 test/tokenize.test.js（>=5 用例，必须覆盖嵌套引号），',
      '运行 node --test 确认全部通过。',
    ),
    // 成功路径给出支持转义引号的完整实现（fail-always 任务不会走到）。
    success: [
      calls(read('src/tokenize.js')),
      calls(
        write(
          'src/tokenize.js',
          lines(
            'export function tokenize(input) {',
            '  const tokens = []',
            '  let current = ""',
            '  let quote = null',
            '  let escaped = false',
            '  for (const char of input) {',
            '    if (escaped) {',
            '      current += char',
            '      escaped = false',
            '      continue',
            '    }',
            '    if (char === "\\\\" && quote !== null) {',
            '      escaped = true',
            '      continue',
            '    }',
            '    if (char === "\\"" || char === "\'") {',
            '      if (quote === char) {',
            '        quote = null',
            '      } else if (quote === null) {',
            '        quote = char',
            '      } else {',
            '        current += char',
            '      }',
            '    } else if (/\\s/.test(char) && quote === null) {',
            '      if (current !== "") {',
            '        tokens.push(current)',
            '        current = ""',
            '      }',
            '    } else {',
            '      current += char',
            '    }',
            '  }',
            '  if (current !== "") tokens.push(current)',
            '  return tokens',
            '}',
          ),
        ),
      ),
      calls(
        write(
          'test/tokenize.test.js',
          lines(
            'import test from "node:test"',
            'import assert from "node:assert/strict"',
            'import { tokenize } from "../src/tokenize.js"',
            '',
            'test("splits on whitespace", () => {',
            '  assert.deepEqual(tokenize("a b  c"), ["a", "b", "c"])',
            '})',
            '',
            'test("keeps quoted spaces", () => {',
            '  assert.deepEqual(tokenize(\'"a b" c\'), ["a b", "c"])',
            '})',
            '',
            'test("single quotes", () => {',
            '  assert.deepEqual(tokenize("\'a b\' c"), ["a b", "c"])',
            '})',
            '',
            'test("empty input", () => {',
            '  assert.deepEqual(tokenize(""), [])',
            '})',
            '',
            'test("nested quotes", () => {',
            '  assert.deepEqual(tokenize(\'"a \\\'b\\\' c"\'), ["a \'b\' c"])',
            '})',
            '',
            'test("escaped quotes", () => {',
            '  assert.deepEqual(tokenize(\'"a \\\\"b\\\\" c"\'), [\'a "b" c\'])',
            '})',
          ),
        ),
      ),
      calls(run('node --test')),
      answer('已实现 tokenize 并编写 5 个用例，node --test 通过。'),
    ],
    failure: [
      calls(read('src/tokenize.js')),
      calls(
        write(
          'src/tokenize.js',
          lines(
            'export function tokenize(input) {',
            '  const tokens = []',
            '  let current = ""',
            '  let quote = null',
            '  for (const char of input) {',
            '    if (char === "\\"" || char === "\'") {',
            '      if (quote === char) {',
            '        quote = null',
            '      } else if (quote === null) {',
            '        quote = char',
            '      } else {',
            '        current += char',
            '      }',
            '    } else if (/\\s/.test(char) && quote === null) {',
            '      if (current !== "") {',
            '        tokens.push(current)',
            '        current = ""',
            '      }',
            '    } else {',
            '      current += char',
            '    }',
            '  }',
            '  if (current !== "") tokens.push(current)',
            '  return tokens',
            '}',
          ),
        ),
      ),
      calls(
        write(
          'test/tokenize.test.js',
          lines(
            'import test from "node:test"',
            'import assert from "node:assert/strict"',
            'import { tokenize } from "../src/tokenize.js"',
            '',
            'test("splits on whitespace", () => {',
            '  assert.deepEqual(tokenize("a b  c"), ["a", "b", "c"])',
            '})',
            '',
            'test("keeps quoted spaces", () => {',
            '  assert.deepEqual(tokenize(\'"a b" c\'), ["a b", "c"])',
            '})',
            '',
            'test("single quotes", () => {',
            '  assert.deepEqual(tokenize("\'a b\' c"), ["a b", "c"])',
            '})',
            '',
            'test("empty input", () => {',
            '  assert.deepEqual(tokenize(""), [])',
            '})',
            '',
            'test("nested quotes", () => {',
            '  assert.deepEqual(tokenize(\'"a \\\'b\\\' c"\'), ["a \'b\' c"])',
            '})',
            '',
            'test("escaped quotes", () => {',
            '  assert.deepEqual(tokenize(\'"a \\\\"b\\\\" c"\'), [\'a "b" c\'])',
            '})',
          ),
        ),
      ),
      calls(run('node --test')),
      answer('已实现 tokenize 并编写 5 个用例（含嵌套引号）。'),
    ],
  },
}

/** 全部 20 个 Benchmark 任务。 */
export const BENCHMARK_TASKS: readonly BenchmarkTask[] = [
  T01, T02, T03, T04,
  T05, T06, T07, T08,
  T09, T10, T11, T12,
  T13, T14, T15, T16,
  T17, T18, T19, T20,
]

/**
 * 按 id 查询任务。
 *
 * @param taskId - 任务 id。
 * @returns 对应任务；不存在时返回 undefined。
 */
export function findTask(taskId: string): BenchmarkTask | undefined {
  return BENCHMARK_TASKS.find((task) => task.id === taskId)
}
