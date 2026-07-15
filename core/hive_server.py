#!/usr/bin/env python3
"""
Caphlon — Kovan Koordinatörü (Hive Coordinator / SuperLink benzeri)
==================================================================

Binlerce zayıf düğümün buluştuğu merkez. HiveEngine'i (konsensüs + paylaşımlı
önbellek + güvenlik) sunucu tarafında tutar; böylece önbellek ve itibar
GERÇEKTEN makineler arası ortaktır — bir düğümün çözdüğü, herkesin malı olur.

Saf stdlib `http.server` (tek-thread → 2GB RAM dostu, kilit/yarış yok). Ağır iş
(model çıkarımı) düğümlerde; koordinatör yalnızca toplar/oylar/önbelleğe yazar.

Protokol (JSON over HTTP):
  POST /register   {vbs_id}                         → düğümü kaydet
  POST /ask        {instruction, answers?}          → soru sor
        - answers verilirse: anında konsensüs + sonuç
        - verilmezse: bekleyen soru oluştur (gerçek swarm), {qid} döner
  GET  /pending                                     → açık sorular (düğümler yoklar)
  POST /answer     {qid, vbs_id, output, conf?}     → düğüm cevabını gönderir
  POST /resolve    {qid}                            → toplananları oyla, sonuç döndür
  GET  /result?qid=...                              → sonucu getir
  GET  /honeypot                                    → kalibrasyon için tuzak soru
  POST /honeypot   {vbs_id, question_idx, answer}   → düğümü tuzakla test et
  GET  /stats                                       → kovan istatistikleri

Çalıştır:  python3 hive_server.py --port 8777
"""

from __future__ import annotations

import argparse
import json
from http.server import BaseHTTPRequestHandler, HTTPServer
from typing import Callable, Optional
from urllib.parse import urlparse, parse_qs

from hive_engine import HiveEngine, NodeAnswer
from security import ReputationSystem, Honeypot, scan_secrets
from hive_cache import SharedSolutionCache
from adapter_registry import AdapterRegistry
from fed_aggregate import federated_round


