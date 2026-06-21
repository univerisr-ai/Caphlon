#!/usr/bin/env python3
"""
Project Underdog — Hermes ↔ Flower Bridge
Hermes Agent'tan batch trajectory alır, Flower federated client'a training data olarak besler.
"""

import subprocess, json, sys, os

def hermes_generate(prompt: str, model: str = "openrouter/auto") -> str:
    """Hermes CLI ile tek seferlik cevap üret."""
    result = subprocess.run(
        ["hermes", "-z", prompt, "-m", model],
        capture_output=True, text=True, timeout=120,
        env={**os.environ, "HOME": os.environ["HOME"]}
    )
    return result.stdout.strip() or result.stderr.strip()

def generate_training_pairs(questions: list[str]) -> list[dict]:
    """Hermes ile soru-cevap çiftleri üret."""
    pairs = []
    for q in questions:
        answer = hermes_generate(q)
        pairs.append({"instruction": q, "output": answer})
        print(f"  [{len(pairs)}/{len(questions)}] {q[:40]}... → {answer[:40]}...")
    return pairs

if __name__ == "__main__":
    # Test soruları
    test_questions = [
        "2+2 kactir? sadece rakam.",
        "Python'da list comprehension nedir? 1 cümle.",
        "Federated learning nedir? 1 cümle.",
    ]
    print("=== Hermes → Flower Bridge Test ===")
    pairs = generate_training_pairs(test_questions)
    
    output_file = "/tmp/underdog_training_data.jsonl"
    with open(output_file, "w") as f:
        for p in pairs:
            f.write(json.dumps(p) + "\n")
    
    print(f"\n✅ {len(pairs)} training pair → {output_file}")
    print("📦 Flower client bu veriyi okuyup federated training yapabilir.")
