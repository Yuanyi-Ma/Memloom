import json
import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path


SKILL_ROOT = Path(__file__).resolve().parents[1]
REPO_ROOT = Path(__file__).resolve().parents[4]
SCRIPT = SKILL_ROOT / "scripts" / "init.py"


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


class InitScriptTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        self.knowledge = self.root / "knowledge"

    def tearDown(self):
        self.tmp.cleanup()

    def run_init(self, *extra):
        return json.loads(
            run_cmd(
                "--workspace",
                str(REPO_ROOT),
                "--knowledge-dir",
                str(self.knowledge),
                "--skip-index",
                "--skip-review-check",
                *extra,
            ).stdout
        )

    def test_init_creates_core_and_recall_layout(self):
        out = self.run_init()
        self.assertTrue(out["ok"])
        self.assertTrue((self.knowledge / "canonical").is_dir())
        self.assertEqual(load_json(self.knowledge / "distill_stage1.json"), {})
        self.assertEqual(load_json(self.knowledge / "pending.json"), {})
        self.assertEqual(load_json(self.knowledge / "duplicates.json"), {})
        self.assertEqual(load_json(self.knowledge / "rejected.json"), {})
        self.assertEqual(load_json(self.knowledge / "history.json"), {"last_run_at": None, "sessions": {}})
        self.assertEqual(load_json(self.knowledge / "review_state.json"), {"version": 1, "items": {}})
        self.assertEqual((self.knowledge / "review_log.jsonl").read_text(), "")
        self.assertIn("blockchain", (self.knowledge / "whitelist.yaml").read_text())

    def test_init_does_not_overwrite_existing_files(self):
        self.knowledge.mkdir()
        (self.knowledge / "pending.json").write_text(json.dumps({"p_1": {"title": "keep"}}))
        (self.knowledge / "whitelist.yaml").write_text("domains:\n  - custom\n")
        self.run_init()
        self.assertEqual(load_json(self.knowledge / "pending.json"), {"p_1": {"title": "keep"}})
        self.assertEqual((self.knowledge / "whitelist.yaml").read_text(), "domains:\n  - custom\n")

    def test_init_rejects_non_object_json(self):
        self.knowledge.mkdir()
        (self.knowledge / "pending.json").write_text("[]")
        result = run_cmd(
            "--workspace",
            str(REPO_ROOT),
            "--knowledge-dir",
            str(self.knowledge),
            "--skip-index",
            "--skip-review-check",
            check=False,
        )
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("must contain a JSON object", result.stderr)

    def test_dry_run_reports_without_writing(self):
        out = json.loads(
            run_cmd(
                "--workspace",
                str(REPO_ROOT),
                "--knowledge-dir",
                str(self.knowledge),
                "--skip-index",
                "--skip-review-check",
                "--dry-run",
            ).stdout
        )
        self.assertTrue(out["dry_run"])
        self.assertFalse(self.knowledge.exists())
        self.assertTrue(any(action["status"] == "would_create" for action in out["actions"]))

    @unittest.skipUnless(shutil.which("node"), "node is required for index rebuild")
    def test_rebuilds_agent_index_with_review_script(self):
        (self.knowledge / "canonical").mkdir(parents=True)
        (self.knowledge / "whitelist.yaml").write_text("domains:\n  - life\n")
        (self.knowledge / "canonical" / "life.json").write_text(
            json.dumps(
                {
                    "0001": {
                        "id": "0001",
                        "domain": "life",
                        "form": "methodology",
                        "title": "Cold brew ratio",
                        "abstract": "Use ratio and time together.",
                    }
                }
            )
        )
        out = json.loads(
            run_cmd(
                "--workspace",
                str(REPO_ROOT),
                "--knowledge-dir",
                str(self.knowledge),
                "--skip-review-check",
            ).stdout
        )
        self.assertEqual(out["index"]["status"], "rebuilt")
        self.assertTrue((self.knowledge / "agent_index.md").exists())
        self.assertIn("Cold brew ratio", (self.knowledge / "agent_views" / "life.md").read_text())


if __name__ == "__main__":
    unittest.main()