class HiveState:
    """Koordinatörün canlı durumu. Tek-thread sunucuda kilit gerekmez."""

    def __init__(self, data_dir: str, quorum: int, fed_quorum: int = 3,
                 eval_fn: Optional[Callable[[dict], float]] = None,
                 min_improvement: float = 0.0):
        self.engine = HiveEngine(
            reputation=ReputationSystem(db_path=f"{data_dir}/reputation.db"),
            cache=SharedSolutionCache(db_path=f"{data_dir}/hive_cache.db"),
            honeypot=Honeypot(),
        )
        self.quorum = quorum
        self.pending: dict[int, dict] = {}   # qid → {instruction, answers, result}
        self._next_qid = 1
        # Federated katman: lokal LoRA delta'larını topla → birleştir → yayınla.
        self.registry = AdapterRegistry(root=f"{data_dir}/adapters")
        self.fed_quorum = fed_quorum
        self._deltas: list[dict] = []        # [{vbs_id, vectors}]
        # Blind-eval gate: `eval_fn(vectors) -> skor` verilirse, birleştirilen aday
        # adapter YALNIZCA bağımsız holdout skorunu artırırsa satır-içi doğrulanıp
        # otomatik yayınlanır. Verilmezse (saf-stdlib varsayılan) davranış değişmez:
        # adapter doğrulanmamış yayınlanır, dışsal /adapter/verify bekler.
        self.eval_fn = eval_fn
        self.min_improvement = min_improvement

    def submit_delta(self, vbs_id: str, vectors: dict) -> dict:
        """Bir düğümün lokal LoRA delta'sını al; fed_quorum dolunca birleştir+yayınla."""
        self.engine.rep.register(vbs_id)
        self._deltas.append({"vbs_id": vbs_id, "vectors": vectors})
        if len(self._deltas) < self.fed_quorum:
            return {"merged": False, "pending": len(self._deltas), "need": self.fed_quorum}
        deltas = [d["vectors"] for d in self._deltas]
        reps = [max(0.0, self.engine.rep.get_score(d["vbs_id"])) for d in self._deltas]
        base = self.registry.load_latest() or {}
        # Anomali eleme + itibar-ağırlıklı FedAvg + (varsa) blind-eval gate.
        # `current` = şu an dağıtımdaki (doğrulanmış) adapter; aday onunla kıyaslanır.
        res = federated_round(
            base, deltas, reps,
            eval_fn=self.eval_fn,
            current=self.registry.load_latest_verified(),
            min_improvement=self.min_improvement,
        )
        self._deltas.clear()
        if not res.published or res.merged is None:
            out = {"merged": False, "dropped": res.screen.dropped}
            if res.gate is not None:                 # gate regresyonu reddetti
                out["gate"] = res.gate.reason
            return out
        # Gate çalıştıysa: aday holdout'u geçti → otomatik doğrulanmış yayınla
        # (dağıtıma anında açık). Gate yoksa: doğrulanmamış yayınla (fail-safe:
        # dışsal /adapter/verify gelene dek düğümler çekemez).
        if res.gate is not None:
            entry = self.registry.publish(res.merged, score=res.gate.candidate_score,
                                          verified=True)
            return {"merged": True, "version": entry["version"], "verified": True,
                    "dropped": res.screen.dropped, "contributors": len(reps),
                    "gate": res.gate.reason}
        # Yayın skoru: katkıcı itibarlarının ortalaması (gerçek eval gelene dek vekil).
        score = sum(reps) / (len(reps) or 1)
        entry = self.registry.publish(res.merged, score=score)
        return {"merged": True, "version": entry["version"], "verified": False,
                "dropped": res.screen.dropped, "contributors": len(reps)}

    def new_question(self, instruction: str) -> int:
        qid = self._next_qid
        self._next_qid += 1
        self.pending[qid] = {"instruction": instruction, "answers": [], "result": None}
        return qid

    def add_answer(self, qid: int, na: NodeAnswer) -> dict | None:
        q = self.pending.get(qid)
        if q is None or q["result"] is not None:
            return q["result"] if q else None
        q["answers"].append(na)
        # Yeterli düğüm cevapladıysa otomatik karar ver.
        if len(q["answers"]) >= self.quorum:
            return self.resolve(qid)
        return None

    def resolve(self, qid: int) -> dict | None:
        q = self.pending.get(qid)
        if q is None:
            return None
        if q["result"] is None:
            res = self.engine.answer(q["instruction"], q["answers"])
            q["result"] = _result_to_dict(res)
        return q["result"]


def _result_to_dict(res) -> dict:
    return {
        "answer": res.answer,
        "source": res.source,
        "agreement": res.agreement,
        "cluster_size": res.cluster_size,
        "contributors": res.contributors,
        "rejected": res.rejected,
        "detail": res.detail,
    }


