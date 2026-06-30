#!/usr/bin/env python3
"""
Caphlon — Federated Aggregation (itibar-ağırlıklı FedAvg + blind-eval gate)
==========================================================================

Kovanın "biriken güç" halkası. Düğümler lokal LoRA *delta*'ları üretir (ham veri
makinede kalır); koordinatör bunları birleştirir:

  1. screen     — anomali/zehir elemesi (norm'u aşırı büyük delta'ları at)
  2. fedavg     — itibar-ağırlıklı ortalama (kötü düğümün ağırlığı küçük)
  3. gate       — blind-eval: aday adapter ancak BAĞIMSIZ holdout skorunu
                  artırırsa yayınlanır (generator kendi işini onaylayamaz)

Çekirdek mantık parametreyi "isim → sayı vektörü" dict'i olarak görür; bu yüzden
torch OLMADAN test edilebilir. torch varsa `lora_io` yardımcıları gerçek LoRA
tensörlerini bu forma çevirir/geri yazar.

Saf stdlib (math). Çalıştır testler:  python3 -m unittest test_fed_aggregate -v
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field
from typing import Callable, Optional


Vectors = dict[str, list[float]]   # param adı → düzleştirilmiş ağırlık vektörü


# --------------------------------------------------------------------------- #
# Vektör yardımcıları
# --------------------------------------------------------------------------- #
def _l2(vec: list[float]) -> float:
    return math.sqrt(sum(x * x for x in vec))


def global_norm(v: Vectors) -> float:
    """Tüm parametreler boyunca tek bir L2 normu (delta büyüklüğü)."""
    return math.sqrt(sum(x * x for vec in v.values() for x in vec))


def _median(xs: list[float]) -> float:
    s = sorted(xs)
    n = len(s)
    if n == 0:
        return 0.0
    mid = n // 2
    return s[mid] if n % 2 else (s[mid - 1] + s[mid]) / 2.0


# --------------------------------------------------------------------------- #
# 1) Anomali / zehir elemesi
# --------------------------------------------------------------------------- #
@dataclass
class ScreenResult:
    kept: list[int]                       # tutulan delta indeksleri
    dropped: list[int] = field(default_factory=list)
    reasons: dict[int, str] = field(default_factory=dict)


def screen_outliers(deltas: list[Vectors], max_norm_ratio: float = 3.0) -> ScreenResult:
    """Norm'u medyan normun `max_norm_ratio` katından büyük delta'ları ele.

    Zehir saldırılarının çoğu (model replacement, gradient boosting) anormal
    büyük güncelleme üretir; medyan-tabanlı eşik bunları dayanıklı şekilde keser.
    """
    norms = [global_norm(d) for d in deltas]
    med = _median([n for n in norms if n > 0]) or 0.0
    res = ScreenResult(kept=[])
    for i, n in enumerate(norms):
        if med > 0 and n > max_norm_ratio * med:
            res.dropped.append(i)
            res.reasons[i] = f"norm {n:.3f} > {max_norm_ratio}× medyan {med:.3f}"
        else:
            res.kept.append(i)
    return res


# --------------------------------------------------------------------------- #
# 2) İtibar-ağırlıklı FedAvg
# --------------------------------------------------------------------------- #
def reputation_weighted_fedavg(
    deltas: list[Vectors],
    weights: list[float],
) -> Vectors:
    """Delta'ların itibar-ağırlıklı ortalaması.

    `weights[i]`: i. düğümün itibarı (≥0). Negatif/sıfır toplam → eşit ağırlık.
    Bir parametre yalnızca onu içeren delta'lar üzerinden ortalanır (eksik
    parametre o düğüm için katkı vermez)."""
    if not deltas:
        return {}
    if len(weights) != len(deltas):
        raise ValueError("weights ve deltas uzunlukları eşit olmalı")
    w = [max(0.0, x) for x in weights]
    if sum(w) <= 0:
        w = [1.0] * len(deltas)

    out: Vectors = {}
    wsum: dict[str, float] = {}
    for d, wi in zip(deltas, w):
        if wi <= 0:
            continue
        for name, vec in d.items():
            if name not in out:
                out[name] = [0.0] * len(vec)
                wsum[name] = 0.0
            if len(vec) != len(out[name]):
                raise ValueError(f"'{name}' parametresinde boyut uyuşmazlığı")
            for j, x in enumerate(vec):
                out[name][j] += wi * x
            wsum[name] += wi
    for name in out:
        s = wsum[name] or 1.0
        out[name] = [x / s for x in out[name]]
    return out


def apply_delta(base: Vectors, delta: Vectors, scale: float = 1.0) -> Vectors:
    """base + scale·delta — birleştirilmiş global adapter'ı üret."""
    out: Vectors = {k: list(v) for k, v in base.items()}
    for name, vec in delta.items():
        if name not in out:
            out[name] = [0.0] * len(vec)
        for j, x in enumerate(vec):
            out[name][j] += scale * x
    return out


