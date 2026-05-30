import json
import subprocess
import tempfile
import unittest
from pathlib import Path


SKILL_ROOT = Path(__file__).resolve().parents[1]
SCRIPT = SKILL_ROOT / "scripts" / "recall.py"


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


class RecallScriptTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        self.knowledge = self.root / "knowledge"
        (self.knowledge / "canonical").mkdir(parents=True)
        (self.knowledge / "canonical" / "life.json").write_text(json.dumps({
            "life_coffee_001": {
                "id": "life_coffee_001",
                "form": "methodology",
                "domain": "life",
                "title": "冷泡咖啡比例与咖啡因控制",
                "abstract": "粉水比要结合喝法和咖啡因目标判断。",
                "agent": "给冷泡建议时先确认喝法和咖啡因目标。",
                "human": "固定粉量时咖啡因主要由粉量和喝掉多少决定，粉水比更多影响入口浓度。",
                "relations": [{"type": "link", "id": "life_tea_001"}],
                "attribution": {
                    "kind": "assistant_explanation",
                    "claim_owner": "assistant",
                    "adoption": "discussed",
                },
            },
            "life_tea_001": {
                "id": "life_tea_001",
                "form": "methodology",
                "domain": "life",
                "title": "冷泡茶参数与安全萃取",
                "abstract": "冷泡茶按 1:100、6-8 小时、到点过滤作为基础。",
                "agent": "回答冷泡茶时给出比例、时间和安全窗口。",
                "human": "冷泡茶风险主要是微生物，不是咖啡因；低温也限制儿茶素释放。",
                "relations": [{"type": "link", "id": "life_coffee_001"}],
                "attribution": {
                    "kind": "assistant_explanation",
                    "claim_owner": "assistant",
                    "adoption": "discussed",
                },
            },
            "life_pref_001": {
                "id": "life_pref_001",
                "form": "practice",
                "domain": "life",
                "title": "Luke 冷泡实验偏好",
                "abstract": "Luke 偏好固定 20g 对比 1:12 和 1:15。",
                "agent": "协助 Luke 时默认考虑这个偏好。",
                "human": None,
                "relations": [],
                "attribution": {
                    "kind": "user_position",
                    "claim_owner": "user",
                    "adoption": "explicitly_adopted",
                },
            },
            "life_agent_only_001": {
                "id": "life_agent_only_001",
                "form": "practice",
                "domain": "life",
                "title": "Agent-only rule",
                "abstract": "只给 agent 的规则。",
                "agent": "执行某动作。",
                "human": None,
                "relations": [],
                "attribution": {
                    "kind": "assistant_explanation",
                    "claim_owner": "assistant",
                    "adoption": "discussed",
                },
            },
            "life_invalid_001": {
                "id": "life_invalid_001",
                "form": "theory",
                "domain": "life",
                "title": "失效知识",
                "abstract": "不应复习。",
                "agent": None,
                "human": "这条已经失效。",
                "relations": [],
                "temporal": {"invalid_at": "2026-05-01T00:00:00Z"},
                "attribution": {
                    "kind": "assistant_explanation",
                    "claim_owner": "assistant",
                    "adoption": "discussed",
                },
            },
        }, ensure_ascii=False))

    def tearDown(self):
        self.tmp.cleanup()

    def test_plan_selects_human_usable_items_only(self):
        run_cmd("init", "--knowledge-dir", str(self.knowledge))
        plan = json.loads(run_cmd(
            "plan",
            "--knowledge-dir",
            str(self.knowledge),
            "--date",
            "2026-05-30",
            "--limit",
            "10",
            "--qa-limit",
            "3",
            "--domain",
            "life",
        ).stdout)
        ids = {item["id"] for item in plan["items"]}
        self.assertIn("life_coffee_001", ids)
        self.assertIn("life_tea_001", ids)
        self.assertIn("life_pref_001", ids)
        self.assertNotIn("life_agent_only_001", ids)
        self.assertNotIn("life_invalid_001", ids)
        pref = next(item for item in plan["items"] if item["id"] == "life_pref_001")
        self.assertEqual(pref["mode"], "list")

    def test_record_familiar_extends_interval_and_logs(self):
        run_cmd("init", "--knowledge-dir", str(self.knowledge))
        result = json.loads(run_cmd(
            "record",
            "--knowledge-dir",
            str(self.knowledge),
            "--item-id",
            "life_coffee_001",
            "--mode",
            "qa",
            "--grade",
            "familiar",
            "--date",
            "2026-05-30",
            "--reviewed-at",
            "2026-05-30T10:00:00Z",
            "--user-summary",
            "固定粉量时咖啡因主要由粉量和喝掉多少决定。",
            "--ai-feedback",
            "回答清楚。",
        ).stdout)
        self.assertGreaterEqual(result["interval_days"], 2)
        state = load_json(self.knowledge / "review_state.json")
        item_state = state["items"]["life_coffee_001"]
        self.assertEqual(item_state["last_grade"], "familiar")
        self.assertGreater(item_state["stability_days"], 6)
        logs = (self.knowledge / "review_log.jsonl").read_text().strip().splitlines()
        self.assertEqual(len(logs), 1)
        self.assertEqual(json.loads(logs[0])["grade"], "familiar")

    def test_unknown_resets_to_short_interval(self):
        run_cmd("init", "--knowledge-dir", str(self.knowledge))
        run_cmd(
            "record",
            "--knowledge-dir",
            str(self.knowledge),
            "--item-id",
            "life_coffee_001",
            "--mode",
            "qa",
            "--grade",
            "familiar",
            "--date",
            "2026-05-30",
        )
        result = json.loads(run_cmd(
            "record",
            "--knowledge-dir",
            str(self.knowledge),
            "--item-id",
            "life_coffee_001",
            "--mode",
            "qa",
            "--grade",
            "unknown",
            "--date",
            "2026-06-02",
        ).stdout)
        self.assertEqual(result["interval_days"], 1)
        self.assertEqual(result["next_due_at"], "2026-06-03")
        state = load_json(self.knowledge / "review_state.json")
        self.assertEqual(state["items"]["life_coffee_001"]["lapse_count"], 1)

    def test_suspend_removes_item_from_plan(self):
        run_cmd("init", "--knowledge-dir", str(self.knowledge))
        run_cmd("suspend", "--knowledge-dir", str(self.knowledge), "--item-id", "life_tea_001")
        plan = json.loads(run_cmd(
            "plan",
            "--knowledge-dir",
            str(self.knowledge),
            "--date",
            "2026-05-30",
            "--limit",
            "10",
            "--qa-limit",
            "3",
        ).stdout)
        ids = {item["id"] for item in plan["items"]}
        self.assertNotIn("life_tea_001", ids)


if __name__ == "__main__":
    unittest.main()