def make_handler(state: HiveState):
    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *a):  # sessiz; istenirse --verbose ile açılır
            pass

        def _send(self, code: int, payload: dict):
            body = json.dumps(payload).encode()
            self.send_response(code)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def _body(self) -> dict:
            n = int(self.headers.get("Content-Length", 0) or 0)
            if not n:
                return {}
            try:
                return json.loads(self.rfile.read(n) or b"{}")
            except json.JSONDecodeError:
                return {}

        # ---- GET ----
        def do_GET(self):
            path = urlparse(self.path).path
            qs = parse_qs(urlparse(self.path).query)
            if path == "/health":
                return self._send(200, {"ok": True})
            if path == "/pending":
                return self._send(200, {"pending": [
                    {"qid": qid, "instruction": q["instruction"], "answers": len(q["answers"])}
                    for qid, q in state.pending.items() if q["result"] is None
                ]})
            if path == "/result":
                qid = int((qs.get("qid") or ["0"])[0])
                q = state.pending.get(qid)
                if q is None:
                    return self._send(404, {"error": "bilinmeyen qid"})
                return self._send(200, {"qid": qid, "result": q["result"]})
            if path == "/honeypot":
                import random
                idx = random.randrange(state.engine.honeypot.count)
                q = state.engine.honeypot.get_question(idx)
                return self._send(200, {"question_idx": idx, "question": q["q"]})
            if path == "/adapter":
                # Fail-safe: düğümler YALNIZCA doğrulanmış adapter çeker. Doğrulanmamış
                # (eval'den geçmemiş) bir adapter sessizce dağıtılmaz.
                vecs = state.registry.load_latest_verified()
                if vecs is None:
                    return self._send(404, {"error": "henüz doğrulanmış adapter yok (fail-safe)"})
                return self._send(200, {"meta": state.registry.latest_verified_meta(), "vectors": vecs})
            if path == "/adapter/meta":
                return self._send(200, state.registry.info())
            if path == "/stats":
                s = state.engine.stats()
                s["adapter"] = state.registry.info()
                s["fed_pending"] = len(state._deltas)
                s["cache"] = state.engine.cache.stats()
                return self._send(200, s)
            return self._send(404, {"error": "yol yok"})

        # ---- POST ----
        def do_POST(self):
            path = urlparse(self.path).path
            data = self._body()
            if path == "/register":
                vbs = str(data.get("vbs_id", "")).strip()
                if not vbs:
                    return self._send(400, {"error": "vbs_id zorunlu"})
                state.engine.rep.register(vbs)
                return self._send(200, {"ok": True, "vbs_id": vbs, "score": state.engine.rep.get_score(vbs)})

            if path == "/ask":
                instr = str(data.get("instruction", "")).strip()
                if not instr:
                    return self._send(400, {"error": "instruction zorunlu"})
                raw = data.get("answers")
                if raw:  # arayan zaten cevap topladı → anında oyla
                    answers = [NodeAnswer(str(a.get("vbs_id", f"n{i}")), str(a.get("output", "")),
                                          float(a.get("conf", a.get("confidence", 1.0))))
                               for i, a in enumerate(raw)]
                    return self._send(200, _result_to_dict(state.engine.answer(instr, answers)))
                # cevap yok → önce önbelleğe bak, isabet yoksa bekleyen soru aç
                hit = state.engine.answer(instr, [])
                if hit.source == "cache":
                    return self._send(200, {"qid": None, "result": _result_to_dict(hit)})
                qid = state.new_question(instr)
                return self._send(200, {"qid": qid, "result": None})

            if path == "/answer":
                qid = int(data.get("qid", 0))
                na = NodeAnswer(str(data.get("vbs_id", "")), str(data.get("output", "")),
                                float(data.get("conf", data.get("confidence", 1.0))))
                if not na.vbs_id:
                    return self._send(400, {"error": "vbs_id zorunlu"})
                result = state.add_answer(qid, na)
                return self._send(200, {"qid": qid, "resolved": result is not None, "result": result})

            if path == "/resolve":
                qid = int(data.get("qid", 0))
                return self._send(200, {"qid": qid, "result": state.resolve(qid)})

            if path == "/honeypot":
                vbs = str(data.get("vbs_id", "")).strip()
                idx = int(data.get("question_idx", 0))
                ans = str(data.get("answer", ""))
                ok = state.engine.calibrate(vbs, idx, ans)
                return self._send(200, {"vbs_id": vbs, "passed": ok, "score": state.engine.rep.get_score(vbs)})

            if path == "/delta":
                vbs = str(data.get("vbs_id", "")).strip()
                vectors = data.get("delta") or data.get("vectors") or {}
                if not vbs or not isinstance(vectors, dict) or not vectors:
                    return self._send(400, {"error": "vbs_id ve delta (dict) zorunlu"})
                return self._send(200, state.submit_delta(vbs, vectors))

            # ---- Çözüm cache Merkez kapıları (Caphlon DualCache Faz 2) ----
            if path == "/cache/borrow":
                instr = str(data.get("instruction", "")).strip()
                if not instr:
                    return self._send(400, {"error": "instruction zorunlu"})
                hit = state.engine.cache.lookup(instr)
                if hit is None:
                    return self._send(404, {"miss": True})
                return self._send(200, {
                    "id": getattr(hit, "_id", None),
                    "instruction": hit.instruction,
                    "output": hit.output,
                    "similarity": hit.similarity,
                    "score": hit.score,
                })

            if path == "/cache/contribute":
                instr = str(data.get("instruction", "")).strip()
                out = str(data.get("output", "")).strip()
                if not instr or not out:
                    return self._send(400, {"error": "instruction ve output zorunlu"})
                findings = scan_secrets(instr + "\n" + out)
                if findings:
                    return self._send(422, {"error": "sır kapısı", "findings": findings})
                node = str(data.get("node_id", "")).strip()
                weight = state.engine.rep.get_score(node) if node else 1.0
                sid = state.engine.cache.record(instr, out, weight=max(0.1, weight))
                return self._send(200, {"ok": True, "id": sid})

            if path == "/cache/report":
                sid = int(data.get("id", 0))
                worked = bool(data.get("worked", False))
                correction = data.get("correction")
                if correction is not None:
                    correction = str(correction)
                    findings = scan_secrets(correction)
                    if findings:
                        return self._send(422, {"error": "sır kapısı", "findings": findings})
                node = str(data.get("node_id", "")).strip()
                weight = state.engine.rep.get_score(node) if node else 1.0
                res = state.engine.cache.report(sid, worked, correction, weight=max(0.1, weight))
                return self._send(200 if res.get("ok") else 404, res)

            if path == "/adapter/verify":
                # Bağımsız bir eval süreci bir sürümü onaylayınca dağıtıma açar.
                version = int(data.get("version", 0))
                score = data.get("eval_score")
                ok = state.registry.verify(version, float(score) if score is not None else None)
                return self._send(200 if ok else 404,
                                  {"verified": ok, "version": version,
                                   "latest_verified": state.registry.info()["latest_verified"]})

            return self._send(404, {"error": "yol yok"})

    return Handler


