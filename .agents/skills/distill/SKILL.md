---
name: distill
description: 从本机已注册 Agent 的会话 jsonl 中交互式选择来源，支持 Claude Code 和 Codex，会显示各会话上次抓取时间与新增内容概览；选定会话后用生产编排脚本处理确定性流转，按“未来可复用的长期问题答案/决策模型”抽取可归责、由外部输入内化而来、能脱离当前项目复用的知识信号，排除只服务当前仓库或当前流程的过程记录，并对本轮初抽候选做批内融合，避免把同一判断的 why、参数、边界、证据或例子拆碎，校验候选结构，补齐完整候选字段，写入 distill_stage1.json。用户要求运行 /distill、整理最近 Agent 对话、处理增量会话日志、或在融合更新前准备待审候选时使用。完成 stage1 写入后，继续使用 merge 做融合更新判类，最终进入 pending.json 或 duplicates.json。
---

# distill

把本机 Agent 会话里的增量对话抽成第一阶段候选，补齐完整 schema 后写入 `distill_stage1.json`。

边界：

```text
注册 Agent 和会话
→ 脚本列出可选会话表格
→ 用户选择要抓取的行
→ 编排脚本按行抓取增量可见对话并记录运行清单
→ 每个 Session 启动一个 Sub-agent 独立抽取候选
→ 编排脚本收集并校验结构
→ 主流程对本轮候选做批内融合，合并过碎但同属一个长期问题的候选
→ 编排脚本补齐完整候选字段并写入 distill_stage1.json
→ 交给 merge
→ pending.json / duplicates.json
```

本 skill 不读取 `canonical/*.json`，不做 duplicate/update/link/none 判类，不写 `pending.json` / `duplicates.json`，不推进最终处理位置。融合更新由 `merge` 负责。

## 支持的 Agent

| Agent | 默认会话目录 | 处理位置 |
|---|---|---|
| `claudecode` | `~/.claude/projects/**/*.jsonl` | 优先用消息 `uuid` |
| `codex` | `~/.codex/sessions/**/*.jsonl` | 用 `line:<行号>` |

Codex 会话和 Claude Code 会话的 JSONL 结构不同。脚本必须按表格里的 `agent` 字段选择解析方式，不要把 Codex 日志当 Claude Code 日志读。

只抽用户主会话。Claude Code 的 `/subagents/*.jsonl` 或 `isSidechain: true` 是 subagent；Codex 的 `thread_source: "subagent"` 或 `source.subagent` 是 subagent；`originator: "codex_exec"` / `source: "exec"` 是 exec 会话。subagent 和 exec 默认不列入、不预处理。

## 文件

- 编排脚本：`scripts/orchestrate.py`
- 底层脚本：`scripts/distill.py`
- 项目知识目录：`$CWD/knowledge`
- 知识目录文件：`distill_stage1.json`、`pending.json`、`history.json`、`whitelist.yaml`
- 会话来源：由 `list-agent-sessions` 自动发现

不要把项目知识库放进 skill 目录；skill 目录只放说明、脚本、测试和资源。

## 硬规则

