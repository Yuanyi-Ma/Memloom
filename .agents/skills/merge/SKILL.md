---
name: merge
description: 读取 distill 写入的 distill_stage1.json 第一阶段候选，优先使用生产编排脚本准备同领域 canonical 召回、校验 judgment、finalize 和 cursor commit；与 canonical 正式知识库对比，逐候选判定 duplicate/update/link/none；duplicate 写入 duplicates.json，其余写入 pending.json，并从 distill_stage1.json 移除；全部 finalize 后对本轮新 pending 候选做 link pass，补充 pending 到 canonical 或本轮 pending 的 relations。distill 完成无状态抽取后、用户要求做融合更新、关联探测、M1 判类、处理 stage1 候选、或把待审候选送入 pending 队列时使用。
---

# merge

把 `distill_stage1.json` 中的第一阶段候选，变成 UI 可审核的 `pending.json` 候选；完全重复的候选直接进 `duplicates.json`。

边界：

```text
distill_stage1.json 候选
→ 编排脚本读取同领域 canonical 索引
→ 每个候选独立判类
→ 编排脚本校验 judgment
→ 编排脚本 finalize：写 pending.json 或 duplicates.json，并清理 distill_stage1.json
→ 对本轮新进入 pending 的候选做关系补链
→ 编排脚本全部完成后推进处理位置
```

本 skill 不从会话 jsonl 抽新候选，不写 `canonical/*.json` 或 `rejected.json`，不替用户做最终入库决策。
脚本里保留的会话发现/预处理调试命令与 distill 使用同一套主会话过滤规则：只默认处理 `session_kind=main`，不会把 subagent 或 exec 会话送进知识抽取链路。

## 文件

- 编排脚本：`../distill/scripts/orchestrate.py`
- 底层脚本：`scripts/merge.py`
- 项目知识目录：`$CWD/knowledge`
- 输入：`distill_stage1.json`、`canonical/*.json`
- 输出：`pending.json`、`duplicates.json`、`history.json`
- 清理：每个 finalize 成功的候选都会从 `distill_stage1.json` 删除

不要把项目知识库放进 skill 目录；skill 目录只放说明、脚本、测试和资源。

## 硬规则

- 主流程只调度、读取、校验、finalize；不直接做语义判类。
- 每个候选单独判类；不要把多个候选放进同一个 LLM 请求。
- 可以并发处理多个候选，但每个候选处理子代理只能看该候选、canonical 索引、被召回的邻居。
- 如果 canonical 索引为空，不调用 LLM，直接对每个候选使用 `none` judgment。
- 第二步只输出判类和建议；绝不直接修改 `canonical/*.json`。
- `update` 不允许跨不同 `form`。
- `duplicate` 必须近乎完全一致；只要有新增信息，就不能判 duplicate。
- `update` 优先于 `link`：同 `domain`、同 `form`、主要回答同一个长期问题或决策模型，且 patch 进某条旧知识后会形成更完整的一条知识时，优先判 `update`。
- 候选“能单独读懂”不是阻止 `update` 的理由；只有当候选应该作为独立知识保留，或 patch 会让旧条过宽、混淆归责、混合不同问题时，才退回 `link`。
- `relations` 只保留粗粒度 `link`；更细的 `suggested_relation` 留在 `m1_neighbors` 里。
- 候选全部 finalize 后，必须对本轮新进入 `pending.json` 的候选做一次 link pass：每条新 pending 可链接同领域正式知识库条目，也可链接本轮其他新 pending 条目。
- link pass 只写 `relations`，不在 pending 之间做 duplicate/update/none 判类，不把历史 pending 默认纳入比较范围。
- 只有本次交接的候选全部 finalize 后，才推进处理位置。
- 任一候选校验或 finalize 失败时，不推进该 Session 游标；失败候选留在 `distill_stage1.json`。
- 如果为排查问题使用脚本里的会话发现/预处理命令，默认也只允许 `session_kind=main`；不要把 subagent / exec 会话作为 merge 输入来源。

## 命令

优先使用 distill 交接过来的运行清单 `MANIFEST`。编排脚本不做语义判类，只准备输入、校验输出、落盘和推进 cursor。

准备 merge 判类输入：

```bash
python3 ../distill/scripts/orchestrate.py prepare-merge \
  --manifest "$MANIFEST"
```

