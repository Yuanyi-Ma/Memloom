---
name: recall
description: 以文本聊天方式帮助用户复习 canonical 知识库中对人有用的知识；按轻量遗忘曲线调度到期条目，支持列表回放和费曼式互动问答，根据用户反馈“熟悉 / 不太熟悉 / 完全不熟悉”动态调整下次复习时间。用户要求复习知识、回顾知识、记忆曲线、主动回忆、费曼学习或“我们来复习一下”时使用。
---

# recall

把 `knowledge/canonical/*.json` 里的已审核知识变成人的复习会话。这个 skill 只做“使用阶段”的人类学习，不审核 pending，不抽取新知识，不服务 agent runtime 加载。

边界：

```text
canonical/*.json
review_state.json
review_log.jsonl
→ 脚本生成今日复习计划
→ 文本聊天展示列表回放或互动问答
→ 用户反馈掌握程度
→ 脚本更新下次复习时间并追加日志
```

## 文件

- 脚本：`scripts/recall.py`
- 项目知识目录：`$CWD/knowledge`
- 读取：`canonical/*.json`
- 写入：`review_state.json`、`review_log.jsonl`
- 不写：`canonical/*.json`、`pending.json`、`duplicates.json`、`rejected.json`

不要把项目知识库放进 skill 目录；skill 目录只放说明、脚本、测试和资源。

## 硬规则

- 复习状态不写入 canonical；只写 `review_state.json` 和 `review_log.jsonl`。
- 所有状态写入必须调用 `scripts/recall.py record`；不要手写 JSON。
- 不改 canonical 的 `title / abstract / agent / human / relations` 等内容字段。
- 复习中发现知识错误或表达问题，只在聊天里说明，并可记录到 `ai_feedback`；后续走审核/修订流程。
- 默认只复习对人有用的条目：
  - `form=theory` 且 `human` 非空。
  - `form=methodology` 且 `human` 非空。
  - `form=practice` 且 `attribution.claim_owner=user`，只默认列表回放。
- `temporal.invalid_at` 非空的条目不进入复习计划。
- 一次最多展示 8 条列表项；互动问答一次只问 1 道题。
- 互动问答中，AI 先出题，不给答案；用户先回答；AI 再评估。
- 题目必须考 canonical 知识本身，不惩罚用户不了解题目场景之外的新领域知识。

## 命令

初始化复习状态：

```bash
python3 .agents/skills/recall/scripts/recall.py init \
  --knowledge-dir "$PWD/knowledge"
```

生成今日计划：

```bash
python3 .agents/skills/recall/scripts/recall.py plan \
  --knowledge-dir "$PWD/knowledge" \
  --limit 8 \
  --qa-limit 3
```

指定领域：

```bash
python3 .agents/skills/recall/scripts/recall.py plan \
  --knowledge-dir "$PWD/knowledge" \
  --domain life \
  --limit 8 \
  --qa-limit 3
```

记录一次反馈：

```bash
python3 .agents/skills/recall/scripts/recall.py record \
  --knowledge-dir "$PWD/knowledge" \
  --item-id "$ITEM_ID" \
  --mode qa \
  --grade familiar \
  --user-summary "$USER_SUMMARY" \
  --ai-feedback "$AI_FEEDBACK"
```

查看状态：

```bash
python3 .agents/skills/recall/scripts/recall.py status \
  --knowledge-dir "$PWD/knowledge"
```

暂停某条：

```bash
python3 .agents/skills/recall/scripts/recall.py suspend \
  --knowledge-dir "$PWD/knowledge" \
  --item-id "$ITEM_ID"
```

## 记忆曲线

脚本使用轻量遗忘曲线模型：

```text
记忆保持率 = exp(-距离上次复习天数 / stability_days)
```

`stability_days` 是这条知识当前的记忆稳定度。脚本默认在保持率降到 `0.85` 左右时安排复习。

反馈更新：

| 用户反馈 | grade | 调度含义 |
|---|---|---|
| 熟悉 | `familiar` | 提高 `stability_days`，拉长间隔 |
| 不太熟悉 | `shaky` | 不明显拉长，优先保留短期复习 |
| 完全不熟悉 | `unknown` | 重置为短间隔，快速再复习 |

脚本会维护：

- `stability_days`
- `difficulty`
- `due_at`
- `interval_days`
- `last_grade`
- `mode_preference`

## 执行协议

