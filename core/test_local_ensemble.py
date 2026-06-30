"""
Öz-topluluk (self-consistency) testleri — saf stdlib.
Çalıştır:  cd core && python3 -m unittest test_local_ensemble -v
"""

import os
import tempfile
import unittest

from hive_engine import HiveEngine
from hive_cache import SharedSolutionCache
from security import ReputationSystem, Honeypot
from local_ensemble import ensemble_answer, best_of_n


def fresh_engine():
    tmp = tempfile.mkdtemp()
    return HiveEngine(
        reputation=ReputationSystem(db_path=os.path.join(tmp, "r.db")),
        cache=SharedSolutionCache(db_path=os.path.join(tmp, "c.db")),
        honeypot=Honeypot(),
    )


class EnsembleTest(unittest.TestCase):
    def test_majority_sample_wins(self):
        """Model çoğu örnekte doğru, ara sıra yanlış → konsensüs doğruyu seçer."""
        seq = iter(["4", "4", "yanlis", "4", "4"])
        res = ensemble_answer("2+2?", lambda q: next(seq), n_samples=5, engine=fresh_engine())
        self.assertEqual(res.answer, "4")
        self.assertGreaterEqual(res.cluster_size, 3)

    def test_deterministic_model_agreement_full(self):
        """Deterministik model → tüm örnekler aynı → mutabakat 1.0, zararsız."""
        res = ensemble_answer("soru", lambda q: "tek cevap", n_samples=4, engine=fresh_engine())
        self.assertEqual(res.answer, "tek cevap")
        self.assertEqual(res.agreement, 1.0)

    def test_second_call_hits_cache(self):
        """İlk çağrı konsensüsü önbelleğe yazar; ikinci çağrı modeli ÇAĞIRMAZ."""
        eng = fresh_engine()
        calls = {"n": 0}
        def model(q):
            calls["n"] += 1
            return "sabit"
        ensemble_answer("tekrar soru", model, n_samples=3, engine=eng)
        first = calls["n"]
        res2 = ensemble_answer("tekrar soru", model, n_samples=3, engine=eng)
        self.assertEqual(calls["n"], first)          # ek model çağrısı yok
        self.assertEqual(res2.source, "cache")
        self.assertEqual(res2.answer, "sabit")

    def test_all_model_errors_returns_none(self):
        res = ensemble_answer("x", lambda q: "[model-hata: Timeout]", n_samples=3, engine=fresh_engine())
        self.assertIsNone(res.answer)
        self.assertEqual(res.source, "none")

    def test_best_of_n_returns_text(self):
        out = best_of_n("q", lambda q: "cevap", n_samples=3, engine=fresh_engine())
        self.assertEqual(out, "cevap")


if __name__ == "__main__":
    unittest.main()
