"""
Kovan motoru testleri — saf stdlib (unittest), torch gerekmez.
Çalıştır:  cd core && python3 -m unittest test_hive -v
"""

import os
import tempfile
import unittest

from security import ReputationSystem, Honeypot
from hive_cache import SharedSolutionCache
from hive_engine import HiveEngine, NodeAnswer


def fresh_engine(tmp):
    rep = ReputationSystem(db_path=os.path.join(tmp, "rep.db"))
    cache = SharedSolutionCache(db_path=os.path.join(tmp, "cache.db"), sim_threshold=0.72)
    return HiveEngine(reputation=rep, cache=cache, honeypot=Honeypot())


class HiveCacheTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp()

    def test_record_and_lookup_exact(self):
        c = SharedSolutionCache(db_path=os.path.join(self.tmp, "c.db"))
        c.record("Python nedir?", "Python bir programlama dilidir.")
        hit = c.lookup("Python nedir?")
        self.assertIsNotNone(hit)
        self.assertIn("programlama", hit.output)

    def test_lookup_similar_query(self):
        c = SharedSolutionCache(db_path=os.path.join(self.tmp, "c.db"), sim_threshold=0.5)
        c.record("federated learning nedir", "Veriyi merkezileştirmeden eğitme yöntemidir.")
        # Benzer ama birebir aynı olmayan soru retrieval ile bulunmalı.
        hit = c.lookup("federated learning nedir bu")
        self.assertIsNotNone(hit)

    def test_repeated_record_strengthens_score(self):
        c = SharedSolutionCache(db_path=os.path.join(self.tmp, "c.db"))
        c.record("2+2", "4", weight=1.0)
        c.record("2+2", "4", weight=1.0)
        hit = c.lookup("2+2")
        self.assertGreaterEqual(hit.score, 2.0)


class HiveConsensusTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp()

    def test_majority_wins_over_minority(self):
        """3 düğüm '4' der, 1 düğüm '5' der → kovan '4' demeli."""
        eng = fresh_engine(self.tmp)
        answers = [
            NodeAnswer("n1", "4"),
            NodeAnswer("n2", "4"),
            NodeAnswer("n3", "4"),
            NodeAnswer("n4", "5"),
        ]
        res = eng.answer("2+2 kactir?", answers)
        self.assertEqual(res.answer, "4")
        self.assertEqual(res.source, "consensus")
        self.assertTrue(res.detail["decisive"])
        self.assertEqual(res.cluster_size, 3)

    def test_more_nodes_higher_agreement(self):
        """Daha çok hemfikir düğüm → daha yüksek mutabakat (güç ölçeklenir)."""
        eng = fresh_engine(self.tmp)
        small = eng.answer("soru A", [NodeAnswer("a", "cevap x"), NodeAnswer("b", "cevap y")])
        eng2 = fresh_engine(tempfile.mkdtemp())
        big = eng2.answer(
            "soru A",
            [NodeAnswer(f"n{i}", "cevap x") for i in range(9)] + [NodeAnswer("z", "cevap y")],
        )
        self.assertGreater(big.agreement, small.agreement)

    def test_reputation_weights_consensus(self):
        """Yüksek itibarlı tek düğüm, düşük itibarlı iki düğümü yenebilir."""
        eng = fresh_engine(self.tmp)
        # 'pro' düğümü güçlendir, 'spam' düğümlerini düşür.
        for _ in range(10):
            eng.rep.record_task("pro", passed=True)
        for _ in range(10):
            eng.rep.record_task("spam1", passed=False)
            eng.rep.record_task("spam2", passed=False)
        res = eng.answer(
            "zor soru",
            [NodeAnswer("pro", "dogru cevap"), NodeAnswer("spam1", "yanlis"), NodeAnswer("spam2", "yanlis")],
        )
        self.assertEqual(res.answer, "dogru cevap")

    def test_cache_hit_skips_consensus(self):
        """Önceden çözülmüş soru, ikinci kez model çağırmadan önbellekten gelir."""
        eng = fresh_engine(self.tmp)
        eng.answer("baskent neresi", [NodeAnswer("n1", "ankara"), NodeAnswer("n2", "ankara"), NodeAnswer("n3", "ankara")])
        res2 = eng.answer("baskent neresi", [])  # düğüm yok — yine de cevap gelmeli
        self.assertEqual(res2.source, "cache")
        self.assertIn("ankara", res2.answer)

    def test_invalid_answers_rejected(self):
        """Boş/zararlı cevaplar validasyonda elenir."""
        eng = fresh_engine(self.tmp)
        res = eng.answer(
            "normal soru",
            [NodeAnswer("good1", "iyi cevap"), NodeAnswer("good2", "iyi cevap"), NodeAnswer("bad", "")],
        )
        self.assertEqual(res.rejected, 1)
        self.assertEqual(res.answer, "iyi cevap")

    def test_honeypot_calibration_lowers_bad_node(self):
        eng = fresh_engine(self.tmp)
        before = eng.rep.get_score("cheater")
        eng.calibrate("cheater", 0, "yanlis cevap")  # honeypot[0] = 2+2=4
        after = eng.rep.get_score("cheater")
        self.assertLess(after, before)


if __name__ == "__main__":
    unittest.main()
