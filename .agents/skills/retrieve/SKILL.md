---
name: retrieve
description: 检索并调用已审核 canonical 知识库的薄工具 skill；当全局规则、索引或用户明确要求按知识库回答时使用。通过脚本读取 knowledge/agent_index.md、搜索 canonical、按 id 获取具体知识或关系；不抽取、不审核、不合并、不全量注入上下文。
---

# retrieve

把 `knowledge/canonical/*.json` 中已经审核入库的知识按需读出来，供 Agent 在当前任务里使用。

这个 skill 只负责“检索和调用知识”。它不判断是否应该使用知识库，不抽取会话，不审核 pending，不修改 canonical。

## 文件

- 脚本：`scripts/retrieve.py`
- 项目知识目录：`$CWD/knowledge`
- 读取：`agent_index.md`、`canonical/*.json`
- 显式维护时写入：`agent_index.md`、`agent_views/*.md`
- 不写：`canonical/*.json`、`pending.json`、`duplicates.json`、`rejected.json`

不要把项目知识库放进 skill 目录；skill 目录只放说明、脚本和测试。

## 硬规则

- 默认不要全量读取 `canonical/*.json`。
- 先读索引或搜索，再按 id 精准读取具体条目。
- `search` 的结果只是候选召回；回答前应对命中的 id 再调用 `get`。
- `get` 返回的是已审核 canonical 内容，可以作为当前回答依据。
- `related` 只读取已写入 canonical 条目的关系，不做新的关系判断。
- 只有用户或维护流程明确要求重建索引时，才运行 `rebuild-index`。

## 命令

读取当前 Agent 可看的知识索引：

```bash
python3 .agents/skills/retrieve/scripts/retrieve.py index \
  --knowledge-dir "$PWD/knowledge"
```

按查询词召回相关知识：

```bash
python3 .agents/skills/retrieve/scripts/retrieve.py search \
  --knowledge-dir "$PWD/knowledge" \
  --query "冷泡 咖啡 茶" \
  --limit 5
```

限制领域：

```bash
python3 .agents/skills/retrieve/scripts/retrieve.py search \
  --knowledge-dir "$PWD/knowledge" \
  --domain life \
  --query "冷泡"
```

按 id 获取完整知识：

```bash
python3 .agents/skills/retrieve/scripts/retrieve.py get \
  --knowledge-dir "$PWD/knowledge" \
  --ids "0001,0002"
```

读取某条知识的关系邻居：

```bash
python3 .agents/skills/retrieve/scripts/retrieve.py related \
  --knowledge-dir "$PWD/knowledge" \
  --id "0001"
```

查看领域分布：

```bash
python3 .agents/skills/retrieve/scripts/retrieve.py domains \
  --knowledge-dir "$PWD/knowledge"
```

重建 Agent 索引：

```bash
python3 .agents/skills/retrieve/scripts/retrieve.py rebuild-index \
  --knowledge-dir "$PWD/knowledge"
```

## 执行协议

1. 如果全局规则已经提供了相关 id，直接运行 `get`。
2. 如果只有主题线索，先运行 `index` 或 `search`。
3. 用 `get` 读取最终要使用的 canonical 条目。
4. 如任务需要理解知识之间的关系，再运行 `related`。
5. 回答用户时，只使用与当前问题相关的知识；不要把脚本输出整段贴给用户。

## 输出

脚本只输出 JSON，方便 Agent 稳定消费。常见字段：

- `items`：命中的知识条目或摘要。
- `missing`：请求但不存在的 id。
- `domains`：领域统计。
- `content`：`agent_index.md` 的文本内容。
- `relations`：某条知识指向的关联知识。
