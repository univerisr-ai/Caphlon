#!/usr/bin/env python3
"""
Caphlon — Kovan Düğümü (Hive Node / SuperNode benzeri) + sorgu istemcisi
=======================================================================

Bir düğüm: koordinatöre kaydolur, bekleyen soruları yoklar, KENDİ zayıf
modeliyle (2GB RAM sınıfı) cevap üretir ve gönderir. Model çağrısı takılabilir
(`model_fn`) — varsayılan, bağlı modeli bir kabuk komutuyla çağırır; yoksa
test için echo-stub.

Aynı dosya `ask()` sorgu istemcisini de içerir: bir soruyu kovana sorar,
quorum dolup karar çıkana kadar bekler.

Saf stdlib (urllib). Çalıştır:
  python3 hive_node.py join  --server http://127.0.0.1:8777 --id n1 --model-cmd "hermes -z {q}"
  python3 hive_node.py ask   --server http://127.0.0.1:8777 "2+2 kactir?"
"""

from __future__ import annotations

import argparse
import json
import shlex
import subprocess
import time
import urllib.request
from typing import Callable, Optional


# --------------------------------------------------------------------------- #
# HTTP yardımcıları (stdlib)
# --------------------------------------------------------------------------- #
def _post(base: str, path: str, payload: dict, timeout: float = 30) -> dict:
    req = urllib.request.Request(
        base.rstrip("/") + path,
        data=json.dumps(payload).encode(),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read() or b"{}")


def _get(base: str, path: str, timeout: float = 30) -> dict:
    with urllib.request.urlopen(base.rstrip("/") + path, timeout=timeout) as r:
        return json.loads(r.read() or b"{}")


# --------------------------------------------------------------------------- #
# Model çağrısı (takılabilir)
# --------------------------------------------------------------------------- #
def shell_model_fn(cmd_template: str, timeout: float = 120) -> Callable[[str], str]:
    """Kabuk komutundan model fonksiyonu üret. `{q}` sorunun yerine geçer.

    Örn: "hermes -z {q} -m openrouter/auto"  ya da  "ollama run gemma:2b {q}".
    """
    def fn(instruction: str) -> str:
        cmd = [a.replace("{q}", instruction) for a in shlex.split(cmd_template)]
        if "{q}" not in cmd_template:        # {q} yoksa soruyu sona ekle
            cmd.append(instruction)
        try:
            out = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)
            return (out.stdout.strip() or out.stderr.strip())
        except (subprocess.TimeoutExpired, FileNotFoundError) as e:
            return f"[model-hata: {e.__class__.__name__}]"
    return fn


def connected_model_fn(timeout: float = 120) -> Optional[Callable[[str], str]]:
    """`caphlon connect` ile bağlı modeli OpenAI-uyumlu API'den çağır.

    TS tarafı (hive.ts → activeModelEnv) UNDERDOG_LLM_* değişkenlerini geçirir.
    Çoğu sağlayıcı (openai, openrouter, groq, deepseek, together, ollama, ...)
    `<base>/chat/completions` uç noktasını destekler. Bağlı model yoksa None.
    """
    import os
    base = os.environ.get("UNDERDOG_LLM_BASE_URL", "").rstrip("/")
    model = os.environ.get("UNDERDOG_LLM_MODEL", "")
    key = os.environ.get("UNDERDOG_LLM_API_KEY", "")
    if not base or not model:
        return None

    def fn(instruction: str) -> str:
        url = base + ("/chat/completions" if not base.endswith("/chat/completions") else "")
        payload = {
            "model": model,
            "messages": [{"role": "user", "content": instruction}],
            "temperature": 0.7,   # küçük çeşitlilik → bağımsız hatalar → konsensüs çalışır
        }
        headers = {"Content-Type": "application/json"}
        if key:
            headers["Authorization"] = f"Bearer {key}"
        req = urllib.request.Request(url, data=json.dumps(payload).encode(), headers=headers, method="POST")
        try:
            with urllib.request.urlopen(req, timeout=timeout) as r:
                data = json.loads(r.read() or b"{}")
            return (data.get("choices", [{}])[0].get("message", {}).get("content", "") or "").strip()
        except Exception as e:
            return f"[model-hata: {e.__class__.__name__}]"
    return fn


def echo_model_fn() -> Callable[[str], str]:
    """Test/stub: modeli yokken deterministik bir cevap üretir."""
    return lambda instruction: f"echo: {instruction.strip()}"


def resolve_model_fn(model_cmd: str) -> Callable[[str], str]:
    """Model fonksiyonunu seç: --model-cmd → bağlı model → echo-stub."""
    if model_cmd:
        return shell_model_fn(model_cmd)
    connected = connected_model_fn()
    if connected is not None:
        return connected
    return echo_model_fn()


# --------------------------------------------------------------------------- #
# Düğüm döngüsü
# --------------------------------------------------------------------------- #
def register(base: str, vbs_id: str) -> dict:
    return _post(base, "/register", {"vbs_id": vbs_id})


def self_test(base: str, vbs_id: str, model_fn: Callable[[str], str]) -> Optional[bool]:
    """Koordinatörün tuzak sorusunu kendi modelinle cevapla (itibar kalibrasyonu)."""
    try:
        hp = _get(base, "/honeypot")
        ans = model_fn(hp["question"])
        res = _post(base, "/honeypot", {"vbs_id": vbs_id, "question_idx": hp["question_idx"], "answer": ans})
        return res.get("passed")
    except Exception:
        return None


