#!/usr/bin/env python3
"""
Caphlon — Global Adapter Registry (sürümlü ortak adapter deposu)
===============================================================

Federated turun ÇIKTI ağzı. `fed_aggregate.federated_round` blind-eval'den
geçen yeni global adapter'ı buraya yayınlar; düğümler `latest`'i indirip kendi
zayıf modellerine yükler. "Bir kişinin katkısı herkesin malı olur" halkasının
son adımı.

Adapter'lar JSON-vektör olarak saklanır (torch'suz test edilebilir). Gerçek
LoRA tensörleri `lora_io` (torch varsa) ile bu forma çevrilir/geri yazılır.

Depo düzeni:
  data/adapters/
    manifest.json            → {"latest": 3, "versions": [{version, score, path, created}]}
    adapter-v1.json
    adapter-v2.json
    ...

Saf stdlib. Çalıştır:  python3 adapter_registry.py --dir ./data/adapters --info
"""

from __future__ import annotations

import json
import time
from pathlib import Path
from typing import Optional


class AdapterRegistry:
    def __init__(self, root: str = "./data/adapters"):
        self.root = Path(root)
        self.root.mkdir(parents=True, exist_ok=True)
        self.manifest_path = self.root / "manifest.json"

    # ---- manifest -------------------------------------------------------
    def _load_manifest(self) -> dict:
        if self.manifest_path.exists():
            try:
                return json.loads(self.manifest_path.read_text())
            except json.JSONDecodeError:
                pass
        return {"latest": 0, "versions": []}

    def _save_manifest(self, m: dict):
        self.manifest_path.write_text(json.dumps(m, indent=2, ensure_ascii=False))

    # ---- publish / fetch ------------------------------------------------
    def publish(self, vectors: dict, score: float, created: Optional[float] = None) -> dict:
        """Yeni sürüm yayınla; latest'i ilerlet. `created` testlerde sabitlenebilir."""
        m = self._load_manifest()
        version = int(m.get("latest", 0)) + 1
        fname = f"adapter-v{version}.json"
        (self.root / fname).write_text(json.dumps(vectors, ensure_ascii=False))
        entry = {
            "version": version,
            "score": score,
            "path": fname,
            "created": created if created is not None else time.time(),
        }
        m["versions"].append(entry)
        m["latest"] = version
        self._save_manifest(m)
        return entry

    def latest_meta(self) -> Optional[dict]:
        m = self._load_manifest()
        if not m.get("latest"):
            return None
        for v in m["versions"]:
            if v["version"] == m["latest"]:
                return v
        return None

    def load_version(self, version: int) -> Optional[dict]:
        for v in self._load_manifest().get("versions", []):
            if v["version"] == version:
                p = self.root / v["path"]
                if p.exists():
                    return json.loads(p.read_text())
        return None

    def load_latest(self) -> Optional[dict]:
        meta = self.latest_meta()
        return self.load_version(meta["version"]) if meta else None

    def rollback(self, to_version: int) -> bool:
        """latest'i daha eski (yayınlanmış) bir sürüme geri al — regresyon kurtarma."""
        m = self._load_manifest()
        if any(v["version"] == to_version for v in m.get("versions", [])):
            m["latest"] = to_version
            self._save_manifest(m)
            return True
        return False

    def info(self) -> dict:
        m = self._load_manifest()
        return {
            "latest": m.get("latest", 0),
            "count": len(m.get("versions", [])),
            "versions": [{"version": v["version"], "score": round(v["score"], 4)} for v in m.get("versions", [])],
        }


def main():
    import argparse
    ap = argparse.ArgumentParser(description="Caphlon Adapter Registry")
    ap.add_argument("--dir", default="./data/adapters")
    ap.add_argument("--info", action="store_true")
    ap.add_argument("--rollback", type=int, default=0)
    args = ap.parse_args()
    reg = AdapterRegistry(args.dir)
    if args.rollback:
        print("✅ geri alındı" if reg.rollback(args.rollback) else "✖ sürüm yok")
    print(json.dumps(reg.info(), indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