def build_server(host: str, port: int, data_dir: str, quorum: int, fed_quorum: int = 3,
                 eval_fn: Optional[Callable[[dict], float]] = None,
                 min_improvement: float = 0.0):
    state = HiveState(data_dir, quorum, fed_quorum=fed_quorum,
                      eval_fn=eval_fn, min_improvement=min_improvement)
    httpd = HTTPServer((host, port), make_handler(state))
    return httpd, state


def main():
    ap = argparse.ArgumentParser(description="Caphlon Kovan Koordinatörü")
    ap.add_argument("--host", default="127.0.0.1")
    ap.add_argument("--port", type=int, default=8777)
    ap.add_argument("--data-dir", default="./data")
    ap.add_argument("--quorum", type=int, default=3, help="Otomatik karar için min cevap sayısı")
    ap.add_argument("--fed-quorum", type=int, default=3, help="Federated birleştirme için min delta sayısı")
    args = ap.parse_args()

    import os
    os.makedirs(args.data_dir, exist_ok=True)
    httpd, _ = build_server(args.host, args.port, args.data_dir, args.quorum, args.fed_quorum)
    print(f"🐝 Kovan koordinatörü: http://{args.host}:{args.port}  (quorum={args.quorum}, data={args.data_dir})")
    print("   POST /ask · /answer · /register · GET /pending · /stats · /health   (Ctrl-C ile dur)")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\n🐝 Koordinatör durdu.")


if __name__ == "__main__":
    main()