如果输出里的 `needs_llm` 非空，对这些候选逐个启动候选处理子代理。每个子代理读取对应 `task_path`，只写 `judgment_path`。

全部 judgment 文件就绪后 finalize：

```bash
python3 ../distill/scripts/orchestrate.py finalize \
  --manifest "$MANIFEST"
```

准备本轮 pending link pass：

```bash
python3 ../distill/scripts/orchestrate.py prepare-links \
  --manifest "$MANIFEST"
```

如果 `needs_llm=true`，用「本轮 pending link pass」读取 `links_input_path`，输出 JSON 数组到 `links_output_path`。如果同领域正式库和本轮同领域 pending 都没有可链接对象，编排脚本会自动写空数组，不调用 LLM。

写入 links 并推进 cursor：

```bash
python3 ../distill/scripts/orchestrate.py finish \
  --manifest "$MANIFEST"
```

底层调试命令仍可直接使用。

列出第一阶段缓存候选：

```bash
python3 scripts/merge.py list-stage1 \
  --knowledge-dir "$KNOWLEDGE_DIR"
```

读取某个候选：

```bash
python3 scripts/merge.py get-stage1-candidate \
  --candidate-id "$PID" \
  --knowledge-dir "$KNOWLEDGE_DIR"
```

读取正式知识库索引：

```bash
python3 scripts/merge.py dump-canonical-index \
  --domain "$CANDIDATE_DOMAIN" \
  --knowledge-dir "$KNOWLEDGE_DIR"
```

读取本轮新 pending 索引：

```bash
python3 scripts/merge.py dump-pending-index \
  --ids "$NEW_PENDING_IDS" \
  --knowledge-dir "$KNOWLEDGE_DIR"
```

读取邻居完整体：

```bash
python3 scripts/merge.py get-canonical \
  --ids "0042,0043" \
  --knowledge-dir "$KNOWLEDGE_DIR"
```

校验判类结果：

```bash
python3 scripts/merge.py validate-judgment \
  --judgment "/tmp/distill_judgment_$PID.json"
```

完成候选判类落档：

```bash
python3 scripts/merge.py finalize \
  --candidate-id "$PID" \
  --judgment "/tmp/distill_judgment_$PID.json" \
  --knowledge-dir "$KNOWLEDGE_DIR"
```

校验本轮 pending 关系建议：

```bash
python3 scripts/merge.py validate-pending-links \
  --links "/tmp/distill_pending_links.json" \
  --knowledge-dir "$KNOWLEDGE_DIR"
```

写入本轮 pending 关系建议：

```bash
python3 scripts/merge.py apply-pending-links \
  --links "/tmp/distill_pending_links.json" \
  --knowledge-dir "$KNOWLEDGE_DIR"
```

全部候选完成后推进处理位置：

```bash
python3 scripts/merge.py commit-cursor \
  --session-id "$SESSION_KEY" \
  --position "$LAST_CURSOR" \
  --knowledge-dir "$KNOWLEDGE_DIR"
```

## 执行协议

主流程（coordinator）负责确定候选集合、启动候选处理子代理、pending link pass 和报告结果；读取索引、校验 judgment、finalize、apply links、commit cursor 交给 `../distill/scripts/orchestrate.py`。

1. 接收 `MANIFEST`。如果没有运行清单，才退回底层命令按 `KNOWLEDGE_DIR` / `SESSION_KEY` / `NEW_IDS` 手动处理。
2. 运行 `orchestrate.py prepare-merge --manifest "$MANIFEST"`。脚本会读取每个 stage1 候选完整体，按候选 `domain` 读取同领域 canonical 索引；canonical 为空时自动写 `none` judgment。
3. 如果 `needs_llm` 非空，对这些候选单独启动候选处理子代理。每个子代理只能看该候选的 `task_path`：里面包含候选完整体、同领域 canonical 索引和 `judgment_output_path`。
4. 候选处理子代理先用“初筛提示词”从同领域 canonical 索引里找最多 5 个邻居。
5. 如果初筛返回 `[]`，直接写 `none` judgment，不做精判。
6. 如果初筛返回 id，用 `get-canonical` 读取这些邻居完整体，再用“精判提示词”输出 judgment。
7. 每个候选的 judgment 只写到运行清单指定的 `judgment_path`，不要写说明文本。
8. 全部 judgment 就绪后，运行 `orchestrate.py finalize --manifest "$MANIFEST"`。脚本会验证 judgment、验证引用 canonical id 存在、顺序 finalize，避免并发写 JSON 覆盖。
9. finalize 后脚本会记录所有进入 `pending.json` 的本轮新 id，记为 `new_pending_ids`；duplicate 不进入这组 id。
10. 如果 `new_pending_ids` 非空，运行 `orchestrate.py prepare-links --manifest "$MANIFEST"`。脚本会为每条新 pending 准备同领域 canonical 索引和本轮其他同领域 pending 索引。
11. 如果 `prepare-links` 输出 `needs_llm=true`，执行「本轮 pending link pass」，读取 `links_input_path`，输出 JSON 数组到 `links_output_path`；如果没有可链接对象，脚本会自动生成空 links 输出。
12. 运行 `orchestrate.py finish --manifest "$MANIFEST"`。脚本会校验并写入 pending links，然后只在所有步骤成功后推进处理位置。
13. 输出报告：处理候选数、四类分布、pending link 数、stage1 是否清理、处理位置是否推进。

