import json
import subprocess
import tempfile
import unittest
from pathlib import Path


SKILL_ROOT = Path(__file__).resolve().parents[1]
SCRIPT = SKILL_ROOT / "scripts" / "distill.py"


def run_cmd(*args, check=True):
    result = subprocess.run(
        ["python3", str(SCRIPT), *args],
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )
    if check and result.returncode != 0:
        raise AssertionError(
            f"command failed: {' '.join(args)}\nstdout={result.stdout}\nstderr={result.stderr}"
        )
    return result


def load_json(path):
    return json.loads(Path(path).read_text())


class DistillScriptTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        self.knowledge = self.root / "knowledge"
        self.project = self.root / "project"
        self.project.mkdir()
        run_cmd("init", "--knowledge-dir", str(self.knowledge))

    def tearDown(self):
        self.tmp.cleanup()

    def write_jsonl(self, name, rows):
        path = self.project / f"{name}.jsonl"
        path.write_text("\n".join(json.dumps(row, ensure_ascii=False) for row in rows) + "\n")
        return path

    def write_extraction(self, items, name="extraction.json"):
        path = self.root / name
        path.write_text(json.dumps(items, ensure_ascii=False))
        return path

    def valid_item(self, **overrides):
        item = {
            "form": "methodology",
            "domain": "writing",
            "title": "摘要结尾补结果",
            "abstract": "写论文摘要时，结尾需要补一句结果，否则贡献会显得悬空。",
            "agent": "写摘要时在 motivation 和 contribution 后补一句核心 result。",
            "human": "这条关注 abstract 的收束问题：只写 motivation 和 contribution 会让读者不知道贡献是否被验证。",
            "attribution": {
                "kind": "user_position",
                "claim_owner": "user",
                "adoption": "explicitly_adopted",
            },
            "evidence_quote": "写 abstract 的时候最后要补 result，不然 contribution 会悬空。",
            "turn_range": [1, 3],
        }
        item.update(overrides)
        return item

    def test_preprocess_filters_display_text_and_uses_cursor(self):
        session = self.write_jsonl(
            "session-a",
            [
                {"uuid": "u1", "type": "user", "message": {"content": "Luke says keep this."}},
                {
                    "uuid": "a1",
                    "type": "assistant",
                    "message": {"content": [{"type": "text", "text": "Assistant text."}]},
                },
                {
                    "uuid": "tool",
                    "type": "user",
                    "message": {"content": [{"type": "tool_result", "content": "ignore me"}]},
                },
                {"uuid": "sys", "type": "system", "message": {"content": "ignore system"}},
            ],
        )
        out = self.root / "chunk.txt"
        result = run_cmd(
            "preprocess",
            "--jsonl",
            str(session),
            "--knowledge-dir",
            str(self.knowledge),
            "--out",
            str(out),
        )
        meta = json.loads(result.stdout)
        chunk = out.read_text()
        self.assertEqual(meta["new_turns_count"], 2)
        self.assertEqual(meta["last_seen_uuid"], "sys")
        self.assertIn("Luke says keep this.", chunk)
        self.assertIn("Assistant text.", chunk)
        self.assertNotIn("ignore me", chunk)
        self.assertNotIn("ignore system", chunk)

    def test_preprocess_codex_response_item_messages(self):
        session = self.write_jsonl(
            "codex-a",
            [
                {"timestamp": "2026-05-26T00:00:00Z", "type": "session_meta", "payload": {"id": "c1", "cwd": "/tmp/demo"}},
                {
                    "timestamp": "2026-05-26T00:00:01Z",
                    "type": "response_item",
                    "payload": {
                        "type": "message",
                        "role": "user",
                        "content": [{"type": "input_text", "text": "Codex user text."}],
                    },
                },
                {"type": "event_msg", "payload": {"type": "user_message", "message": "duplicate event"}},
                {"type": "response_item", "payload": {"type": "function_call_output", "output": "ignore tool"}},
                {
                    "timestamp": "2026-05-26T00:00:02Z",
                    "type": "response_item",
                    "payload": {
                        "type": "message",
                        "role": "assistant",
                        "content": [{"type": "output_text", "text": "Codex assistant text."}],
                    },
                },
            ],
        )
        out = self.root / "codex_chunk.txt"
        result = run_cmd(
            "preprocess",
            "--jsonl",
            str(session),
            "--agent",
            "codex",
            "--session-key",
            "codex:codex-a",
            "--knowledge-dir",
            str(self.knowledge),
            "--out",
            str(out),
        )
        meta = json.loads(result.stdout)
        chunk = out.read_text()
        self.assertEqual(meta["agent"], "codex")
        self.assertEqual(meta["new_turns_count"], 2)
        self.assertEqual(meta["last_seen_cursor"], "line:5")
        self.assertIsNone(meta["last_seen_uuid"])
        self.assertIn("Codex user text.", chunk)
        self.assertIn("Codex assistant text.", chunk)
        self.assertNotIn("duplicate event", chunk)
        self.assertNotIn("ignore tool", chunk)

    def test_codex_line_cursor_skips_processed_lines(self):
        session = self.write_jsonl(
            "codex-b",
            [
                {"type": "response_item", "payload": {"type": "message", "role": "user", "content": [{"type": "input_text", "text": "old"}]}},
                {"type": "response_item", "payload": {"type": "message", "role": "assistant", "content": [{"type": "output_text", "text": "also old"}]}},
                {"type": "response_item", "payload": {"type": "message", "role": "user", "content": [{"type": "input_text", "text": "new"}]}},
            ],
        )
        run_cmd(
            "commit-cursor",
            "--session-id",
            "codex:codex-b",
            "--position",
            "line:2",
            "--agent",
            "codex",
            "--knowledge-dir",
            str(self.knowledge),
        )
        out = self.root / "cursor_chunk.txt"
        result = run_cmd(
            "preprocess",
            "--jsonl",
            str(session),
            "--agent",
            "codex",
            "--session-key",
            "codex:codex-b",
            "--knowledge-dir",
            str(self.knowledge),
            "--out",
            str(out),
        )
        meta = json.loads(result.stdout)
        self.assertEqual(meta["last_processed_cursor_before"], "line:2")
        self.assertEqual(meta["new_turns_count"], 1)
        chunk = out.read_text()
        self.assertIn("new", chunk)
        self.assertNotIn("old", chunk)

    def test_list_agent_sessions_discovers_claudecode_and_codex(self):
        claude_root = self.root / "claude-projects"
        codex_root = self.root / "codex-sessions"
        (claude_root / "proj").mkdir(parents=True)
        (claude_root / "proj" / "claude-a" / "subagents").mkdir(parents=True)
        (codex_root / "2026" / "05" / "26").mkdir(parents=True)
        (claude_root / "proj" / "claude-a.jsonl").write_text(json.dumps({
            "uuid": "u1",
            "type": "user",
            "message": {"content": "Claude text"},
            "sessionId": "claude-a",
            "cwd": "/tmp/claude",
            "isSidechain": False,
            "timestamp": "2026-05-26T00:00:00Z",
        }) + "\n")
        (claude_root / "proj" / "claude-a" / "subagents" / "agent-a.jsonl").write_text(json.dumps({
            "uuid": "su1",
            "type": "user",
            "message": {"content": "Claude subagent text"},
            "sessionId": "claude-a",
            "cwd": "/tmp/claude",
            "isSidechain": True,
            "timestamp": "2026-05-26T00:00:01Z",
        }) + "\n")
        (codex_root / "2026" / "05" / "26" / "codex-a.jsonl").write_text("\n".join([
            json.dumps({"type": "session_meta", "payload": {"id": "codex-a", "cwd": "/tmp/codex", "timestamp": "2026-05-26T00:00:00Z", "thread_source": "user"}}),
            json.dumps({"type": "response_item", "payload": {"type": "message", "role": "user", "content": [{"type": "input_text", "text": "Codex text"}]}}),
        ]) + "\n")
        (codex_root / "2026" / "05" / "26" / "codex-subagent.jsonl").write_text("\n".join([
            json.dumps({"type": "session_meta", "payload": {"id": "codex-subagent", "cwd": "/tmp/codex", "timestamp": "2026-05-26T00:00:01Z", "thread_source": "subagent", "source": {"subagent": {"other": "guardian"}}}}),
            json.dumps({"type": "response_item", "payload": {"type": "message", "role": "user", "content": [{"type": "input_text", "text": "Codex subagent text"}]}}),
        ]) + "\n")

        result = run_cmd(
            "list-agent-sessions",
            "--knowledge-dir",
            str(self.knowledge),
            "--claudecode-root",
            str(claude_root),
            "--codex-root",
            str(codex_root),
            "--limit",
            "10",
        )
        rows = json.loads(result.stdout)
        agents = {row["agent"] for row in rows}
        self.assertEqual(agents, {"claudecode", "codex"})
        self.assertTrue(all(row["session_kind"] == "main" for row in rows))
        self.assertNotIn("Claude subagent text", json.dumps(rows))
        self.assertNotIn("Codex subagent text", json.dumps(rows))
        self.assertTrue(all(row["new_turns_count"] >= 1 for row in rows))

        all_result = run_cmd(
            "list-agent-sessions",
            "--knowledge-dir",
            str(self.knowledge),
            "--claudecode-root",
            str(claude_root),
            "--codex-root",
            str(codex_root),
            "--session-kind",
            "all",
            "--limit",
            "10",
        )
        all_rows = json.loads(all_result.stdout)
        kinds = {row["session_kind"] for row in all_rows}
        self.assertEqual(kinds, {"main", "subagent"})

    def test_preprocess_rejects_subagent_sessions_by_default(self):
        claude_subagent = self.project / "parent" / "subagents" / "agent-a.jsonl"
        claude_subagent.parent.mkdir(parents=True)
        claude_subagent.write_text(json.dumps({
            "uuid": "su1",
            "type": "user",
            "message": {"content": "Claude subagent text"},
            "sessionId": "parent",
            "cwd": "/tmp/claude",
            "isSidechain": True,
        }) + "\n")
        codex_subagent = self.write_jsonl(
            "codex-subagent",
            [
                {"type": "session_meta", "payload": {"id": "codex-subagent", "cwd": "/tmp/codex", "thread_source": "subagent", "source": {"subagent": {"other": "guardian"}}}},
                {"type": "response_item", "payload": {"type": "message", "role": "user", "content": [{"type": "input_text", "text": "Codex subagent text"}]}},
            ],
        )

        claude_result = run_cmd(
            "preprocess",
            "--jsonl",
            str(claude_subagent),
            "--agent",
            "claudecode",
            "--knowledge-dir",
            str(self.knowledge),
            check=False,
        )
        self.assertNotEqual(claude_result.returncode, 0)
        self.assertIn("is subagent", claude_result.stderr)

        codex_result = run_cmd(
            "preprocess",
            "--jsonl",
            str(codex_subagent),
            "--agent",
            "codex",
            "--knowledge-dir",
            str(self.knowledge),
            check=False,
        )
        self.assertNotEqual(codex_result.returncode, 0)
        self.assertIn("is subagent", codex_result.stderr)

    def test_capture_validates_and_writes_stage1(self):
        extraction = self.write_extraction([self.valid_item()])
        result = run_cmd(
            "capture",
            "--extraction",
            str(extraction),
            "--session-id",
            "session-a",
            "--knowledge-dir",
            str(self.knowledge),
        )
        pid = json.loads(result.stdout)["new_ids"][0]
        stage1 = load_json(self.knowledge / "distill_stage1.json")
        pending = load_json(self.knowledge / "pending.json")
        self.assertIn(pid, stage1)
        self.assertNotIn(pid, pending)
        self.assertEqual(stage1[pid]["form"], "methodology")
        self.assertEqual(stage1[pid]["attribution"]["kind"], "user_position")
        self.assertEqual(stage1[pid]["audit_status"], "pending")
        self.assertEqual(stage1[pid]["m1_judgment"], None)
        self.assertEqual(stage1[pid]["weight"], {"use_count": 0, "last_used": None})

    def test_capture_is_idempotent_for_same_source_signature(self):
        item = self.valid_item()
        first = self.write_extraction([item], "first.json")
        second = self.write_extraction([item], "second.json")
        run_cmd(
            "capture",
            "--extraction",
            str(first),
            "--session-id",
            "session-a",
            "--knowledge-dir",
            str(self.knowledge),
        )
        result = run_cmd(
            "capture",
            "--extraction",
            str(second),
            "--session-id",
            "session-a",
            "--knowledge-dir",
            str(self.knowledge),
        )
        payload = json.loads(result.stdout)
        self.assertEqual(payload["new_ids"], [])
        self.assertEqual(len(payload["skipped"]), 1)

    def test_capture_rejects_invalid_theory_without_human(self):
        extraction = self.write_extraction([
            self.valid_item(form="theory", agent=None, human=None)
        ])
        result = run_cmd(
            "capture",
            "--extraction",
            str(extraction),
            "--session-id",
            "session-a",
            "--knowledge-dir",
            str(self.knowledge),
            check=False,
        )
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("human is required for theory", result.stderr)

    def test_capture_rejects_invalid_attribution_owner(self):
        extraction = self.write_extraction([
            self.valid_item(attribution={
                "kind": "assistant_explanation",
                "claim_owner": "user",
                "adoption": "discussed",
            })
        ])
        result = run_cmd(
            "capture",
            "--extraction",
            str(extraction),
            "--session-id",
            "session-a",
            "--knowledge-dir",
            str(self.knowledge),
            check=False,
        )
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("claim_owner must be 'assistant'", result.stderr)


if __name__ == "__main__":
    unittest.main()
