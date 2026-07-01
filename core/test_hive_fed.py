"""Koordinatör federated akışı: delta gönder → birleştir → yayınla → pull."""
import tempfile, threading, unittest
from hive_server import build_server
import hive_node as node

class HiveFedTest(unittest.TestCase):
    def setUp(self):
        tmp = tempfile.mkdtemp()
        self.httpd, self.state = build_server("127.0.0.1", 0, tmp, quorum=3, fed_quorum=3)
        self.port = self.httpd.server_address[1]
        self.base = f"http://127.0.0.1:{self.port}"
        self.t = threading.Thread(target=self.httpd.serve_forever, daemon=True); self.t.start()
    def tearDown(self):
        self.httpd.shutdown(); self.httpd.server_close()

    def test_fed_quorum_merges_and_publishes(self):
        r1 = node._post(self.base, "/delta", {"vbs_id": "n1", "delta": {"w": [1.0, 1.0]}})
        self.assertFalse(r1["merged"]); self.assertEqual(r1["pending"], 1)
        node._post(self.base, "/delta", {"vbs_id": "n2", "delta": {"w": [1.1, 0.9]}})
        r3 = node._post(self.base, "/delta", {"vbs_id": "n3", "delta": {"w": [0.9, 1.1]}})
        self.assertTrue(r3["merged"]); self.assertEqual(r3["version"], 1)

    def test_poison_delta_dropped_in_merge(self):
        node._post(self.base, "/delta", {"vbs_id": "a", "delta": {"w": [1.0, 1.0]}})
        node._post(self.base, "/delta", {"vbs_id": "b", "delta": {"w": [1.0, 1.0]}})
        node._post(self.base, "/delta", {"vbs_id": "c", "delta": {"w": [1.0, 1.0]}})
        # ^ version 1 yayınlandı. Şimdi zehir dahil yeni tur.
        node._post(self.base, "/delta", {"vbs_id": "d", "delta": {"w": [1.0, 1.0]}})
        node._post(self.base, "/delta", {"vbs_id": "e", "delta": {"w": [1.0, 1.0]}})
        r = node._post(self.base, "/delta", {"vbs_id": "poison", "delta": {"w": [500.0, 500.0]}})
        self.assertTrue(r["merged"])
        self.assertEqual(r["dropped"], [2])   # zehir (3.) elendi

    def test_pull_failsafe_until_verified(self):
        """Fail-safe: birleştirilen adapter DOĞRULANANA kadar çekilemez."""
        for vid, d in [("n1",{"w":[2.0]}),("n2",{"w":[2.0]}),("n3",{"w":[2.0]})]:
            node._post(self.base, "/delta", {"vbs_id": vid, "delta": d})
        import tempfile, os, json
        dest = os.path.join(tempfile.mkdtemp(), "adapter.json")
        # Doğrulanmadan: pull başarısız (kötü adapter sessizce yayılmaz).
        self.assertFalse(node.pull_adapter(self.base, dest)["ok"])
        # Bağımsız eval onayı geldikten sonra: pull çalışır.
        v = node._post(self.base, "/adapter/verify", {"version": 1, "eval_score": 0.9})
        self.assertTrue(v["verified"])
        r2 = node.pull_adapter(self.base, dest)
        self.assertTrue(r2["ok"])
        self.assertEqual(json.load(open(dest))["w"], [2.0])

    def test_no_adapter_yet_404(self):
        import urllib.error
        with self.assertRaises(urllib.error.HTTPError):
            node._get(self.base, "/adapter")


class HiveFedGateTest(unittest.TestCase):
    """eval_fn enjekte edilince blind-eval gate koordinatörde satır-içi çalışır."""

    def _serve(self, eval_fn, min_improvement=0.0):
        tmp = tempfile.mkdtemp()
        httpd, state = build_server("127.0.0.1", 0, tmp, quorum=3, fed_quorum=3,
                                    eval_fn=eval_fn, min_improvement=min_improvement)
        port = httpd.server_address[1]
        t = threading.Thread(target=httpd.serve_forever, daemon=True); t.start()
        self.addCleanup(httpd.server_close)
        self.addCleanup(httpd.shutdown)
        return f"http://127.0.0.1:{port}"

    def test_gate_accepts_auto_verifies_and_serves(self):
        # eval_fn her adayı geçirir → birleşen adapter otomatik doğrulanır,
        # dışsal /adapter/verify OLMADAN pull çalışır.
        base = self._serve(eval_fn=lambda v: 1.0)
        r = None
        for vid, d in [("n1", {"w": [2.0]}), ("n2", {"w": [2.0]}), ("n3", {"w": [2.0]})]:
            r = node._post(base, "/delta", {"vbs_id": vid, "delta": d})
        self.assertTrue(r["merged"]); self.assertTrue(r["verified"])
        import tempfile as tf, os, json
        dest = os.path.join(tf.mkdtemp(), "adapter.json")
        self.assertTrue(node.pull_adapter(base, dest)["ok"])
        self.assertEqual(json.load(open(dest))["w"], [2.0])

    def test_gate_rejects_regression_not_published(self):
        # eval_fn negatif norma göre skorlar: ilk tur referans olarak kabul edilir,
        # ikinci tur mevcuttan uzaklaşırsa (regresyon) RED → yayınlanmaz.
        from fed_aggregate import global_norm
        base = self._serve(eval_fn=lambda v: -global_norm(v), min_improvement=0.0)
        for vid in ("n1", "n2", "n3"):          # tur 1: küçük norm, kabul (ilk referans)
            r1 = node._post(base, "/delta", {"vbs_id": vid, "delta": {"w": [0.1]}})
        self.assertTrue(r1["merged"]); self.assertTrue(r1["verified"])
        for vid in ("n4", "n5", "n6"):          # tur 2: mevcutu büyütür → skor düşer → RED
            r2 = node._post(base, "/delta", {"vbs_id": vid, "delta": {"w": [5.0]}})
        self.assertFalse(r2["merged"]); self.assertIn("RED", r2["gate"])

if __name__ == "__main__":
    unittest.main()
