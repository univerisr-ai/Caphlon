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



class CacheMerkezTest(unittest.TestCase):
    """Çözüm-cache Merkez kapıları: contribute/borrow/report + sır kapısı."""

    def setUp(self):
        import tempfile, threading
        tmp = tempfile.mkdtemp()
        self.httpd, self.state = build_server("127.0.0.1", 0, tmp, quorum=3)
        self.port = self.httpd.server_address[1]
        self.base = f"http://127.0.0.1:{self.port}"
        self.t = threading.Thread(target=self.httpd.serve_forever, daemon=True)
        self.t.start()

    def tearDown(self):
        self.httpd.shutdown()
        self.httpd.server_close()

    def _post_raw(self, path, payload):
        """Durum kodunu da döndüren POST (404/422 test edilebilsin)."""
        import json as _json, urllib.request, urllib.error
        req = urllib.request.Request(
            self.base + path, data=_json.dumps(payload).encode(),
            headers={"Content-Type": "application/json"}, method="POST")
        try:
            with urllib.request.urlopen(req, timeout=10) as r:
                return r.status, _json.loads(r.read() or b"{}")
        except urllib.error.HTTPError as e:
            return e.code, _json.loads(e.read() or b"{}")

    def test_contribute_borrow_report_dongusu(self):
        # miss → 404
        code, body = self._post_raw("/cache/borrow", {"instruction": "pnpm store prune sifir siliyor neden"})
        self.assertEqual(code, 404)
        self.assertTrue(body.get("miss"))
        # contribute → id
        code, body = self._post_raw("/cache/contribute", {
            "node_id": "n1",
            "instruction": "pnpm store prune sifir siliyor neden",
            "output": "hardlink refcount >0 ise girdi referanslidir; once node_modules sil",
        })
        self.assertEqual(code, 200)
        sid = body["id"]
        # borrow → hit
        code, body = self._post_raw("/cache/borrow", {"instruction": "pnpm store prune neden sifir siliyor"})
        self.assertEqual(code, 200)
        self.assertEqual(body["id"], sid)
        self.assertIn("hardlink", body["output"])
        # report worked → skor artar
        before = body["score"]
        code, body = self._post_raw("/cache/report", {"id": sid, "worked": True, "node_id": "n1"})
        self.assertEqual(code, 200)
        self.assertEqual(body["action"], "confirmed")
        code, body = self._post_raw("/cache/borrow", {"instruction": "pnpm store prune neden sifir siliyor"})
        self.assertGreater(body["score"], before)

    def test_parafraz_borrow_isabet(self):
        """Ham Jaccard'ın ıskaladığı soru-eki farkını stopword+containment yakalar."""
        self._post_raw("/cache/contribute", {
            "instruction": "git rebase yarim kaldi nasil devam edilir",
            "output": "git rebase --continue; cakismalari cozup add et"})
        code, body = self._post_raw("/cache/borrow", {
            "instruction": "git rebase yarim kaldi devam etme"})
        self.assertEqual(code, 200)
        self.assertIn("continue", body["output"])

    def test_sir_kapisi_422(self):
        code, body = self._post_raw("/cache/contribute", {
            "instruction": "anahtar nasil ayarlanir",
            "output": "ANTHROPIC_API_KEY=sk-ant-gizli1234567890 yap",
        })
        self.assertEqual(code, 422)
        self.assertIn("findings", body)
        # düzeltmede de kapı çalışır
        code, body = self._post_raw("/cache/contribute", {
            "instruction": "temiz soru bir iki uc dort", "output": "temiz cevap"})
        sid = body["id"]
        code, body = self._post_raw("/cache/report", {
            "id": sid, "worked": False, "correction": "token: ghp_abcdefghijklmnop1234"})
        self.assertEqual(code, 422)

    def test_duzeltme_yeni_satir_acar_ve_onayla_one_gecer(self):
        _, body = self._post_raw("/cache/contribute", {
            "instruction": "docker port cakismasi cozumu nedir birden", "output": "YANLIS cevap"})
        sid = body["id"]
        # başarısız + düzeltme → yeni satır
        code, body = self._post_raw("/cache/report", {
            "id": sid, "worked": False, "correction": "DOGRU: HIVE_PORT env ile portu degistir"})
        self.assertEqual(code, 200)
        self.assertEqual(body["action"], "corrected")
        cid = body["corrected_id"]
        self.assertNotEqual(cid, sid)
        # düzeltme bir onay alınca (skor eşitliği bozulur) borrow düzeltmeyi döndürür
        self._post_raw("/cache/report", {"id": cid, "worked": True})
        _, body = self._post_raw("/cache/borrow", {"instruction": "docker port cakismasi cozumu nedir birden"})
        self.assertEqual(body["id"], cid)
        self.assertIn("DOGRU", body["output"])


if __name__ == "__main__":
    unittest.main()