- 用户没点名会话时，先列会话表格让他选要抓取的行；用户已经给了会话路径、或唯一指名了某个会话时，跳过列表直接抓那个会话，不必先列 80 行再回头。
- 只处理 `session_kind=main` 的主会话；不要抽取 subagent / exec 会话。subagent 的有效结论应由主 agent 总结后再进入主会话。
- 抽取对象是可归责、由外界输入或对外界输入的内化而来、对未来有复用价值、能服务 agent 或人的知识信号，不只限用户发言。
- 知识必须能脱离当前仓库、当前 skill 和当前会话流程成立；如果只能说明“这个项目这次怎么实现/怎么命名/怎么推进”，不要抽。
- 每条候选必须能归入一个广义领域；`system` 只能用于通用系统设计、agent 机制或工作流设计知识，不要把它当作项目过程记录的兜底分类。
- 用户立场必须来自用户；assistant 解释、外部资料、工具观察可以抽，但必须用 `attribution` 标清归责来源，不能伪装成用户立场。
- 不抽一次性 debug 细节、纯日志、资料 dump、工具原始输出、提问、brainstorm 中间态、客套同意、当前项目执行约定、文件命名、队列流转、测试过程观察或只保护当前实现的红线。
- 本 skill 的第一阶段 LLM 抽取由 per-session Sub-agent 完成：每个 Sub-agent 只看一个 Session 的增量内容和领域词表，不读正式知识库，不看其他 Session。
- 不跨 Session 合并输入；一个 Session 的增量内容默认整体输入给同一个 Sub-agent。只有单个 Session 超过 preprocess 阈值时才停下来，除非用户明确允许分块。
- Sub-agent 初抽完成后，主流程必须做一次本轮候选的批内融合：把同一领域、回答同一长期问题/决策模型、只是 why/证据/例子/参数/边界/反例不同的候选合成更完整的一条；不要把过碎的单句事实、孤立参数或单条证据直接写入 stage1。
- 批内融合仍属于 distill 第一阶段，只融合本轮初抽候选，不读取正式知识库，不做 duplicate/update/link/none 判类。
- 普通继续同一 Session 的场景依赖 `history.json` 里的 cursor 做增量：Claude Code 用消息 `uuid`，Codex 用 `line:<行号>`；不要为这种 append 场景额外做全局去重。
- 如果 cursor 找不到、会话被 fork/branch、或新 JSONL 带有旧上下文前缀，优先保证不漏读，允许少量重复进入后续 `capture`、`merge` 和人审环节消化。
- 结构校验失败时停止，不要静默修坏 JSON。
- preprocess 超过阈值时停止，除非用户明确允许 `--allow-over-threshold`。
- 写入 `distill_stage1.json` 后，立刻继续使用 `merge`，把运行清单 `MANIFEST` 交给它；`new_ids`、`SESSION_KEY`、`LAST_CURSOR`、`KNOWLEDGE_DIR` 都由编排脚本记录在清单里。

## 命令顺序

优先使用生产编排脚本。它不做语义判断，不调用 LLM；它只负责会话预处理、结构校验、状态落盘、id 生成、空库 judgment、finalize、link apply 和 cursor commit，并在需要 LLM 的地方停下来给出输入/输出文件。

初始化或修复知识目录：

```bash
python3 scripts/distill.py init --knowledge-dir "$KNOWLEDGE_DIR"
```

列出注册 Agent 的会话表格：

```bash
python3 scripts/distill.py list-agent-sessions \
  --knowledge-dir "$KNOWLEDGE_DIR" \
  --session-kind main \
  --format markdown \
  --limit 80
```

如果需要机器可读结果：

```bash
python3 scripts/distill.py list-agent-sessions \
  --knowledge-dir "$KNOWLEDGE_DIR" \
  --session-kind main \
  --format json \
  --limit 80
```

把用户选中的会话行写成 JSON 数组，例如 `/tmp/distill_sessions.json`：

```json
[
  {
    "name": "short-name",
    "agent": "claudecode",
    "session_key": "claudecode:<session-id>",
    "jsonl_path": "/absolute/path/to/session.jsonl"
  }
]
```

启动一次生产运行：

```bash
python3 scripts/orchestrate.py start-run \
  --knowledge-dir "$KNOWLEDGE_DIR" \
  --sessions "/tmp/distill_sessions.json"
```

它会输出 `MANIFEST` 路径。后续所有确定性步骤都围绕这个运行清单执行。

Sub-agent 写完每个 session 的 extraction JSON 后：

```bash
python3 scripts/orchestrate.py prepare-fusion --manifest "$MANIFEST"
```

如果 `needs_llm=true`，用「批内融合提示词」读取 `fusion_input_path`，把结果写到 `fusion_output_path`。然后执行：

```bash
python3 scripts/orchestrate.py apply-fusion --manifest "$MANIFEST"
```

把最终候选写入 `distill_stage1.json`：

```bash
python3 scripts/orchestrate.py capture --manifest "$MANIFEST"
```

然后把同一个 `MANIFEST` 交给 `merge`。

