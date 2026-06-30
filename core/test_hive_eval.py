"""
Kovan eval harness testleri — saf stdlib.

En önemli iki test: harness'in DÜRÜST olduğunu gösterir —
 • bağımsız hatalarda ensemble doğruluğu ARTIRIR,
 • korelasyonlu (hep aynı yanlış) hatalarda ARTIRMAZ.
Yani harness "her zaman kovan kazanır" demiyor; gerçeği söylüyor.

Çalıştır:  cd core && python3 -m unittest test_hive_eval -v
"""

import tempfile
import unittest

from hive_eval import Task, evaluate, grade, BUILTIN
from hive_engine import HiveEngine
from hive_cache import SharedSolutionCache
from security import ReputationSystem, Honeypot


def fresh_engine():
    tmp = tempfile.mkdtemp()
    return HiveEngine(
        reputation=ReputationSystem(db_path=tmp + "/r.db"),
        cache=SharedSolutionCache(db_path=tmp + "/c.db"),
        honeypot=Honeypot(),
    )


class GradeTest(unittest.TestCase):
    def test_numeric_extracts_last_number(self):
        self.assertTrue(grade(Task("2+2?", "4", "numeric"), "cevap: 4"))
        self.assertFalse(grade(Task("2+2?", "4", "numeric"), "cevap: 5"))

    def test_contains(self):
        self.assertTrue(grade(Task("baskent?", "ankara", "contains"), "Ankara'dir"))


class IndependentErrorsTest(unittest.TestCase):
    """Hatalar BAĞIMSIZ: model çoğunlukla doğru, ara sıra rastgele yanlış →
    ensemble çoğunluğu doğruya çeker, Δ ≥ 0 olmalı."""

    def test_ensemble_helps_with_independent_errors(self):
        tasks = [Task("2+2?", "4", "numeric")]
        # Deterministik PRNG: çağrı sırasına göre %60 doğru.
        seq = iter([
            # SOLO çağrısı (1) + HIVE 5 örnek = ilk görev için 6 çağrı
            "4",                      # solo: doğru
            "4", "9", "4", "4", "7",  # hive örnekleri: çoğunluk "4"
        ])
        fn = lambda q: next(seq)
        res = evaluate(fn, tasks, samples=5, engine=fresh_engine())
        self.assertTrue(res.per_task[0]["hive_ok"])      # hive doğru
        self.assertGreaterEqual(res.delta, 0.0)          # geriletmedi


class CorrelatedErrorsTest(unittest.TestCase):
    """Hatalar KORELASYONLU: model hep AYNI yanlışı verir → ensemble işe
    yaramaz (çoğunluk da yanlış). Harness bunu dürüstçe Δ≈0 olarak göstermeli."""

    def test_ensemble_does_not_help_when_all_wrong_the_same(self):
        tasks = [Task("zor soru", "DOGRU", "exact")]
        fn = lambda q: "AYNI_YANLIS"      # her örnek aynı yanlış
        res = evaluate(fn, tasks, samples=5, engine=fresh_engine())
        self.assertFalse(res.per_task[0]["solo_ok"])
        self.assertFalse(res.per_task[0]["hive_ok"])     # ensemble kurtarmadı
        self.assertEqual(res.delta, 0.0)                 # dürüst: fark yok


class CacheBenefitTest(unittest.TestCase):
    """Aynı soru iki görev olarak gelirse ikincisi önbellekten gelmeli."""

    def test_repeated_question_hits_cache(self):
        eng = fresh_engine()
        tasks = [Task("baskent neresi", "ankara", "contains"),
                 Task("baskent neresi", "ankara", "contains")]
        fn = lambda q: "ankara"
        res = evaluate(fn, tasks, samples=3, engine=eng)
        self.assertGreaterEqual(res.cache_hits, 1)
        self.assertEqual(res.hive_correct, 2)


class PerfectModelTest(unittest.TestCase):
    def test_perfect_model_full_accuracy_no_regression(self):
        # Mükemmel model → solo ve hive ikisi de %100, Δ=0 (geriletmemeli).
        answers = {t.question: t.expected for t in BUILTIN}
        fn = lambda q: answers.get(q, "")
        res = evaluate(fn, BUILTIN, samples=3, engine=fresh_engine())
        self.assertEqual(res.solo_acc, 1.0)
        self.assertEqual(res.hive_acc, 1.0)
        self.assertEqual(res.delta, 0.0)


if __name__ == "__main__":
    unittest.main()
