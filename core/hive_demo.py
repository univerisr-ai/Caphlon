#!/usr/bin/env python3
"""
Kovan Zekası — "binlerce zayıf düğüm → güçlü cevap" simülasyonu.

Her düğüm, tek başına %p doğrulukta ZAYIF bir model (ör. Gemma-2B). Hataları
bağımsız. Aynı soruyu N düğüme sorup itibar-ağırlıklı konsensüs alınca
kovanın doğruluğu, tek düğümünkinin çok üstüne çıkar (Condorcet jüri teoremi).

Bu, ağırlık eğitimi olmadan — yalnızca kalabalık + konsensüs ile — elde edilen
ANINDA güç kazancını gösterir. Düğüm başına maliyet: 1 küçük çıkarım.

Çalıştır:  cd core && python3 hive_demo.py
(Deterministik: dış random yerine sabit tohumlu üretim — testlerle uyumlu.)
"""

import tempfile
from hive_engine import HiveEngine, NodeAnswer
from security import ReputationSystem, Honeypot
from hive_cache import SharedSolutionCache


def _lcg(seed):
    """Küçük deterministik PRNG (Math.random yasak ortamlarla da uyumlu)."""
    state = seed & 0xFFFFFFFF
    while True:
        state = (1103515245 * state + 12345) & 0x7FFFFFFF
        yield state / 0x7FFFFFFF


def simulate(node_accuracy: float, n_nodes: int, n_questions: int, seed: int = 42) -> float:
    """N zayıf düğümle konsensüs doğruluğunu ölç."""
    rng = _lcg(seed)
    correct = 0
    for q in range(n_questions):
        tmp = tempfile.mkdtemp()
        eng = HiveEngine(
            reputation=ReputationSystem(db_path=tmp + "/r.db"),
            cache=SharedSolutionCache(db_path=tmp + "/c.db"),
            honeypot=Honeypot(),
        )
        truth = "DOGRU"
        answers = []
        for i in range(n_nodes):
            # Düğüm p olasılıkla doğru, değilse rastgele bir yanlışa düşer.
            if next(rng) < node_accuracy:
                out = truth
            else:
                out = f"YANLIS_{int(next(rng) * 5)}"  # 5 farklı yanlış moduna dağıl
            answers.append(NodeAnswer(f"n{i}", out))
        res = eng.answer(f"soru_{q}", answers)
        if res.answer == truth:
            correct += 1
    return correct / n_questions


if __name__ == "__main__":
    P = 0.45  # tek zayıf düğüm: %45 doğru (rastgeleden biraz iyi)
    Q = 200
    print(f"Tek zayıf düğüm doğruluğu (taban):  %{P*100:.0f}")
    print(f"{'Düğüm sayısı':>14} | {'Kovan doğruluğu':>16} | kazanç")
    print("-" * 48)
    base = None
    for n in (1, 3, 7, 15, 51, 201):
        acc = simulate(P, n, Q)
        if base is None:
            base = acc
        print(f"{n:>14} | {'%'+format(acc*100,'.1f'):>16} | +{(acc-base)*100:>5.1f} puan")
    print("\nSonuç: düğüm sayısı arttıkça aynı zayıf model, ağırlık eğitimi")
    print("olmadan, yalnızca konsensüsle güçlü-model doğruluğuna yaklaşır.")
