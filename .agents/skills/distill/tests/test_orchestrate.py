import json
import subprocess
import tempfile
import unittest
from pathlib import Path


SKILL_ROOT = Path(__file__).resolve().parents[1]
DISTILL = SKILL_ROOT / "scripts" / "distill.py"
ORCH = SKILL_ROOT / "scripts" / "orchestrate.py"


def run_distill(*args, check=True):
    result = subprocess.run(
        ["python3", str(DISTILL), *args],
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )
    if check and result.returncode != 0:
        raise AssertionError(
            f"distill failed: {' '.join(args)}\nstdout={result.stdout}\nstderr={result.stderr}"
        )
    return result


def run_orch(*args, check=True):
    result = subprocess.run(
        ["python3", str(ORCH), *args],
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )
    if check and result.returncode != 0:
        raise AssertionError(
            f"orchestrate failed: {' '.join(args)}\nstdout={result.stdout}\nstderr={result.stderr}"
        )
    return result


def load_json(path):
    return json.loads(Path(path).read_text())


class OrchestrateScriptTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        self.knowledge = self.root / "knowledge"
        self.run_dir = self.root / "run"
        self.project = self.root / "project"
        self.project.mkdir()
        run_distill("init", "--knowledge-dir", str(self.knowledge))

    def tearDown(self):
        self.tmp.cleanup()

    def write_jsonl(self, name, rows):
        path = self.project / f"{name}.jsonl"
        path.write_text("\n".join(json.dumps(row, ensure_ascii=False) for row in rows) + "\n")
        return path

    def valid_item(self):
        return {
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
            "turn_range": [1, 2],
        }

    def test_orchestrates_deterministic_pipeline_around_llm_outputs(self):
        session = self.write_jsonl(
            "session-a",
            [
                {
                    "uuid": "u1",
                    "type": "user",
                    "message": {"content": "写 abstract 的时候最后要补 result，不然 contribution 会悬空。"},
                    "sessionId": "session-a",
                    "cwd": str(self.project),
                    "isSidechain": False,
                },
                {
                    "uuid": "a1",
                    "type": "assistant",
                    "message": {"content": [{"type": "text", "text": "可以抽成写作方法。"}]},
                    "sessionId": "session-a",
                    "cwd": str(self.project),
                    "isSidechain": False,
                },
            ],
        )
        sessions_file = self.root / "sessions.json"
        sessions_file.write_text(json.dumps([
            {
                "name": "writing-session",
                "agent": "claudecode",
                "session_key": "claudecode:session-a",
                "jsonl_path": str(session),
            }
        ]))

        start = json.loads(run_orch(
            "start-run",
            "--knowledge-dir",
            str(self.knowledge),
            "--sessions",
            str(sessions_file),
            "--run-dir",
            str(self.run_dir),
        ).stdout)
        manifest = Path(start["manifest"])
        self.assertTrue(manifest.exists())
        extraction_path = Path(load_json(manifest)["sessions"][0]["extraction_path"])
        extraction_path.parent.mkdir(parents=True, exist_ok=True)
        extraction_path.write_text(json.dumps([self.valid_item()], ensure_ascii=False))

        fusion = json.loads(run_orch("prepare-fusion", "--manifest", str(manifest)).stdout)
        self.assertFalse(fusion["needs_llm"])
        run_orch("apply-fusion", "--manifest", str(manifest))

        capture = json.loads(run_orch("capture", "--manifest", str(manifest)).stdout)
        pid = capture["new_ids"][0]
        self.assertTrue(pid.startswith("p_"))

        merge = json.loads(run_orch("prepare-merge", "--manifest", str(manifest)).stdout)
        self.assertEqual(merge["auto_none"], [pid])
        run_orch("finalize", "--manifest", str(manifest))

        links = json.loads(run_orch("prepare-links", "--manifest", str(manifest)).stdout)
        self.assertFalse(links["needs_llm"])
        self.assertEqual(load_json(links["links_output_path"]), [])
        finish = json.loads(run_orch("finish", "--manifest", str(manifest)).stdout)
        self.assertEqual(finish["status"], "complete")

        pending = load_json(self.knowledge / "pending.json")
        self.assertIn(pid, pending)
        self.assertEqual(pending[pid]["m1_judgment"], "none")
        self.assertEqual(load_json(self.knowledge / "distill_stage1.json"), {})
        history = load_json(self.knowledge / "history.json")
        self.assertIn("claudecode:session-a", history["sessions"])


if __name__ == "__main__":
    unittest.main()
