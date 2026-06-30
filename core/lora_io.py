#!/usr/bin/env python3
"""
Caphlon — LoRA ↔ JSON-vektör köprüsü
====================================

Federated katmanın gerçek tensörlerle buluştuğu yer. `fed_aggregate` ve
`adapter_registry` parametreyi "isim → düz sayı vektörü" (JSON) olarak görür;
bu modül onları gerçek PEFT/LoRA adapter dosyalarına çevirir/geri yazar.

Akış:
  fine_tune.py  →  LoRA adapter dizini  →[to_vectors]→  delta.json  →  hive submit-delta
  hive pull     →  adapter-latest.json  →[from_vectors]→  LoRA adapter dizini  →  model_serve.py

torch + safetensors GEREKTİRİR (fine_tune.py zaten bunlara bağlı). Yoksa net
hata verir — saf-stdlib federated testleri bu modüle dokunmaz.
"""

from __future__ import annotations

import json
from pathlib import Path


def _require_torch():
    try:
        import torch  # noqa: F401
        from safetensors.torch import load_file, save_file  # noqa: F401
        return load_file, save_file
    except ImportError as e:
        raise ImportError(
            "lora_io torch + safetensors gerektirir (fine_tune.py ile aynı bağımlılık).\n"
            "  pip install torch safetensors peft"
        ) from e


def adapter_to_vectors(adapter_dir: str) -> dict:
    """LoRA adapter dizinindeki tensörleri JSON-vektör (isim → float listesi) yap.

    Şekil bilgisi `__shapes__` altında saklanır ki geri yazımda restore edilsin.
    """
    load_file, _ = _require_torch()
    st = Path(adapter_dir) / "adapter_model.safetensors"
    if not st.exists():
        raise FileNotFoundError(f"adapter tensör yok: {st}")
    tensors = load_file(str(st))
    vectors: dict = {}
    shapes: dict = {}
    for name, t in tensors.items():
        vectors[name] = t.flatten().tolist()
        shapes[name] = list(t.shape)
    vectors["__shapes__"] = shapes
    return vectors


def vectors_to_adapter(vectors: dict, adapter_dir: str, template_dir: str | None = None) -> str:
    """JSON-vektörleri tekrar bir LoRA adapter dizinine yaz.

    `template_dir`: adapter_config.json'u kopyalamak için kaynak adapter (şart
    değil ama PEFT'in yüklemesi için config gerekir)."""
    import torch
    _, save_file = _require_torch()
    shapes = vectors.get("__shapes__", {})
    out = Path(adapter_dir)
    out.mkdir(parents=True, exist_ok=True)
    tensors = {}
    for name, vec in vectors.items():
        if name == "__shapes__":
            continue
        shape = shapes.get(name)
        t = torch.tensor(vec, dtype=torch.float32)
        if shape:
            t = t.reshape(shape)
        tensors[name] = t
    save_file(tensors, str(out / "adapter_model.safetensors"))
    # PEFT config'i kopyala (varsa) — yoksa kullanıcı fine_tune çıktısından almalı.
    if template_dir:
        cfg = Path(template_dir) / "adapter_config.json"
        if cfg.exists():
            (out / "adapter_config.json").write_text(cfg.read_text())
    return str(out)


def main():
    import argparse
    ap = argparse.ArgumentParser(description="LoRA ↔ JSON-vektör köprüsü")
    sub = ap.add_subparsers(dest="cmd", required=True)
    e = sub.add_parser("export", help="LoRA adapter dizini → JSON-vektör")
    e.add_argument("--adapter", required=True)
    e.add_argument("--out", required=True)
    i = sub.add_parser("import", help="JSON-vektör → LoRA adapter dizini")
    i.add_argument("--in", dest="inp", required=True)
    i.add_argument("--adapter", required=True)
    i.add_argument("--template", default=None)
    args = ap.parse_args()

    if args.cmd == "export":
        v = adapter_to_vectors(args.adapter)
        Path(args.out).write_text(json.dumps(v, ensure_ascii=False))
        n = len([k for k in v if k != "__shapes__"])
        print(f"✅ {n} tensör → {args.out}")
    else:
        vectors = json.loads(Path(args.inp).read_text())
        d = vectors_to_adapter(vectors, args.adapter, args.template)
        print(f"✅ adapter yazıldı → {d}")


if __name__ == "__main__":
    main()