底层调试命令仍可直接使用。预处理用户选择的某一行：

```bash
python3 scripts/distill.py preprocess \
  --agent "$AGENT" \
  --session-key "$SESSION_KEY" \
  --jsonl "$JSONL_PATH" \
  --knowledge-dir "$KNOWLEDGE_DIR" \
  --out "/tmp/distill_chunk_$SESSION_KEY.txt"
```

校验第一步 LLM 输出：

```bash
python3 scripts/distill.py validate-extraction \
  --extraction "/tmp/distill_extraction_$SESSION_KEY.json" \
  --knowledge-dir "$KNOWLEDGE_DIR"
```

写入第一阶段缓存：

```bash
python3 scripts/distill.py capture \
  --extraction "/tmp/distill_extraction_$SESSION_KEY.json" \
  --session-id "$SESSION_KEY" \
  --knowledge-dir "$KNOWLEDGE_DIR"
```

没有新候选时推进处理位置：

```bash
python3 scripts/distill.py commit-cursor \
  --session-id "$SESSION_KEY" \
  --position "$LAST_CURSOR" \
  --agent "$AGENT" \
  --knowledge-dir "$KNOWLEDGE_DIR"
```

## 执行协议

主流程是 coordinator，负责列会话、启动 Sub-agent、批内融合决策和交接 merge；确定性状态流转交给 `scripts/orchestrate.py`。主流程不直接做知识抽取，也不要手工拼接 id、cursor 或 pending 写入。

1. 解析 `KNOWLEDGE_DIR`。
2. 运行 `init`，或让 `orchestrate.py start-run` 自动初始化知识目录。
3. 如果用户已经点名了具体会话（给了 jsonl 路径，或唯一指明某个会话），跳过列表，直接写入 `/tmp/distill_sessions.json`；否则运行 `list-agent-sessions --format markdown`。
4. 把表格发给用户，表格至少包含：行号、Agent、类型、项目/目录、会话、更新、上次抓取、新增轮次、新增预览；正式流程只展示 `session_kind=main`。
5. 等用户选择行号。
6. 对选中的行生成 `/tmp/distill_sessions.json`，运行 `orchestrate.py start-run`。它会为每个 Session 输出独立 chunk、extraction 目标路径和运行清单 `MANIFEST`。
7. 把新增内容概览告诉用户；如果某个 Session 的 `new_turns_count == 0`，编排脚本会标为 `skipped_no_new_turns`。
8. 如果任一 Session 的 `over_threshold == true`，停止；除非用户明确允许对该 Session 分块或允许 `--allow-over-threshold`。默认不要自动切分。
9. 为每个 `status=ready_for_extraction` 的 Session 启动一个 Sub-agent。Sub-agent 的唯一任务是读取该 Session 的 chunk、按下面的抽取提示词输出 JSON 数组到运行清单里的 `extraction_path`。
10. 多个 Session 可以并发处理；每个 Sub-agent 只能看自己的 Session chunk、领域词表和 schema，不看其他 Session 输出。
11. 主流程等待所有 Sub-agent 完成；运行 `orchestrate.py prepare-fusion --manifest "$MANIFEST"`，让脚本校验所有初抽 JSON 并生成 `fusion_input_path`。
12. 如果 `needs_llm=true`，执行「批内融合提示词」：读取 `fusion_input_path`，合并过碎候选，输出到 `fusion_output_path`。如果没有可融合内容，也要按原结构输出。
13. 运行 `orchestrate.py apply-fusion --manifest "$MANIFEST"`，让脚本拆分并再次校验最终 JSON。
14. 运行 `orchestrate.py capture --manifest "$MANIFEST"`，把候选写入 `distill_stage1.json`，并把 `new_ids` 记录进清单。
15. 如果任一 Session 的 `new_ids` 非空，继续使用 `merge` 处理同一个 `MANIFEST`；本 skill 不推进处理位置。
16. 如果所有 Session 都没有候选，直接运行 `orchestrate.py finish --manifest "$MANIFEST"`，或用底层 `commit-cursor` 在确认无候选后推进处理位置。

