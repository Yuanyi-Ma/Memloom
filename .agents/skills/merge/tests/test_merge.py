import json
import subprocess
import tempfile
import unittest
from pathlib import Path


SKILL_ROOT = Path(__file__).resolve().parents[1]
SCRIPT = SKILL_ROOT / "scripts" / "merge.py"


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


class MergeScriptTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        self.knowledge = self.root / "knowledge"
        run_cmd("init", "--knowledge-dir", str(self.knowledge))

    def tearDown(self):
        self.tmp.cleanup()

    def write_extraction(self, items, name="extraction.json"):
        path = self.root / name
        path.write_text(json.dumps(items, ensure_ascii=False))
        return path

    def capture_one(self, item):
        extraction = self.write_extraction([item])
        result = run_cmd(
            "capture",
            "--extraction",
            str(extraction),
            "--session-id",
            "session-a",
            "--knowledge-dir",
            str(self.knowledge),
        )
        return json.loads(result.stdout)["new_ids"][0]

    def finalize_none(self, pid):
        judgment = self.root / f"none_{pid}.json"
        judgment.write_text(json.dumps({
            "m1_judgment": "none",
            "m1_neighbors": [],
            "m1_merge_preview": None,
            "matched_canonical_id": None,
        }))
        run_cmd(
            "finalize",
            "--candidate-id",
            pid,
            "--judgment",
            str(judgment),
            "--knowledge-dir",
            str(self.knowledge),
        )

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

    def test_finalize_update_writes_link_relation(self):
        canonical_dir = self.knowledge / "canonical"
        canonical_dir.mkdir(exist_ok=True)
        (canonical_dir / "writing.json").write_text(json.dumps({
            "0042": {
                "id": "0042",
                "form": "methodology",
                "domain": "writing",
                "title": "摘要动机贡献顺序",
                "abstract": "摘要要先写 motivation 再写 contribution。",
                "agent": "摘要先写 motivation，再写 contribution。",
                "human": "旧说明。",
            }
        }))
        pid = self.capture_one(self.valid_item())
        judgment = self.root / "judgment.json"
        judgment.write_text(json.dumps({
            "m1_judgment": "update",
            "m1_neighbors": [{"id": "0042", "sim": 0.82, "suggested_relation": "update"}],
            "m1_merge_preview": "融合后的完整内容。",
            "matched_canonical_id": None,
        }))
        run_cmd(
            "finalize",
            "--candidate-id",
            pid,
            "--judgment",
            str(judgment),
            "--knowledge-dir",
            str(self.knowledge),
        )
        pending = load_json(self.knowledge / "pending.json")
        stage1 = load_json(self.knowledge / "distill_stage1.json")
        self.assertEqual(pending[pid]["m1_judgment"], "update")
        self.assertEqual(pending[pid]["relations"], [{"type": "link", "id": "0042"}])
        self.assertNotIn(pid, stage1)

    def test_finalize_duplicate_moves_to_duplicates(self):
        canonical_dir = self.knowledge / "canonical"
        canonical_dir.mkdir(exist_ok=True)
        (canonical_dir / "writing.json").write_text(json.dumps({
            "0042": {
                "id": "0042",
                "form": "methodology",
                "domain": "writing",
                "title": "摘要结尾补结果",
                "abstract": "旧条。",
            }
        }))
        pid = self.capture_one(self.valid_item())
        judgment = self.root / "duplicate.json"
        judgment.write_text(json.dumps({
            "m1_judgment": "duplicate",
            "m1_neighbors": [{"id": "0042", "sim": 0.99, "suggested_relation": "link"}],
            "m1_merge_preview": None,
            "matched_canonical_id": "0042",
        }))
        run_cmd(
            "finalize",
            "--candidate-id",
            pid,
            "--judgment",
            str(judgment),
            "--knowledge-dir",
            str(self.knowledge),
        )
        pending = load_json(self.knowledge / "pending.json")
        stage1 = load_json(self.knowledge / "distill_stage1.json")
        duplicates = load_json(self.knowledge / "duplicates.json")
        self.assertNotIn(pid, pending)
        self.assertNotIn(pid, stage1)
        self.assertEqual(duplicates[pid]["matched_canonical_id"], "0042")

    def test_finalize_rejects_missing_canonical_neighbor(self):
        pid = self.capture_one(self.valid_item())
        judgment = self.root / "missing_neighbor.json"
        judgment.write_text(json.dumps({
            "m1_judgment": "link",
            "m1_neighbors": [{"id": "9999", "sim": 0.7, "suggested_relation": "link"}],
            "m1_merge_preview": None,
            "matched_canonical_id": None,
        }))
        result = run_cmd(
            "finalize",
            "--candidate-id",
            pid,
            "--judgment",
            str(judgment),
            "--knowledge-dir",
            str(self.knowledge),
            check=False,
        )
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("canonical ids not found: 9999", result.stderr)
        stage1 = load_json(self.knowledge / "distill_stage1.json")
        pending = load_json(self.knowledge / "pending.json")
        self.assertIn(pid, stage1)
        self.assertNotIn(pid, pending)

    def test_finalize_rejects_cross_form_update(self):
        canonical_dir = self.knowledge / "canonical"
        canonical_dir.mkdir(exist_ok=True)
        (canonical_dir / "writing.json").write_text(json.dumps({
            "0042": {
                "id": "0042",
                "form": "theory",
                "domain": "writing",
                "title": "摘要理论",
                "abstract": "理论条目。",
            }
        }))
        pid = self.capture_one(self.valid_item(form="methodology"))
        judgment = self.root / "bad_update.json"
        judgment.write_text(json.dumps({
            "m1_judgment": "update",
            "m1_neighbors": [{"id": "0042", "sim": 0.8, "suggested_relation": "update"}],
            "m1_merge_preview": "bad",
            "matched_canonical_id": None,
        }))
        result = run_cmd(
            "finalize",
            "--candidate-id",
            pid,
            "--judgment",
            str(judgment),
            "--knowledge-dir",
            str(self.knowledge),
            check=False,
        )
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("violates form constraint", result.stderr)

    def test_lookup_helpers(self):
        pid = self.capture_one(self.valid_item())
        stage1_candidate = run_cmd(
            "get-stage1-candidate",
            "--candidate-id",
            pid,
            "--knowledge-dir",
            str(self.knowledge),
        )
        self.assertEqual(json.loads(stage1_candidate.stdout)["id"], pid)

        judgment = self.root / "none.json"
        judgment.write_text(json.dumps({
            "m1_judgment": "none",
            "m1_neighbors": [],
            "m1_merge_preview": None,
            "matched_canonical_id": None,
        }))
        run_cmd(
            "finalize",
            "--candidate-id",
            pid,
            "--judgment",
            str(judgment),
            "--knowledge-dir",
            str(self.knowledge),
        )
        candidate = run_cmd(
            "get-candidate",
            "--candidate-id",
            pid,
            "--knowledge-dir",
            str(self.knowledge),
        )
        self.assertEqual(json.loads(candidate.stdout)["id"], pid)

        canonical_dir = self.knowledge / "canonical"
        canonical_dir.mkdir(exist_ok=True)
        (canonical_dir / "writing.json").write_text(json.dumps({"0042": {"id": "0042"}}))
        canonical = run_cmd(
            "get-canonical",
            "--ids",
            "0042",
            "--knowledge-dir",
            str(self.knowledge),
        )
        self.assertEqual(json.loads(canonical.stdout)["0042"]["id"], "0042")

    def test_pending_link_pass_appends_idempotent_relations(self):
        pid1 = self.capture_one(self.valid_item(
            title="冷萃比例判断",
            abstract="冷萃比例要按直接饮用还是加奶稀释来判断。",
            evidence_quote="冷萃比例不是固定的，要看最后是直接喝还是做浓缩再加奶。",
            turn_range=[10, 12],
        ))
        pid2 = self.capture_one(self.valid_item(
            title="冷萃萃取机制",
            abstract="冷萃依靠低温长时间萃取，风味和热萃后冷却不同。",
            evidence_quote="冷萃是低温长时间萃取，不是先热萃再放凉。",
            turn_range=[20, 22],
        ))
        self.finalize_none(pid1)
        self.finalize_none(pid2)

        links = self.root / "pending_links.json"
        links.write_text(json.dumps([
            {
                "source_id": pid1,
                "target_id": pid2,
                "target": "pending",
                "reason": "同属冷萃参数与机制，审核时应一起看。",
            }
        ], ensure_ascii=False))

        validated = run_cmd(
            "validate-pending-links",
            "--links",
            str(links),
            "--knowledge-dir",
            str(self.knowledge),
        )
        self.assertEqual(json.loads(validated.stdout)["count"], 1)

        first_apply = run_cmd(
            "apply-pending-links",
            "--links",
            str(links),
            "--knowledge-dir",
            str(self.knowledge),
        )
        second_apply = run_cmd(
            "apply-pending-links",
            "--links",
            str(links),
            "--knowledge-dir",
            str(self.knowledge),
        )
        self.assertEqual(json.loads(first_apply.stdout)["applied"], 1)
        self.assertEqual(json.loads(second_apply.stdout)["applied"], 0)

        pending = load_json(self.knowledge / "pending.json")
        self.assertEqual(pending[pid1]["relations"], [{
            "type": "link",
            "id": pid2,
            "target": "pending",
            "reason": "同属冷萃参数与机制，审核时应一起看。",
        }])

    def test_pending_link_pass_rejects_missing_target(self):
        pid = self.capture_one(self.valid_item())
        self.finalize_none(pid)
        links = self.root / "bad_pending_links.json"
        links.write_text(json.dumps([
            {
                "source_id": pid,
                "target_id": "p_missing",
                "target": "pending",
                "reason": "missing",
            }
        ]))

        result = run_cmd(
            "validate-pending-links",
            "--links",
            str(links),
            "--knowledge-dir",
            str(self.knowledge),
            check=False,
        )
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("pending link target not found: p_missing", result.stderr)

    def test_dump_pending_index_filters_by_ids_and_domain(self):
        pid1 = self.capture_one(self.valid_item(
            title="写作摘要收束",
            evidence_quote="摘要最后要补结果。",
            turn_range=[1, 2],
        ))
        pid2 = self.capture_one(self.valid_item(
            domain="ai",
            title="工具输出验证",
            abstract="工具调用后需要检查输出是否符合预期。",
            agent="工具调用后检查输出是否符合预期。",
            human="这条关注工具调用后的验证。",
            evidence_quote="工具跑完以后要看输出，不要只看退出码。",
            turn_range=[3, 4],
        ))
        self.finalize_none(pid1)
        self.finalize_none(pid2)

        rows = run_cmd(
            "dump-pending-index",
            "--ids",
            f"{pid1},{pid2}",
            "--domain",
            "ai",
            "--knowledge-dir",
            str(self.knowledge),
        )
        self.assertEqual([row["id"] for row in json.loads(rows.stdout)], [pid2])

    def test_dump_canonical_index_filters_by_domain(self):
        canonical_dir = self.knowledge / "canonical"
        canonical_dir.mkdir(exist_ok=True)
        (canonical_dir / "writing.json").write_text(json.dumps({
            "0042": {
                "id": "0042",
                "domain": "writing",
                "form": "methodology",
                "title": "摘要结尾补结果",
                "abstract": "摘要结尾需要补结果。",
            }
        }))
        (canonical_dir / "ai.json").write_text(json.dumps({
            "0099": {
                "id": "0099",
                "domain": "ai",
                "form": "methodology",
                "title": "工具调用验证",
                "abstract": "工具调用后要检查输出。",
            }
        }))

        filtered = run_cmd(
            "dump-canonical-index",
            "--domain",
            "writing",
            "--knowledge-dir",
            str(self.knowledge),
        )
        self.assertEqual([row["id"] for row in json.loads(filtered.stdout)], ["0042"])

        full = run_cmd(
            "dump-canonical-index",
            "--knowledge-dir",
            str(self.knowledge),
        )
        self.assertEqual({row["id"] for row in json.loads(full.stdout)}, {"0042", "0099"})

    def test_list_stage1(self):
        pid = self.capture_one(self.valid_item())
        rows = run_cmd(
            "list-stage1",
            "--knowledge-dir",
            str(self.knowledge),
        )
        ids = [row["id"] for row in json.loads(rows.stdout)]
        self.assertEqual(ids, [pid])


if __name__ == "__main__":
    unittest.main()