1. 运行 `init`，确保 `review_state.json` 和 `review_log.jsonl` 存在。
2. 运行 `plan`。如果用户指定领域、数量、只列表或只问答，将这些条件传给脚本。
3. 先给用户展示计划摘要：今日主题、列表回放数量、互动问答数量。
4. 如果用户没有要求直接开始，允许用户调整计划。
5. 列表回放时按主题展示，每条只给核心摘要和“你要记住”。
6. 列表后收反馈：熟悉 / 不太熟悉 / 完全不熟悉 / 转问答 / 跳过。
7. 互动问答时对每条先生成题目，等待用户回答。
8. 用户回答后，对照 canonical 评估，给出掌握档位建议和修正。
9. 最终根据用户确认或 AI 建议调用 `record`。
10. 结束时汇报本轮复习了哪些条目、哪些被推迟到什么时候、哪些需要下次重点复习。

## 出题策略

互动问答前，先判断知识的复习目标类型。不要只按 `form` 生硬出题。

| 目标类型 | 识别线索 | 出题方式 |
|---|---|---|
| 表达结构类 | 写作、表达、论证、汇报、叙事结构、prompt 结构 | 给封闭情境，让用户用该结构组织表达 |
| 科研/理论类 | 科学原理、论文结论、机制解释、实验事实、概念边界 | 让用户完整讲清定义、机制、证据和边界 |
| 方法论类 | 判断框架、决策流程、操作方法、评估标准 | 给自包含决策场景，让用户说明如何判断和为什么 |
| 个人实践类 | 用户偏好、个人默认做法、个人选择 | 轻量回放或确认，不默认复杂问答 |
| 事实框架类 | 分类、对照、层级、术语表 | 让用户复述分类、对照和关键区别 |

场景题约束：

- 场景必须自包含；题目里给出回答所需背景。
- 题目明确说明“这题考什么能力”。
- 不把场景里的新领域知识当作评分点。
- 不直接泄露 canonical 的标准答案。
- 一道题只考一个核心知识点。

### 出题提示词

```text
你要为一条已审核知识生成一道复习题。先判断它的复习目标类型:
1. 表达结构类: 考用户能否在具体情境中使用这个表达结构。
2. 科研/理论类: 考用户能否清楚讲出定义、机制、证据和边界。
3. 方法论类: 考用户能否在场景中做判断，并说明依据。
4. 个人实践类: 只做轻量回放，确认用户是否还认可。
5. 事实框架类: 考用户能否复述分类、对照和关键区别。

[输入知识]
id/title/form/domain/abstract/agent/human/relations:
<<canonical item>>

[出题规则]
- 只输出一道题。
- 不要给答案。
- 如果是场景题，场景必须自包含，不要求用户知道题目外背景知识。
- 评分只围绕这条 canonical 知识，不惩罚额外背景知识缺失。
- 题目前先用一句话说明“这题考什么能力”。
- 题目要促使用户用自己的话回答，而不是复述标题。

[输出格式]
直接输出给用户看的题目，不要 JSON，不要 markdown 表格。
```

### 评估提示词

```text
你要评估用户对一条 canonical 知识的主动回忆。不要按措辞相似度评分，要按理解结构评分。

[canonical]
<<canonical item>>

[题目]
<<question>>

[用户回答]
<<answer>>

[评估维度]
- 核心结论是否说对。
- 机制/原因是否讲清。
- 边界/适用条件是否提到。
- 是否能应用到题目场景。
- 是否混入明显错误。

[输出]
先给建议档位: 熟悉 / 不太熟悉 / 完全不熟悉。
然后分三段:
你说对了:
- ...
缺了:
- ...
需要修正:
- ...

如果用户已经熟悉，反馈要短，不要强行讲一大段。
如果用户不太熟悉或完全不熟悉，最后要求他用 2-3 句话再复述一次。
```

## 反馈解析

| 用户表达 | grade |
|---|---|
| 熟悉 / 会了 / 没问题 / 这个掌握了 | `familiar` |
| 不太熟 / 有点忘 / 半懂 / 还行但不稳 | `shaky` |
| 完全不会 / 忘了 / 讲不出来 / 没掌握 | `unknown` |

如果用户没有明确反馈，AI 可以根据回答质量建议一个 grade，但记录前要让用户有机会覆盖。

## 输出风格

复习时保持短节奏：

- 先计划，再开始。
- 列表回放每条最多 2 句。
- 问答一次只问 1 题。
- 反馈先肯定答对部分，再指出缺口。
- 每次记录后告诉用户“下次复习时间”。
