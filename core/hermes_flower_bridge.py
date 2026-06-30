#!/usr/bin/env python3
"""
[KULLANIMDAN KALDIRILDI] hermes_flower_bridge.py

Bu dosya adı "Flower bridge" diyordu ama Flower'a hiç dokunmuyor, sadece
Hermes ile /tmp'ye rastgele Q/A yazıyordu — kovan döngüsüne bağlı değildi.

Yerini iki gerçek modül aldı:
  • trajectory_capture.py — kovanın KONSENSÜSLE onayladığı çözümleri
    LoRA eğitim verisine (JSONL) aktarır.   (capture → train köprüsü)
  • hive_server.py / hive_node.py — gerçek federated swarm akışı.

Geriye dönük uyumluluk için eski çağrı trajectory_capture'a yönlendirilir.
"""

from __future__ import annotations

import sys
from trajectory_capture import export_training_data


def generate_training_pairs(*_a, **_k):  # eski API — artık kovan önbelleğinden besle
    raise NotImplementedError(
        "Rastgele üretim kaldırıldı. Eğitim verisi kovan konsensüsünden gelir:\n"
        "  python3 trajectory_capture.py --cache ./data/hive_cache.db --out ./data/train.jsonl"
    )


if __name__ == "__main__":
    print(__doc__)
    print(">> trajectory_capture'a yönlendiriliyor (varsayılan yollar)...\n")
    try:
        n = export_training_data("./data/hive_cache.db", "./data/train.jsonl")
        print(f"✅ {n} kovan-onaylı örnek → ./data/train.jsonl")
    except FileNotFoundError as e:
        print(f"ℹ️  {e}\n   Önce kovanı çalıştır: python3 hive_server.py + hive_node.py join")
        sys.exit(0)
