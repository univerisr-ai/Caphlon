#!/usr/bin/env python3
"""
Caphlon — Öz-Topluluk (Self-Ensemble / Self-Consistency)
========================================================

"Binlerce kullanıcı" altyapısının TEK kullanıcıda da işe yarayan köprüsü.

Swarm henüz küçükken bile zayıf bir modeli güçlendirmenin kanıtlı yolu:
aynı soruyu modele N kez (sıcaklıkla çeşitlenerek) sor, cevapları kovan
konsensüsünden geçir. Bağımsız örnekleme hatalarının çoğunluğu elenir →
"self-consistency" etkisi (Wang et al. 2022 ile aynı ilke).

Avantaj:
  • Bugün, tek makinede, ekstra düğüm olmadan çalışır.
  • Aynı HiveEngine + paylaşımlı önbelleği kullanır → gerçek düğümler
    katıldığında otomatik olarak gerçek swarm konsensüsüne dönüşür.
  • Retrieval-first: önbellekte cevap varsa model HİÇ çağrılmaz (bedava).

Maliyet: N küçük çıkarım (paralelleştirilebilir). 2GB RAM dostu — N=3..7 yeter.

Saf stdlib. Çalıştır testler:  python3 -m unittest test_local_ensemble -v
"""

from __future__ import annotations

from typing import Callable, Optional

from hive_engine import HiveEngine, NodeAnswer, HiveResult


def ensemble_answer(
    instruction: str,
    model_fn: Callable[[str], str],
    n_samples: int = 5,
    engine: Optional[HiveEngine] = None,
    node_id: str = "self",
) -> HiveResult:
    """Tek modeli N kez örnekle, kovan konsensüsüyle tek güçlü cevaba indir.

    `model_fn(instruction) -> str`: çağrıldıkça (sıcaklık>0 ile) farklı
    örnekler döndürmesi beklenir. Deterministik modelde tüm örnekler aynı
    olur — bu durumda konsensüs zararsızdır (mutabakat 1.0).

    `engine` verilmezse geçici bir motor kurulur (önbellek paylaşımı için
    çağıran tarafın engine'ini geçmesi önerilir)."""
    eng = engine or HiveEngine()

    # 1) Retrieval-first: önbellekte yeterince güvenilir cevap varsa modeli atla.
    cached = eng.cache.lookup(instruction)
    if cached is not None:
        return eng.answer(instruction, [])  # cache yolundan HiveResult döndürür

    # 2) N bağımsız örnek üret.
    answers: list[NodeAnswer] = []
    for i in range(max(1, n_samples)):
        out = model_fn(instruction)
        if out and not out.startswith("[model-hata"):
            answers.append(NodeAnswer(f"{node_id}#{i}", out))

    if not answers:
        return HiveResult(None, "none", 0.0, 0, 0, 0)

    # 3) Konsensüs (+ kabul edilen cevap önbelleğe yazılır → bir dahaki sefere bedava).
    return eng.answer(instruction, answers)


def best_of_n(
    instruction: str,
    model_fn: Callable[[str], str],
    n_samples: int = 5,
    engine: Optional[HiveEngine] = None,
) -> str:
    """Kolaylık sarmalayıcı: yalnızca metin cevabı döndür (boşsa boş string)."""
    res = ensemble_answer(instruction, model_fn, n_samples, engine)
    return res.answer or ""


def main():
    import argparse, json
    ap = argparse.ArgumentParser(description="Caphlon Öz-Topluluk (self-consistency)")
    ap.add_argument("instruction")
    ap.add_argument("--samples", type=int, default=5)
    ap.add_argument("--model-cmd", default="", help="Model kabuk komutu ({q}=soru). Boşsa bağlı model / stub.")
    args = ap.parse_args()

    # Model fonksiyonunu düğümle aynı çözümleyiciden al (bağlı model → shell → stub).
    from hive_node import resolve_model_fn
    fn = resolve_model_fn(args.model_cmd)
    res = ensemble_answer(args.instruction, fn, n_samples=args.samples)
    print(json.dumps({
        "answer": res.answer, "source": res.source, "agreement": res.agreement,
        "samples_agreed": res.cluster_size, "samples_valid": res.contributors,
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