增量处理原则：普通 append 只处理 cursor 之后的新内容；异常场景宁可重读一小段，也不要为了去重跳过可能未处理的新内容。

## Sub-agent 调度规则

- **输入单元**：一个 Session 的增量内容是第一阶段抽取的基本输入单元。
- **硬边界**：不要把多个 Session 拼进同一个 LLM 窗口；不同 Session 之间不共享上下文。
- **默认窗口**：单个 Session 的全部增量内容一次性输入给一个 Sub-agent。
- **超阈值**：如果单个 Session 超过 preprocess 阈值，默认停止并报告用户；只有用户明确允许时，才按 turn 边界分块。分块仍然不能跨 Session。
- **输出数量**：每个 Sub-agent 输出 0-N 条候选。不要为了“每个 Session 至少一条”而硬抽。
- **输出形态**：Sub-agent 不输出过程总结、主题列表或解释性报告；最终只写 JSON 数组到运行清单指定的 `extraction_path`。
- **批内融合**：所有 Sub-agent 初抽完成后，主流程要统一检查本轮候选是否过碎。同一领域里，如果多条候选共同回答同一个未来会反复遇到的问题/决策模型，且差别只是 why、证据、例子、适用边界、参数补充或反例，应合成一条更完整的候选。
- **融合边界**：不要因为初抽 `form` 不同就直接拆开；先判断它们是否共同服务同一个长期问题，必要时把解释性内容收进 `human`，把行动性内容收进 `agent`，合并后再重新选择 `form`。只有不同 `attribution.claim_owner` 且合并会混淆归责、不同领域/长期问题、或两条分别审核后仍能各自完整复用且拒绝一条不会破坏另一条的可理解性时，才拆开。跨 Session 融合只在它们明显回答同一个长期问题时做；需要选择最能代表合并后知识的原始证据作为 `evidence_quote`，不要编造证据。
- **主流程职责**：主流程只做并发调度、结构校验、批内融合、capture 写入和交接 `merge`；不读取正式知识库，不做第二阶段判类。

## 候选契约

抽取候选的完整规格——字段语义、切分规则、`attribution` 配对、输出格式——都写在下面的「Sub-agent 抽取提示词」里。那段是交给抽取子代理的唯一权威规格（子代理只看得到它），主流程不在这里复述；产物统一由 `validate-extraction` 兜底校验，校验不过就停。

主流程只需要把握三件事，其余交给提示词和校验脚本：

- **候选不是最终知识**，是待审信号；`capture` 之后还要过 `merge` 才可能进知识库。
- **知识不是过程记录**：候选必须来自外部输入、解释、调研、资料、工具观察或用户基于这些输入形成的明确理解；只记录当前仓库怎么改、当前 skill 怎么跑、当前文件叫什么，不算知识。
- **`form` 是融合后的使用形态，不是切分依据**：先按长期问题/决策模型判断该合还是该拆，再给合并后的候选选择 `form`。`practice`=给 agent 的行为规则；`methodology`=同条里带 why 的判断/做法（how 和 why 在一条里，不必硬拆成 `theory`+`practice`）；`theory`=给人理解的概念/原理。不要仅因初抽 `form` 不同就拆；同一结论的 why、例子、证据、参数、边界和反例优先合并。
- **`attribution` 是硬契约**：AI 解释、外部资料、工具观察都能抽，但 `claim_owner` 只有在用户明确采纳、内容已转成用户立场时才写 `user`；其余按提示词里的配对表标 `assistant`/`source`/`tool`，绝不伪装成用户立场。
- **候选粒度按长期问题定**：候选不是一句事实摘录，而是未来能直接学习、判断或行动的一小块知识。多个原始信息如果都服务同一个长期问题，优先合成一条；“可以被分别接受/拒绝”不是充分拆分条件，只有当它们被分别审核后仍能各自完整复用，且拒绝其中一条不会破坏另一条的可理解性时才拆开。

## 批内融合提示词