`domain` 是召回范围控制。不要默认省略 `--domain` 做全库索引；只有用户明确要求跨领域查找，或候选 `domain` 明显错误且用户允许临时兜底时，才可以省略 `--domain`。

本轮 pending link pass 的召回范围也受 `domain` 控制：每个 source pending 只看同领域 canonical 索引，以及本轮新 pending 中同领域条目。默认不读取历史 pending，避免把未经审核的旧候选互相扩散；只有用户明确要求检查历史 pending 时才扩展范围。

## 判类边界

| 类别 | 定义 | 去向 |
|---|---|---|
| `duplicate` | 与某旧条几乎完全一致，没有新增信息 | `duplicates.json` |
| `update` | 与某旧条主要回答同一个长期问题或决策模型，有新增信息，且合入旧条后会形成更完整的一条知识 | `pending.json`，UI 展示融合预览 |
| `link` | 与旧条有具体逻辑关系，但不适合合并成一条知识 | `pending.json`，带 relations 建议 |
| `none` | 候选独立成立，且没有真正相关旧条 | `pending.json` |

判定优先级：

- `duplicate` 最严格：只有几乎完全一致且没有新增信息时才判。
- 对同 `domain`、同 `form` 的邻居，先判断是否能安全 patch 成更完整的一条知识；能就判 `update`。
- 候选可独立读懂不等于必须 `link`；如果它和旧条本质上是同一个长期问题的补充，仍优先 `update`。
- 新候选和邻居 `form` 不同，最多判 `link`，禁止 `update`。
- 以下情况不判 `update`，改判 `link`：候选回答的是另一个长期问题；需要保留成独立知识；多个旧条都同样适合作为目标；patch 后会让旧条过宽；候选和旧条的 `claim_owner` / attribution 冲突；二者只是上下位、互补、边界、引用或案例关系。
- 没有具体关系时才判 `none`。
- 拿不准 `update` 还是 `link` 时：如果只有一个明确主旧条，且合入后不会混淆问题或归责，倾向 `update`；否则倾向 `link`。

## 空正式库 judgment

正式知识库为空时，不调用 LLM，直接写：

```json
{"m1_judgment":"none","m1_neighbors":[],"m1_merge_preview":null,"matched_canonical_id":null}
```

## 初筛提示词

```text
你是一个知识库的关联初筛子代理。给定一条新候选知识,
从既有知识库索引中找出最可能相关的几条。

[输入]
新候选:
<<候选的 id/title/abstract/form/domain/attribution>>

既有知识库索引:
<<正式知识库索引 JSON: id/form/domain/title/abstract>>

[任务]
找出与新候选可能相关的旧条,按相关度从高到低排序,最多输出 K=5 条。
只做召回,不要做最终判类。
如果旧条和候选可能合并成同一条知识,`preliminary_judgment` 标为 `update`;如果只是具体相关但不适合合并,标为 `link`。

[输出格式]
只输出 JSON 数组,不要 markdown 代码围栏:
[
  {"id": "0017", "preliminary_judgment": "update"},
  {"id": "0023", "preliminary_judgment": "link"}
]

没有相关旧条则输出 []。
```

## 精判提示词

