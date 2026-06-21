#!/usr/bin/env python3
"""
Project Underdog — Fine-Tuning Pipeline (Aşama 4)
SmolLM-135M LoRA CPU fine-tuning.
HuggingFace TRL + PEFT ile, QLoRA optimizasyonlu.
CPU'da çalışır (yavaş ama mümkün).
"""

import sys, os, argparse, json
from pathlib import Path
import torch
from transformers import (
    AutoModelForCausalLM,
    AutoTokenizer,
    BitsAndBytesConfig,
)
from datasets import Dataset
from peft import LoraConfig, get_peft_model, TaskType
from trl import SFTConfig, SFTTrainer


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Project Underdog Fine-Tuning Pipeline")
    parser.add_argument("--model", default="HuggingFaceTB/SmolLM2-135M-Instruct", help="Base model")
    parser.add_argument("--data", default="/tmp/underdog_training_data.jsonl", help="JSONL training data")
    parser.add_argument("--output", default="./models/underdog-smollm-lora", help="Output directory")
    parser.add_argument("--epochs", type=int, default=1, help="Training epochs")
    parser.add_argument("--batch_size", type=int, default=1, help="Micro batch size")
    parser.add_argument("--grad_accum", type=int, default=4, help="Gradient accumulation")
    parser.add_argument("--max_steps", type=int, default=10, help="Max training steps (0=no limit)")
    parser.add_argument("--lr", type=float, default=2e-4, help="Learning rate")
    parser.add_argument("--max_len", type=int, default=512, help="Max sequence length")
    parser.add_argument("--cpu", action="store_true", default=True, help="Force CPU mode")
    parser.add_argument("--use_4bit", action="store_true", help="Use 4-bit quantization")
    parser.add_argument("--push_hub", default="", help="HF hub repo (optional)")
    args = parser.parse_args()
    return args


def format_chat(example: dict) -> str:
    """Format instruction-output pair as chat template."""
    instruction = example.get("instruction", "")
    output = example.get("output", "")
    return f"<|user|>\n{instruction}\n<|assistant|>\n{output}"


def load_dataset(path: str) -> Dataset:
    """Load JSONL training data. Creates synthetic data if file missing."""
    if not Path(path).exists():
        print(f"[underdog] Data file not found: {path}, using synthetic data")
        examples = [
            {"instruction": "1+1=?", "output": "2"},
            {"instruction": "2+2=?", "output": "4"},
            {"instruction": "Python nedir?", "output": "Python bir programlama dilidir."},
            {"instruction": "Merhaba", "output": "Merhaba! Size nasıl yardımcı olabilirim?"},
            {"instruction": "Federated learning nedir?", "output": "Federated learning, veriyi merkezileştirmeden modelleri dağıtık şekilde eğitme yöntemidir."},
            {"instruction": "3*7=?", "output": "21"},
            {"instruction": "10-5=?", "output": "5"},
            {"instruction": "9/3=?", "output": "3"},
            {"instruction": "List comprehension nedir?", "output": "List comprehension, mevcut listeden yeni liste oluşturma sözdizimidir."},
            {"instruction": "AI nedir?", "output": "AI, makinelerin insan benzeri zeka göstermesini sağlayan teknolojidir."},
        ]
    else:
        examples = []
        with open(path) as f:
            for line in f:
                line = line.strip()
                if line:
                    examples.append(json.loads(line))

    texts = [format_chat(e) for e in examples]
    return Dataset.from_dict({"text": texts})


def main():
    args = parse_args()
    print(f"[underdog] Fine-tuning pipeline starting")
    print(f"  Model:     {args.model}")
    print(f"  Data:      {args.data}")
    print(f"  Output:    {args.output}")
    print(f"  Device:    {'CPU' if args.cpu else 'GPU'}")
    print(f"  Epochs:    {args.epochs}")
    print(f"  Batch:     {args.batch_size} × grad_acc={args.grad_accum}")

    # Quantization config (CPU-friendly)
    bnb_config = None
    if args.use_4bit and torch.cuda.is_available():
        bnb_config = BitsAndBytesConfig(
            load_in_4bit=True,
            bnb_4bit_compute_dtype=torch.float16,
            bnb_4bit_use_double_quant=True,
        )
        print(f"  Quant:     4-bit (CUDA available)")
    else:
        print(f"  Quant:     none (CPU mode or CUDA not found)")

    # Load model & tokenizer
    print(f"\n[underdog] Loading model...")
    model = AutoModelForCausalLM.from_pretrained(
        args.model,
        quantization_config=bnb_config,
        device_map={"": "cpu"} if args.cpu else "auto",
        torch_dtype=torch.float32 if args.cpu else torch.float16,
        trust_remote_code=True,
    )
    tokenizer = AutoTokenizer.from_pretrained(args.model, trust_remote_code=True)
    if tokenizer.pad_token is None:
        tokenizer.pad_token = tokenizer.eos_token

    # LoRA config (ultra-efficient: 0.24% trainable params for SmolLM)
    peft_config = LoraConfig(
        r=4,               # Low rank (tiny training)
        lora_alpha=8,      # Scaling factor
        lora_dropout=0.3,  # Regularization
        target_modules=["q_proj", "v_proj"],
        bias="none",
        task_type=TaskType.CAUSAL_LM,
    )

    # Load dataset
    dataset = load_dataset(args.data)
    print(f"  Samples:    {len(dataset)}")

    # Training config (CPU-optimized, minimal)
    sft_config = SFTConfig(
        output_dir=args.output,
        per_device_train_batch_size=args.batch_size,
        gradient_accumulation_steps=args.grad_accum,
        num_train_epochs=args.epochs,
        max_steps=args.max_steps if args.max_steps > 0 else None,
        learning_rate=args.lr,
        logging_steps=1,
        save_steps=5,
        save_total_limit=2,
        dataloader_num_workers=0,
        use_cpu=True,  # CPU mode
        report_to="none",
    )

    # Trainer (TRL 1.6+: max_seq_length removed, tokenizer handles truncation)
    trainer = SFTTrainer(
        model=model,
        processing_class=tokenizer,
        train_dataset=dataset,
        args=sft_config,
        peft_config=peft_config,
    )

    # Train
    print(f"\n[underdog] Training...")
    trainer.train()

    # Save
    print(f"\n[underdog] Saving model...")
    trainer.save_model(args.output)
    tokenizer.save_pretrained(args.output)
    print(f"[underdog] ✅ Done! Model saved to {args.output}")

    # Stats
    trainable = sum(p.numel() for p in model.parameters() if p.requires_grad)
    total = sum(p.numel() for p in model.parameters())
    print(f"[underdog] Trainable: {trainable:,} / Total: {total:,} ({100*trainable/total:.2f}%)")


if __name__ == "__main__":
    main()