```text
你是知识库第一阶段的批内融合子代理。你只处理本轮 distill 初抽出来的候选,不读取正式知识库,不做 duplicate/update/link/none 判类。

[输入]
按 Session 分组的初抽候选:
{
  "<SESSION_KEY>": [候选 JSON 数组],
  "<SESSION_KEY>": [候选 JSON 数组]
}

[任务]
检查本轮候选是否过碎,把同一领域里回答同一个长期问题/决策模型的候选合成更完整的一条。
目标是减少孤立事实、孤立参数和孤立证据,形成对人或 agent 都更可复用的候选。

[必须合并]
- 多条候选只是同一机制的不同证据、例子、参数、边界或反例。
- 多条候选共同回答一个未来会反复遇到的问题,例如“冷萃比例如何判断”“Agent 记忆应该如何召回相关上下文”。
- 后一条只是前一条的 why、适用条件或例外情况。
- 一条给出判断/做法,另一条给出它的机制、适用边界、证据边界、风险校准或参数控制。
- 多条内容共同决定同一次未来判断或行动;拆开后任何一条都会缺少关键 why、how 或边界。

[form 选择]
- 不要因为初抽 `form` 不同直接拆。先判断这些候选是否共同服务同一个长期问题,再决定合并后的 `form`。
- 合并后既有判断/做法又有 why 或边界,选 `methodology`。
- 只有人类概念理解,选 `theory`。
- 只有 agent 行为规则,选 `practice`。

[必须拆开]
- `attribution.claim_owner` 不同,或来源归责会被混淆。
- 不同领域,或回答的是不同长期问题。
- 两条支持不同未来行动/判断,且分别审核后仍能各自完整复用。
- 合并后会让 `agent`/`human` 字段不得不塞入两套互不依赖的规则。

[融合自检]
输出前对每条候选问:
1. 它是不是另一条的 why、边界、参数、证据、例子、反例或例外?
2. 它和另一条是否共同回答同一个“以后我该怎么判断/行动”的问题?
3. 如果把它删掉,另一条是否会缺少关键机制、边界或校准?

任一为是,优先合并。

[校准例子]
- 冷泡咖啡比例 + 溶解度误区 + 证据边界 + 咖啡因控制 => 合并为“冷泡咖啡配方判断框架”。
- 冷泡茶参数 + 隔夜茶风险 => 合并为“冷泡茶参数与安全边界”。
- Web3AI 结合点 + AI 获奖成熟度 => 合并为“Web3AI 黑客松判断框架”。
- 获奖信号核验是研究方法,不是同一个领域结论,应单独保留。

[跨 Session 融合]
默认优先同 Session 内融合。跨 Session 只有在候选明显回答同一个长期问题时才做。
跨 Session 合并后,把结果放回证据最强、最能代表该知识的那个 SESSION_KEY 下;`evidence_quote` 和 `turn_range` 必须来自这个 Session 的原文,不要伪造综合证据。

[输出]
只输出 JSON 对象,不要 markdown 代码围栏。key 必须仍是输入中的 SESSION_KEY,value 是该 Session 最终要 capture 的候选 JSON 数组:
{
  "<SESSION_KEY>": [
    {
      "form": "methodology",
      "domain": "system",
      "title": "...",
      "abstract": "...",
      "agent": "...",
      "human": "...",
      "attribution": {...},
      "evidence_quote": "...",
      "turn_range": [142, 158]
    }
  ]
}

[约束]
- 不新增输入里没有根据的内容。
- 不把当前项目过程记录重新包装成知识。
- 没有可融合内容时原样输出。
- 输出后主流程会按每个 SESSION_KEY 拆回运行清单指定的 `merged_extraction_path` 并再次运行 `validate-extraction`。
```

## Sub-agent 抽取提示词

