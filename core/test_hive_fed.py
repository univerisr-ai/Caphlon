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

if __name__ == "__main__":
    unittest.main()
