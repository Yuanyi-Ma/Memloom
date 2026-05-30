import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path


SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "retrieve.py"


def write_json(path: Path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n")


class RetrieveScriptTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.knowledge_dir = Path(self.tmp.name) / "knowledge"
        (self.knowledge_dir / "canonical").mkdir(parents=True)
        (self.knowledge_dir / "whitelist.yaml").write_text(
            "domains:\n  - life\n  - ai\n"
        )
        write_json(
            self.knowledge_dir / "canonical" / "life.json",
            {
                "0001": {
                    "id": "0001",
                    "domain": "life",
                    "form": "methodology",
                    "title": "冷泡茶选茶与陈年绿茶处理",
                    "abstract": "冷泡茶偏好嫩度高、清香型、低酚氨比的茶。",
                    "agent": "判断茶是否适合冷泡时，先看嫩度、香气和发酵烘焙程度。",
                    "human": "冷泡会放大嫩茶鲜甜，热泡更适合释放焙火和陈化层次。",
                    "relations": [{"type": "link", "id": "0002", "reason": "都涉及冷泡萃取"}],
                    "temporal": {"invalid_at": None},
                },
                "0002": {
                    "id": "0002",
                    "domain": "life",
                    "form": "theory",
                    "title": "冷泡咖啡萃取变量",
                    "abstract": "冷泡咖啡可通过粉水比、研磨度、时间和温度控制咖啡因与风味。",
                    "agent": "讨论冷泡咖啡时，把粉水比、时间、温度和研磨度作为关键变量。",
                    "human": "咖啡因不是只由萃取时间决定，粉水比和豆量会显著影响最终摄入。",
                    "relations": [],
                    "temporal": {"invalid_at": None},
                },
            },
        )
        write_json(
            self.knowledge_dir / "canonical" / "ai.json",
            {
                "0003": {
                    "id": "0003",
                    "domain": "ai",
                    "form": "practice",
                    "title": "按需读取知识库",
                    "abstract": "Agent 不应把 canonical 全量注入上下文，而应先读索引再按 id 获取知识。",
                    "agent": "需要使用知识库时先查索引，再按 id 精准读取。",
                    "human": None,
                    "relations": [],
                    "temporal": {"invalid_at": None},
                }
            },
        )

    def tearDown(self):
        self.tmp.cleanup()

    def run_script(self, *args):
        result = subprocess.run(
            [sys.executable, str(SCRIPT), "--knowledge-dir", str(self.knowledge_dir), *args],
            check=True,
            text=True,
            capture_output=True,
        )
        return json.loads(result.stdout)

    def test_domains_lists_counts(self):
        out = self.run_script("domains")
        self.assertEqual(out["total"], 3)
        self.assertEqual([domain["domain"] for domain in out["domains"]], ["life", "ai"])
        self.assertEqual(out["domains"][0]["count"], 2)

    def test_search_returns_ranked_short_results(self):
        out = self.run_script("search", "--query", "咖啡因 粉水比", "--domain", "life")
        self.assertGreaterEqual(out["total_matches"], 1)
        self.assertEqual(out["items"][0]["id"], "0002")
        self.assertNotIn("agent", out["items"][0])

    def test_get_returns_full_items_and_missing_ids(self):
        out = self.run_script("get", "--ids", "0002,missing")
        self.assertEqual([item["id"] for item in out["items"]], ["0002"])
        self.assertEqual(out["missing"], ["missing"])
        self.assertIn("agent", out["items"][0])
        self.assertTrue(out["items"][0]["active"])

    def test_related_returns_neighbors(self):
        out = self.run_script("related", "--id", "0001", "--brief")
        self.assertEqual(out["relations"][0]["item"]["id"], "0002")
        self.assertEqual(out["missing"], [])

    def test_rebuild_index_writes_agent_index_and_domain_views(self):
        out = self.run_script("rebuild-index")
        self.assertTrue(out["ok"])
        index_path = self.knowledge_dir / "agent_index.md"
        life_view = self.knowledge_dir / "agent_views" / "life.md"
        self.assertTrue(index_path.exists())
        self.assertTrue(life_view.exists())
        self.assertIn("冷泡咖啡萃取变量", index_path.read_text())
        self.assertIn("粉水比", life_view.read_text())


if __name__ == "__main__":
    unittest.main()
