"""
Federated aggregation testleri — saf stdlib, torch gerekmez.
Çalıştır:  cd core && python3 -m unittest test_fed_aggregate -v
"""

import unittest

from fed_aggregate import (
    reputation_weighted_fedavg,
    screen_outliers,
    BlindEvalGate,
    federated_round,
    apply_delta,
    global_norm,
)


class FedAvgTest(unittest.TestCase):
    def test_equal_weights_is_mean(self):
        out = reputation_weighted_fedavg([{"w": [2.0, 4.0]}, {"w": [4.0, 8.0]}], [1.0, 1.0])
        self.assertEqual(out["w"], [3.0, 6.0])

    def test_reputation_pulls_toward_trusted(self):
        """Yüksek itibarlı düğümün cevabına daha yakın ortalama."""
        out = reputation_weighted_fedavg([{"w": [0.0]}, {"w": [10.0]}], [1.0, 9.0])
        self.assertAlmostEqual(out["w"][0], 9.0)

    def test_zero_total_weight_falls_back_to_equal(self):
        out = reputation_weighted_fedavg([{"w": [1.0]}, {"w": [3.0]}], [0.0, 0.0])
        self.assertEqual(out["w"], [2.0])

    def test_dimension_mismatch_raises(self):
        with self.assertRaises(ValueError):
            reputation_weighted_fedavg([{"w": [1.0]}, {"w": [1.0, 2.0]}], [1.0, 1.0])


class ScreenTest(unittest.TestCase):
    def test_drops_oversized_poison_delta(self):
        good = [{"w": [1.0, 1.0]}, {"w": [1.0, 0.9]}, {"w": [0.9, 1.0]}]
        poison = {"w": [100.0, 100.0]}
        res = screen_outliers(good + [poison], max_norm_ratio=3.0)
        self.assertIn(3, res.dropped)
        self.assertEqual(res.kept, [0, 1, 2])

    def test_keeps_all_when_homogeneous(self):
        res = screen_outliers([{"w": [1.0]}, {"w": [1.1]}, {"w": [0.9]}])
        self.assertEqual(res.dropped, [])


class GateTest(unittest.TestCase):
    def test_first_adapter_accepted(self):
        gate = BlindEvalGate(eval_fn=lambda v: 1.0)
        d = gate.evaluate({"w": [1.0]}, None)
        self.assertTrue(d.accepted)

    def test_regression_rejected(self):
        # eval = -norm → küçük adapter daha iyi. Aday daha büyük → reddedilmeli.
        gate = BlindEvalGate(eval_fn=lambda v: -global_norm(v))
        d = gate.evaluate(candidate={"w": [5.0]}, current={"w": [1.0]})
        self.assertFalse(d.accepted)

    def test_improvement_accepted(self):
        gate = BlindEvalGate(eval_fn=lambda v: -global_norm(v))
        d = gate.evaluate(candidate={"w": [0.5]}, current={"w": [1.0]})
        self.assertTrue(d.accepted)

    def test_min_improvement_threshold(self):
        # Skor artıyor ama eşiğin altında → reddedilmeli.
        gate = BlindEvalGate(eval_fn=lambda v: v["w"][0], min_improvement=1.0)
        d = gate.evaluate(candidate={"w": [1.2]}, current={"w": [1.0]})
        self.assertFalse(d.accepted)


class RoundTest(unittest.TestCase):
    def test_round_drops_poison_and_publishes_improvement(self):
        base = {"w": [0.0, 0.0]}
        good = [{"w": [1.0, 1.0]}, {"w": [1.1, 0.9]}, {"w": [0.9, 1.1]}]
        poison = {"w": [100.0, -100.0]}
        # Hedef [1,1]'e yakınlık iyidir.
        eval_fn = lambda v: -global_norm({"w": [v["w"][0] - 1, v["w"][1] - 1]})
        res = federated_round(base, good + [poison], [0.8, 0.8, 0.8, 0.5], eval_fn=eval_fn, current=base)
        self.assertIn(3, res.screen.dropped)       # zehir elendi
        self.assertTrue(res.published)             # iyileşme → yayınlandı
        self.assertIsNotNone(res.merged)
        # Birleşmiş adapter ~[1,1] civarında olmalı (zehir hariç ortalama).
        self.assertAlmostEqual(res.merged["w"][0], 1.0, delta=0.2)

    def test_round_rejects_when_no_improvement(self):
        base = {"w": [1.0]}
        deltas = [{"w": [4.0]}, {"w": [4.0]}, {"w": [4.0]}]   # adapter'ı kötüleştirir
        eval_fn = lambda v: -global_norm(v)
        res = federated_round(base, deltas, [1, 1, 1], eval_fn=eval_fn, current=base)
        self.assertFalse(res.published)
        self.assertIsNone(res.merged)

    def test_round_without_eval_always_publishes(self):
        res = federated_round({"w": [0.0]}, [{"w": [1.0]}], [1.0])
        self.assertTrue(res.published)


if __name__ == "__main__":
    unittest.main()