```text
你是一个知识库的关联精判子代理。已经初步选出几条可能与新候选相关的旧条,
现在对一个候选做最终判类。

[输入]
新候选完整体:
<<候选 JSON>>

候选邻居完整体:
<<正式知识库邻居 JSON>>

[判类]
duplicate: 与某旧条几乎完全一致,没有任何新增信息。
update: 与某旧条主要回答同一个长期问题或决策模型,有旧条没有的新信息,并且合入旧条后会形成更完整的一条知识。
link: 与旧条有具体逻辑关系,但不适合合并成一条知识。
none: 候选独立成立,且邻居都不真正相关。

[硬约束]
- 只要有任何新增信息,不要判 duplicate。
- update 优先于 link: 对同 domain、同 form 的邻居,先判断能否安全 patch 成更完整的一条知识;能就判 update。
- 候选可独立读懂不是禁止 update 的理由。
- 新候选和邻居 form 不同,最多判 link,禁止 update。
- 如果候选回答另一个长期问题、需要独立保留、多个旧条都同样适合作为目标、patch 后会让旧条过宽、或 attribution/claim_owner 冲突,不要判 update,改判 link。
- 不要改写新候选字段;只输出 judgment。
- m1_merge_preview 只在 update 时填写,内容是旧条 patch 后的 title/abstract/agent/human 整体预览,不是简单拼接;要给 UI 展示一条合并后的完整知识。

[输出格式]
只输出 JSON 对象,不要 markdown 代码围栏:
{
  "m1_judgment": "duplicate" | "update" | "link" | "none",
  "m1_neighbors": [
    {"id": "0017", "sim": 0.85, "suggested_relation": "link" | "update"}
  ],
  "m1_merge_preview": "<旧条 patch 后的 title/abstract/agent/human 整体内容>" | null,
  "matched_canonical_id": "0017" | null
}

[字段规则]
- duplicate: matched_canonical_id 必填,m1_merge_preview=null。
- update: m1_neighbors 非空,m1_merge_preview 必填,matched_canonical_id=null。
- link: m1_neighbors 非空,m1_merge_preview=null,matched_canonical_id=null。
- none: m1_neighbors=[],m1_merge_preview=null,matched_canonical_id=null。
```

## 本轮 pending link pass

这一步发生在所有本次候选 finalize 之后、commit-cursor 之前。它的目标不是再次融合，而是让 UI 能展示“这些待审知识应该一起看”。

输入范围：

- source：本轮 finalize 后新进入 `pending.json` 的每条候选。
- target：同领域 canonical 条目，以及本轮其他同领域 pending 条目。
- 默认不看历史 pending；需要看时必须由用户明确要求。

输出含义：

- pending → canonical：这条待审候选和某条正式知识有主题、上下位、互补或边界关系。
- pending → pending：本轮两条待审候选之间需要一起审核或未来可能互相引用。
- 不输出 duplicate/update/none；这些关系只进入 `relations`。

```text
你是知识库的本轮 pending 关联子代理。你不做融合,不做去重,只判断本轮新进入 pending 的候选之间、以及它们和正式知识库之间是否需要建立 link 关系。

[输入]
source pending:
<<一条本轮新 pending 的 id/form/domain/title/abstract>>

同领域 canonical 索引:
<<canonical index JSON>>

本轮其他同领域 pending 索引:
<<pending index JSON,不包含 source 自己>>

[任务]
为 source pending 找出值得审核界面展示的 link。
只有当 target 能帮助审核人理解 source 的上下文、边界、上位概念、互补关系或后续引用关系时才输出。

[不输出]
- 只是同领域但没有具体关系。
- 只是标题里有相同词。
- 需要 duplicate/update 判断才能成立的关系。
- source 指向自己。

[输出格式]
只输出 JSON 数组,不要 markdown 代码围栏:
[
  {
    "source_id": "p_20260528_036",
    "target_id": "p_20260528_023",
    "target": "pending",
    "reason": "同属冷泡饮品安全与保存边界,审核时应一起看。"
  },
  {
    "source_id": "p_20260528_036",
    "target_id": "0042",
    "target": "canonical",
    "reason": "正式知识提供上位概念或稳定边界。"
  }
]

没有关系则输出 []。
```

## 运行报告格式

```text
merge run @ <ISO time>

处理候选数: N
duplicate: x / update: y / link: z / none: w
pending links: z
stage1 已清理: yes/no
处理位置已推进: yes/no
校验: passed
```