# --------------------------------------------------------------------------- #
# 3) Blind-eval gate (generator-verifier izolasyonu)
# --------------------------------------------------------------------------- #
@dataclass
class GateDecision:
    accepted: bool
    candidate_score: float
    current_score: float
    delta: float
    reason: str


class BlindEvalGate:
    """Aday adapter'ı BAĞIMSIZ bir holdout eval'iyle geçir.

    `eval_fn(vectors) -> float` (yüksek = iyi) koordinatörün GÖRMEDİĞİ bir
    holdout seti üzerinde skor verir. Aday ancak mevcut adapter'dan en az
    `min_improvement` kadar iyiyse kabul edilir → kalabalık modeli bozamaz,
    regresyon yayınlanmaz."""

    def __init__(self, eval_fn: Callable[[Vectors], float], min_improvement: float = 0.0):
        self.eval_fn = eval_fn
        self.min_improvement = min_improvement

    def evaluate(self, candidate: Vectors, current: Optional[Vectors]) -> GateDecision:
        cand = self.eval_fn(candidate)
        cur = self.eval_fn(current) if current is not None else float("-inf")
        delta = cand - cur
        if current is None:
            return GateDecision(True, cand, cur, delta, "ilk adapter — referans yok, kabul")
        ok = delta >= self.min_improvement
        reason = (
            f"skor {cand:.4f} ≥ mevcut {cur:.4f} + {self.min_improvement} → kabul"
            if ok else
            f"skor {cand:.4f} < mevcut {cur:.4f} + {self.min_improvement} → RED (regresyon)"
        )
        return GateDecision(ok, cand, cur, delta, reason)


# --------------------------------------------------------------------------- #
# Uçtan uca: bir federated tur
# --------------------------------------------------------------------------- #
@dataclass
class RoundResult:
    merged: Optional[Vectors]
    published: bool
    screen: ScreenResult
    gate: Optional[GateDecision]


def federated_round(
    base: Vectors,
    deltas: list[Vectors],
    reputations: list[float],
    eval_fn: Optional[Callable[[Vectors], float]] = None,
    current: Optional[Vectors] = None,
    min_improvement: float = 0.0,
    max_norm_ratio: float = 3.0,
    scale: float = 1.0,
) -> RoundResult:
    """Tam bir tur: ele → ortala → uygula → (varsa) blind-eval ile geçir.

    eval_fn verilmezse gate atlanır (her zaman yayınlanır)."""
    screen = screen_outliers(deltas, max_norm_ratio)
    kept_deltas = [deltas[i] for i in screen.kept]
    kept_reps = [reputations[i] for i in screen.kept]
    if not kept_deltas:
        return RoundResult(None, False, screen, None)

    avg = reputation_weighted_fedavg(kept_deltas, kept_reps)
    merged = apply_delta(base, avg, scale=scale)

    if eval_fn is None:
        return RoundResult(merged, True, screen, None)

    gate = BlindEvalGate(eval_fn, min_improvement).evaluate(merged, current)
    return RoundResult(merged if gate.accepted else None, gate.accepted, screen, gate)


if __name__ == "__main__":
    # Küçük gösterim: 3 iyi düğüm bir yöne çeker, 1 zehir aşırı büyük delta verir.
    base = {"w": [0.0, 0.0]}
    good = [{"w": [1.0, 1.0]}, {"w": [1.1, 0.9]}, {"w": [0.9, 1.1]}]
    poison = {"w": [100.0, -100.0]}
    deltas = good + [poison]
    reps = [0.8, 0.8, 0.8, 0.5]
    res = federated_round(base, deltas, reps, eval_fn=lambda v: -global_norm({"w": [v["w"][0]-1, v["w"][1]-1]}))
    print("Elenen (zehir) indeksler:", res.screen.dropped, res.screen.reasons)
    print("Birleşmiş adapter:", res.merged)
    print("Yayınlandı mı:", res.published, "·", res.gate and res.gate.reason)