```text
你是一个知识库的抽取 Sub-agent。你只处理一个 Session 的增量对话。
从给定对话片段中提取可归责、由外部输入内化而来、能脱离当前项目复用的知识信号,结构化成候选条目。

[输入]
一个 Session 的增量对话片段（每行带 [turn N] 标号）:
<<chunk_text>>

用户的领域词表:
<<从 whitelist.yaml 读取的 domains>>
(不属于上述任一 → 归 _unknown)

[抽取规则]
对每段对话,先做知识资格测试:
1. 输入性——这条内容是否来自外部输入、assistant 解释、外部资料、工具观察,或用户听取这些输入后形成的明确理解?
   如果只是本轮为了推进当前仓库/当前 skill 而定下的执行规则、文件命名、测试修补或流程安排,跳过。
2. 可迁移——去掉当前项目名、文件名、候选 id、队列名、这次会话的上下文后,它是否仍能帮助未来理解一个领域、机制、方法或判断原则?
   如果离开当前项目就失去意义,跳过。
3. 领域性——它能归入某个广义领域吗?
   `system` 只表示通用系统设计、agent 机制或工作流设计;不要用 `system` 收纳项目过程碎片。无法说清领域且没有明显长期价值,跳过。
4. 内化性——它是否已经被总结成可理解、可复用的知识,而不是资料 dump、日志、单次观察或未消化的输出?
   没有被解释、比较、归纳或明确采纳的原始材料,跳过。

通过知识资格测试后,再问四个问题:
1. 可归责吗——能说清这条内容来自谁、归谁负责吗?
   用户立场归用户;AI 解释归 assistant;外部资料归 source;工具观察归 tool。
2. 价值持久吗——下一次类似任务、学习、判断、写作、评审或设计时还会用得上吗?
   一次性 debug / 临时参数 / 单次路径 / 原始日志 / 当前项目过程记录 → 跳过。
3. 表达明确吗——内容已经足够确定吗?
   提问 / brainstorm 中间态 / 客套同意 → 跳过。
4. 可成形吗——能不编造地写成 agent 字段或 human 字段吗?
   不能服务 agent 行为,也不能服务人理解 → 跳过。

四个都"是"才抽出来。

[候选粒度规则]
你可以输出 0-N 条候选。不要把整个 Session 总结成一条,也不要把同一个 claim 的例子拆碎。
候选的基本单位不是一句事实、一个参数、一个证据,也不是一个 `form`,而是一个未来可复用的问题答案/决策模型:人能借它理解一个机制/边界,或 agent 能借它改善一次判断/行动。
- 先判断多个原始信息是否共同服务同一个长期问题,再决定 `form`;不要先按 `theory`/`practice`/`methodology` 拆。
- 多个原始信息共同回答同一个长期问题 → 优先合成一条,把机制、参数、例子、证据边界、风险和适用条件放在同一条里。
- 单条原始信息只是 why、证据、例子、参数、边界、反例或例外 → 不要单独成条,合并到它支撑的候选里。
- 两个点“可以分别接受/拒绝”不是充分拆分条件;只有当它们分别审核后仍能各自完整复用,且拒绝其中一条不会破坏另一条的可理解性时才拆。
- 两个点初看属于不同 `form` 时,不要直接拆;如果共同服务同一个长期问题,把解释性内容放入 `human`,把行动性内容放入 `agent`,合并后通常选 `methodology`。
- 一个是概念解释,一个是操作规则,如果共同回答同一个未来判断/行动问题,优先合成 methodology;只有合并后会让 agent/human 字段混乱时才拆。
- 多个步骤共同构成一个不可拆的套路 → 合成一条 methodology。
- 同一个规则的多个例子/证据 → 合成一条。
- 后一句只是前一句的 why → 合成一条。
- 后一句能独立指导一个不同的未来行为,且不依赖前一句成立 → 拆出来。
- 不同来源归责不同 → 拆开,避免 attribution 混乱。

输出前做一次粒度自检:
1. 这条候选是不是另一条的 why、边界、参数、证据、例子、反例或例外?
2. 它们是否共同回答同一个“以后我该怎么判断/行动”的问题?
3. 删除其中一条后,另一条是否会缺少关键机制、边界或校准?

任一为是,优先合并;只有合并会混淆领域、归责或形成两套互不依赖的行动目标时才拆。

[来源规则]
- 用户发言可以形成用户偏好、方法论、领域判断、一手经验。
- AI 解释可以形成概念解释、理论框架、方法候选,但必须像外部输入一样能被用户学习或复用;不要抽 AI 为推进当前实现临时生成的项目过程规则。
- 外部资料可以形成带来源的事实或理论候选,但不能被写成用户经验。
- 工具结果默认不抽;只有能概括成跨项目可复用的风险、机制、稳定观察或方法证据时才抽。

[排除原则]
以下不是靠关键词黑名单排除,而是因为它们通常不能通过知识资格测试:
- 当前仓库或当前 skill 的文件名、队列名、缓存名、游标名、目录组织、命令参数、脚本入口。
- 本轮协作约定、权限边界、谁先改什么、某个测试断言如何修。
- 只保护当前实现不被写坏的红线,或只解释当前 pipeline 怎么流转的说明。
- 对评测/调试结果的流水账记录;除非它被抽象成跨项目的系统设计原则。
- schema、prompt、skill 设计里的局部定义;除非它揭示了更一般的知识组织或 agent 设计原则。

少量校准反例:当前项目里“某阶段不能改某文件”“某状态文件改叫什么”“用户要求本轮只改哪部分”都属于过程记录,不要抽。若要保留,必须改写成脱离当前项目后仍有意义的通用知识。

[结构化要求]
每条候选输出:
- form: practice | methodology | theory。使用形态,不是主题分类。
  - practice: 主要让 agent 下一次行为更准,如做/不做、遇到 A 先检查 B、稳定偏好或边界条件。
  - methodology: 同时包含怎么判断/怎么做和为什么这么做,人和 agent 都有用;同一长期问题里的 why、参数、证据边界、例子和反例应收在同一条 methodology 里,不要拆成 theory + practice。
  - theory: 主要帮助人理解概念、机制、本质、边界;默认 agent=null。
- domain: 领域词表中一项 | _unknown。
- title: 5-15 字短标题,只负责识别。
- abstract: 1-2 句描述性摘要,讲清这条是关于什么;不要写命令式或负例威胁。
- agent: 给 agent runtime 的自包含规则或套路。practice/methodology 必填;theory 默认 null。不要凭空造 checklist、失败条件或用户偏好。
- human: 给人看的说明。theory/methodology 必填;practice 可 null。先讲问题再上术语,说明 why / 概念 / 边界。
- attribution: 来源与归责对象,必填。kind 与 claim_owner 必须配对,adoption 受 kind 限制:
  · user_position → claim_owner=user; adoption 用 explicitly_adopted 或 discussed(禁 unendorsed)
  · assistant_explanation → claim_owner=assistant; adoption 用 discussed 或 unendorsed(禁 observed)
  · external_material → claim_owner=source; adoption 用 discussed 或 unendorsed(禁 observed)
  · tool_observation → claim_owner=tool; adoption 只能 observed
  形如 {"kind":...,"claim_owner":...,"adoption":...}
- evidence_quote: 原文证据 50-200 字。
- turn_range: [start, end]。

[输出格式]
只输出 JSON 数组,不要 markdown 代码围栏:
[
  {
    "form": "methodology",
    "domain": "system",
    "title": "...",
    "abstract": "...",
    "agent": "...",
    "human": "...",
    "attribution": {
      "kind": "user_position",
      "claim_owner": "user",
      "adoption": "explicitly_adopted"
    },
    "evidence_quote": "...",
    "turn_range": [142, 158]
  }
]

没有候选则输出 []。

[约束]
- 可以抽 AI 输出、外部资料和工具观察中的高价值内容,但必须正确写 attribution,不能伪装成用户立场。
- 不抽用户的问题或未定稿想法。
- 不抽资料 dump、原始工具输出、单次执行细节、通识定义。
- 宁缺毋滥。
- agent 字段不要凭空造严格 checklist 或失败条件。
```

## 交接给 merge

`capture` 完成后，把运行清单交给 `merge`。清单里的 `new_ids` 指向 `distill_stage1.json` 中的第一阶段候选，不是 `pending.json`：

```text
KNOWLEDGE_DIR=<知识目录>
MANIFEST=<orchestrate.py start-run 输出的 manifest 路径>
```

`merge` 完成后再推进处理位置。不要在本 skill 里对有候选的会话推进处理位置。