def serve_node(base: str, vbs_id: str, model_fn: Callable[[str], str],
               poll: float = 2.0, once: bool = False, verbose: bool = True) -> None:
    """Bekleyen soruları yoklayıp cevaplayan düğüm döngüsü."""
    register(base, vbs_id)
    if verbose:
        print(f"🐝 düğüm '{vbs_id}' kovana katıldı → {base}")
    answered: set[int] = set()
    while True:
        try:
            pend = _get(base, "/pending").get("pending", [])
        except Exception as e:
            if verbose:
                print(f"  [bağlantı bekleniyor: {e}]")
            time.sleep(poll)
            continue
        for q in pend:
            qid = q["qid"]
            if qid in answered:
                continue
            out = model_fn(q["instruction"])
            try:
                r = _post(base, "/answer", {"qid": qid, "vbs_id": vbs_id, "output": out})
                answered.add(qid)
                if verbose:
                    tag = "→ karar verildi" if r.get("resolved") else "→ gönderildi"
                    print(f"  q{qid}: {q['instruction'][:38]!r} {tag}")
            except Exception:
                pass
        if once and pend:
            break
        time.sleep(poll)


# --------------------------------------------------------------------------- #
# Federated: lokal delta gönder / global adapter çek
# --------------------------------------------------------------------------- #
def submit_delta(base: str, vbs_id: str, delta_path: str) -> dict:
    """Lokal LoRA delta'sını (JSON-vektör dosyası) koordinatöre gönder.

    Ham veri DEĞİL, yalnızca ağırlık farkı gider (gizlilik)."""
    with open(delta_path) as f:
        vectors = json.load(f)
    return _post(base, "/delta", {"vbs_id": vbs_id, "delta": vectors})


def pull_adapter(base: str, dest: str) -> dict:
    """Yayınlanmış en güncel global adapter'ı indir ve `dest`'e yaz."""
    data = _get(base, "/adapter")
    vecs = data.get("vectors")
    if vecs is None:
        return {"ok": False, "reason": "henüz adapter yok"}
    import os
    os.makedirs(os.path.dirname(dest) or ".", exist_ok=True)
    with open(dest, "w") as f:
        json.dump(vecs, f, ensure_ascii=False)
    return {"ok": True, "meta": data.get("meta"), "dest": dest}


# --------------------------------------------------------------------------- #
# Sorgu istemcisi
# --------------------------------------------------------------------------- #
def ask(base: str, instruction: str, wait: float = 30, interval: float = 1.0) -> dict:
    """Kovana soru sor; karar çıkana kadar bekle. Sonuç dict döner."""
    r = _post(base, "/ask", {"instruction": instruction})
    if r.get("result"):                       # önbellek isabeti — anında
        return r["result"]
    qid = r.get("qid")
    if qid is None:
        return {"answer": None, "source": "none"}
    deadline = 0.0
    while deadline < wait:
        res = _get(base, f"/result?qid={qid}").get("result")
        if res:
            return res
        time.sleep(interval)
        deadline += interval
    # Süre doldu — eldekiyle karar ver.
    return _post(base, "/resolve", {"qid": qid}).get("result") or {"answer": None, "source": "timeout"}


# --------------------------------------------------------------------------- #
# CLI
# --------------------------------------------------------------------------- #
def main():
    ap = argparse.ArgumentParser(description="Caphlon Kovan Düğümü / sorgu istemcisi")
    sub = ap.add_subparsers(dest="cmd", required=True)

    j = sub.add_parser("join", help="Düğüm olarak kovana katıl ve soruları cevapla")
    j.add_argument("--server", default="http://127.0.0.1:8777")
    j.add_argument("--id", required=True, help="vbs_id (düğüm kimliği)")
    j.add_argument("--model-cmd", default="", help="Model kabuk komutu ({q}=soru). Boşsa echo-stub.")
    j.add_argument("--poll", type=float, default=2.0)
    j.add_argument("--once", action="store_true", help="Bir tur cevapla ve çık")

    a = sub.add_parser("ask", help="Kovana soru sor")
    a.add_argument("--server", default="http://127.0.0.1:8777")
    a.add_argument("instruction")
    a.add_argument("--wait", type=float, default=30)

    s = sub.add_parser("submit-delta", help="Lokal LoRA delta'sını koordinatöre gönder")
    s.add_argument("--server", default="http://127.0.0.1:8777")
    s.add_argument("--id", required=True)
    s.add_argument("--delta", required=True, help="JSON-vektör delta dosyası")

    p = sub.add_parser("pull", help="Güncel global adapter'ı indir")
    p.add_argument("--server", default="http://127.0.0.1:8777")
    p.add_argument("--out", default="./data/adapter-latest.json")

    args = ap.parse_args()
    if args.cmd == "join":
        fn = resolve_model_fn(args.model_cmd)
        self_test(args.server, args.id, fn)
        serve_node(args.server, args.id, fn, poll=args.poll, once=args.once)
    elif args.cmd == "ask":
        res = ask(args.server, args.instruction, wait=args.wait)
        print(json.dumps(res, ensure_ascii=False, indent=2))
    elif args.cmd == "submit-delta":
        print(json.dumps(submit_delta(args.server, args.id, args.delta), ensure_ascii=False, indent=2))
    elif args.cmd == "pull":
        print(json.dumps(pull_adapter(args.server, args.out), ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
