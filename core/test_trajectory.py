import os, tempfile, unittest
from hive_cache import SharedSolutionCache
from trajectory_capture import export_training_data

class TrajectoryTest(unittest.TestCase):
    def test_export_filters_by_score_and_contributors(self):
        tmp = tempfile.mkdtemp()
        db = os.path.join(tmp, "c.db")
        c = SharedSolutionCache(db_path=db)
        c.record("zayif soru", "zayif cevap", weight=0.5)            # tek katkı, düşük skor
        c.record("guclu soru", "guclu cevap", weight=2.0)
        c.record("guclu soru", "guclu cevap", weight=2.0)            # 2 katkı, yüksek skor
        c.close()
        out = os.path.join(tmp, "train.jsonl")
        n = export_training_data(db, out, min_score=1.5, min_contributors=2)
        self.assertEqual(n, 1)
        lines = open(out).read().strip().splitlines()
        self.assertIn("guclu", lines[0])
        self.assertNotIn("zayif", "\n".join(lines))

if __name__ == "__main__":
    unittest.main()
