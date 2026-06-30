#!/usr/bin/env python3
"""
Caphlon — Trajectory Capture → Eğitim Verisi Köprüsü
====================================================

Kovanın "biriken güç" katmanının (federated LoRA) BESLEME ağzı.

Eski `hermes_flower_bridge.py` adı "Flower bridge" diyordu ama Flower'a hiç
dokunmuyor, sadece /tmp'ye rastgele Q/A yazıyordu. Bu modül onun yerini alır:
kovanın KONSENSÜSLE KABUL ETTİĞİ (yani birden çok düğümün anlaştığı, itibar
ağırlıklı, doğrulamadan geçmiş) çözümleri paylaşımlı önbellekten okuyup
`fine_tune.py`'nin beklediği JSONL formatına (instruction/output) aktarır.

Böylece eğitim verisi RASTGELE değil, kovanın kendi onayladığı en güçlü
örneklerden oluşur — "kalabalığın doğruladığı bilgi" damıtılır.

Saf stdlib. Çalıştır:
  python3 trajectory_capture.py --cache ./data/hive_cache.db --out ./data/train.jsonl \
          --min-score 1.5 --min-contributors 2
"""

from __future__ import annotations

import argparse
import json
import sqlite3
from pathlib import Path


def export_training_data(
    cache_db: str,
    out_jsonl: str,
    min_score: float = 1.0,
    min_contributors: int = 1,
    limit: int = 0,
) -> int:
    """Önbellekten yüksek-güven çözümleri JSONL eğitim setine aktar.

    Filtreler:
      min_score        — itibar-ağırlıklı birikmiş onay eşiği
      min_contributors — en az kaç farklı konsensüs bu çözümü desteklemeli
    Döner: yazılan örnek sayısı.
    """
    if not Path(cache_db).exists():
        raise FileNotFoundError(f"önbellek yok: {cache_db}")
    db = sqlite3.connect(cache_db)
    db.row_factory = sqlite3.Row
    sql = (
        "SELECT instruction, output, score, contributors FROM solutions "
        "WHERE score >= ? AND contributors >= ? ORDER BY score DESC"
    )
    if limit > 0:
        sql += f" LIMIT {int(limit)}"
    rows = db.execute(sql, (min_score, min_contributors)).fetchall()
    db.close()

    Path(out_jsonl).parent.mkdir(parents=True, exist_ok=True)
    n = 0
    with open(out_jsonl, "w") as f:
        for r in rows:
            f.write(json.dumps(
                {"instruction": r["instruction"], "output": r["output"]},
                ensure_ascii=False,
            ) + "\n")
            n += 1
    return n


def main():
    ap = argparse.ArgumentParser(description="Kovan önbelleği → LoRA eğitim verisi")
    ap.add_argument("--cache", default="./data/hive_cache.db")
    ap.add_argument("--out", default="./data/train.jsonl")
    ap.add_argument("--min-score", type=float, default=1.0)
    ap.add_argument("--min-contributors", type=int, default=1)
    ap.add_argument("--limit", type=int, default=0)
    args = ap.parse_args()

    n = export_training_data(args.cache, args.out, args.min_score, args.min_contributors, args.limit)
    print(f"✅ {n} kovan-onaylı örnek → {args.out}")
    if n == 0:
        print("   (eşiği düşür ya da kovanı biraz daha çalıştır: henüz yeterli konsensüs yok)")
    else:
        print(f"   Sonraki adım:  python3 fine_tune.py --data {args.out} --output ./models/hive-lora")


if __name__ == "__main__":
    main()
