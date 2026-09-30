# CodeDance Benchmark 消融实验报告

- 模型来源：`sim`
- 统一预算：maxModelRounds=64，maxToolCalls=128，timeoutMs=600000
- 统一权限：全部工具调用自动授权（allow-session）
- 生成时间：2026-09-30T06:36:23.314Z

> 注意：`sim` 是离线模拟模型。工具执行、workspace 状态、
> 测试命令与 Evaluator 评测全部真实运行，Token 用量按真实
> 模型请求内容估算；模型本身的“成败模式”由任务的消融规则
> （needs-prompt-optimizer / needs-context-manager / needs-both /
> fail-always）脚本驱动，用于验证评测与统计管线。
> 真实 LLM 实验请使用 `--model deepseek`（需 DEEPSEEK_API_KEY）。

## 汇总指标（6 类）

| Variant | Success Rate | Model Rounds | Tool Calls | Tool Errors | Tokens | Latency (ms) |
| --- | --- | --- | --- | --- | --- | --- |
| Full Harness | 1/1 (100%) | 2.0 | 1.0 | 0.0 | 1669 | 15 |

## 任务 x 变体 成败矩阵

| Task | full |
| --- | --- |
| T01 | PASS |

## 失败明细

全部任务通过。
