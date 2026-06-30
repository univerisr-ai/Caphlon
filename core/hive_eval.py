#!/usr/bin/env python3
"""
Caphlon — Kovan Eval Harness (iddiayı ÖLÇER, kanıt diye sunmaz)
==============================================================

Soru: "zayıf model + kovan, tek-modelden gerçekten daha mı iyi?" Bunu TAHMİN
etmeyiz — ölçeriz. Aynı bağlı modelle iki koşu yapar:

  SOLO   — modeli 1 kez çağır, cevabı denetle
  HIVE   — self-ensemble (N örnek) → konsensüs → denetle (+ ortak önbellek)

ve doğruluk farkını (Δ) raporlar. Δ>0 → kovan yardımcı oldu. Δ≈0/<0 → olmadı;
bunu dürüstçe öğreniriz (örn. hatalar korelasyonluysa konsensüs işe yaramaz).

ÖNEMLİ dürüstlük notu: sonuç, kullanılan göreve ve modele bağlıdır. Bu harness
bir KANIT MAKİNESİ değil, bir TARTI'dır — ne çıkarsa onu söyler.

Saf stdlib. Gerçek modeli `--model-cmd`/bağlı modelle kullanır; testte stub.
"""

from __future__ import annotations

import re
import tempfile
from dataclasses import dataclass, field
from typing import Callable, Optional

from hive_engine import HiveEngine
from hive_cache import SharedSolutionCache
from security import ReputationSystem, Honeypot
from local_ensemble import ensemble_answer


# --------------------------------------------------------------------------- #
# Benchmark öğesi + denetleyiciler
# --------------------------------------------------------------------------- #
@dataclass
class Task:
    question: str
    expected: str
    check: str = "contains"   # "exact" | "contains" | "numeric"


def _norm(s: str) -> str:
    return re.sub(r"\s+", " ", s.strip().lower())


def grade(task: Task, answer: str) -> bool:
    a = _norm(answer)
    e = _norm(task.expected)
    if task.check == "exact":
        return a == e
    if task.check == "numeric":
        nums = re.findall(r"-?\d+(?:\.\d+)?", answer)
        return bool(nums) and nums[-1].rstrip(".0") == e.rstrip(".0") or (e in nums)
    return e in a  # contains


# Dahili küçük, deterministik, denetlenebilir set (dış veri gerektirmez).
BUILTIN: list[Task] = [
    Task("2+2 kactir? sadece rakam.", "4", "numeric"),
    Task("10-7 kactir? sadece rakam.", "3", "numeric"),
    Task("5 ile 3'un carpimi? sadece rakam.", "15", "numeric"),
    Task("Turkiye'nin baskenti neresidir? tek kelime.", "ankara", "contains"),
    Task("Dunyanin uydusu nedir? tek kelime.", "ay", "contains"),
    Task("9 / 3 kactir? sadece rakam.", "3", "numeric"),
    Task("Python hangi yil cikti? sadece yil.", "1991", "contains"),
    Task("Bir haftada kac gun vardir? sadece rakam.", "7", "numeric"),
]


# --------------------------------------------------------------------------- #
# Eval
# --------------------------------------------------------------------------- #
@dataclass
class EvalResult:
    n: int
    solo_correct: int
    hive_correct: int
    cache_hits: int = 0
    per_task: list[dict] = field(default_factory=list)

    @property
    def solo_acc(self) -> float:
        return self.solo_correct / self.n if self.n else 0.0

    @property
    def hive_acc(self) -> float:
        return self.hive_correct / self.n if self.n else 0.0

    @property
    def delta(self) -> float:
        return self.hive_acc - self.solo_acc


def evaluate(
    model_fn: Callable[[str], str],
    tasks: Optional[list[Task]] = None,
    samples: int = 5,
    engine: Optional[HiveEngine] = None,
) -> EvalResult:
    """SOLO vs HIVE doğruluğunu ölç. model_fn deterministik DEĞİLse (sıcaklık>0)
    ensemble anlamlı olur; deterministikse Δ≈0 beklenir (dürüst sonuç)."""
    tasks = tasks or BUILTIN
    if engine is None:
        tmp = tempfile.mkdtemp()
        engine = HiveEngine(
            reputation=ReputationSystem(db_path=tmp + "/r.db"),
            cache=SharedSolutionCache(db_path=tmp + "/c.db"),
            honeypot=Honeypot(),
        )
    res = EvalResult(n=len(tasks), solo_correct=0, hive_correct=0)
    for t in tasks:
        # SOLO: tek çağrı (önbellekten bağımsız, ham model).
        solo_ans = model_fn(t.question)
        solo_ok = grade(t, solo_ans)
        # HIVE: self-ensemble + konsensüs + ortak önbellek.
        hres = ensemble_answer(t.question, model_fn, n_samples=samples, engine=engine)
        hive_ans = hres.answer or ""
        hive_ok = grade(t, hive_ans)
        if hres.source == "cache":
            res.cache_hits += 1
        res.solo_correct += int(solo_ok)
        res.hive_correct += int(hive_ok)
        res.per_task.append({
            "q": t.question, "expected": t.expected,
            "solo": solo_ans[:40], "solo_ok": solo_ok,
            "hive": hive_ans[:40], "hive_ok": hive_ok, "source": hres.source,
        })
    return res


def format_report(res: EvalResult) -> str:
    lines = [
        "🐝 Kovan Eval — SOLO (tek model) vs HIVE (ensemble+konsensüs+önbellek)",
        f"  Görev sayısı : {res.n}   (ensemble örnek/görev sırada raporlanır)",
        f"  SOLO doğruluk: %{res.solo_acc*100:.1f}   ({res.solo_correct}/{res.n})",
        f"  HIVE doğruluk: %{res.hive_acc*100:.1f}   ({res.hive_correct}/{res.n})",
        f"  Δ (kazanç)   : {'+' if res.delta>=0 else ''}{res.delta*100:.1f} puan"
        f"   {'✅ kovan yardımcı oldu' if res.delta>0 else ('➖ fark yok' if res.delta==0 else '⚠️ kovan geriletti')}",
        f"  Önbellek isabeti: {res.cache_hits}",
        "",
        "  Not: sonuç göreve ve modele bağlıdır; bu bir tartı, kanıt makinesi değil.",
    ]
    return "\n".join(lines)


def main():
    import argparse, json
    ap = argparse.ArgumentParser(description="Caphlon Kovan Eval — solo vs hive ölçümü")
    ap.add_argument("--samples", type=int, default=5)
    ap.add_argument("--model-cmd", default="", help="Model kabuk komutu ({q}=soru). Boşsa bağlı model.")
    ap.add_argument("--bench", default="", help="JSONL görev seti: {question, expected, check}")
    ap.add_argument("--json", action="store_true", help="Ham JSON çıktı")
    args = ap.parse_args()

    tasks = BUILTIN
    if args.bench:
        tasks = []
        with open(args.bench) as f:
            for line in f:
                line = line.strip()
                if line:
                    d = json.loads(line)
                    tasks.append(Task(d["question"], str(d["expected"]), d.get("check", "contains")))

    from hive_node import resolve_model_fn
    fn = resolve_model_fn(args.model_cmd)
    res = evaluate(fn, tasks, samples=args.samples)
    if args.json:
        print(json.dumps({
            "n": res.n, "solo_acc": res.solo_acc, "hive_acc": res.hive_acc,
            "delta": res.delta, "cache_hits": res.cache_hits, "per_task": res.per_task,
        }, ensure_ascii=False, indent=2))
    else:
        print(format_report(res))


if __name__ == "__main__":
    main()
