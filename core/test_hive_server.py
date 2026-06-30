"""
Kovan koordinatörü + düğüm entegrasyon testleri — gerçek HTTP, canlı sunucu.
Çalıştır:  cd core && python3 -m unittest test_hive_server -v
"""

import tempfile
import threading
import unittest

from hive_server import build_server
import hive_node as node


class HiveServerTest(unittest.TestCase):
    def setUp(self):
        tmp = tempfile.mkdtemp()
        # port 0 → OS boş port atar; gerçek portu oku.
        self.httpd, self.state = build_server("127.0.0.1", 0, tmp, quorum=3)
        self.port = self.httpd.server_address[1]
        self.base = f"http://127.0.0.1:{self.port}"
        self.t = threading.Thread(target=self.httpd.serve_forever, daemon=True)
        self.t.start()

    def tearDown(self):
        self.httpd.shutdown()
        self.httpd.server_close()

    def test_health(self):
        self.assertTrue(node._get(self.base, "/health")["ok"])

    def test_register(self):
        r = node.register(self.base, "n1")
        self.assertTrue(r["ok"])
        self.assertEqual(r["vbs_id"], "n1")

    def test_ask_with_inline_answers(self):
        """Arayan cevapları topladıysa anında konsensüs."""
        r = node._post(self.base, "/ask", {
            "instruction": "2+2?",
            "answers": [{"vbs_id": "a", "output": "4"}, {"vbs_id": "b", "output": "4"},
                        {"vbs_id": "c", "output": "5"}],
        })
        self.assertEqual(r["answer"], "4")
        self.assertEqual(r["source"], "consensus")

    def test_swarm_flow_quorum_autoresolve(self):
        """ask → 3 düğüm cevaplar → quorum dolunca otomatik karar."""
        r = node._post(self.base, "/ask", {"instruction": "baskent neresi"})
        qid = r["qid"]
        self.assertIsNotNone(qid)
        node._post(self.base, "/answer", {"qid": qid, "vbs_id": "n1", "output": "ankara"})
        node._post(self.base, "/answer", {"qid": qid, "vbs_id": "n2", "output": "ankara"})
        last = node._post(self.base, "/answer", {"qid": qid, "vbs_id": "n3", "output": "istanbul"})
        self.assertTrue(last["resolved"])
        self.assertEqual(last["result"]["answer"], "ankara")

    def test_cache_shared_across_asks(self):
        """Çözülen soru ikinci ask'te önbellekten gelir (makineler arası ortak)."""
        node._post(self.base, "/ask", {
            "instruction": "python kim yazdi",
            "answers": [{"vbs_id": "a", "output": "guido"}, {"vbs_id": "b", "output": "guido"},
                        {"vbs_id": "c", "output": "guido"}],
        })
        r2 = node._post(self.base, "/ask", {"instruction": "python kim yazdi"})
        self.assertEqual(r2["result"]["source"], "cache")

    def test_ask_client_end_to_end(self):
        """node.ask() istemcisi + arka planda bir düğüm → uçtan uca."""
        # Tek turluk bir düğümü thread'de çalıştır (echo değil, sabit cevap veren model).
        def worker():
            node.serve_node(self.base, "w1", lambda q: "kovan-cevabi", poll=0.2, once=True, verbose=False)
            node.serve_node(self.base, "w2", lambda q: "kovan-cevabi", poll=0.2, once=True, verbose=False)
            node.serve_node(self.base, "w3", lambda q: "kovan-cevabi", poll=0.2, once=True, verbose=False)
        # Önce soruyu aç, sonra düğümleri saldır.
        r = node._post(self.base, "/ask", {"instruction": "deneme sorusu"})
        qid = r["qid"]
        for vid in ("w1", "w2", "w3"):
            node._post(self.base, "/answer", {"qid": qid, "vbs_id": vid, "output": "kovan-cevabi"})
        res = node._get(self.base, f"/result?qid={qid}")["result"]
        self.assertEqual(res["answer"], "kovan-cevabi")

    def test_honeypot_endpoint(self):
        hp = node._get(self.base, "/honeypot")
        self.assertIn("question", hp)
        # 2+2 tuzağına yanlış cevap → düğüm itibarı düşmeli.
        before = self.state.engine.rep.get_score("cheater")
        # question_idx 0 = "2+2=?" → "4"; yanlış ver.
        node._post(self.base, "/honeypot", {"vbs_id": "cheater", "question_idx": 0, "answer": "99"})
        self.assertLess(self.state.engine.rep.get_score("cheater"), before)

    def test_stats(self):
        s = node._get(self.base, "/stats")
        self.assertIn("cache", s)
        self.assertIn("top_nodes", s)


if __name__ == "__main__":
    unittest.main()
