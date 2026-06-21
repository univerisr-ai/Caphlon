#!/usr/bin/env python3
"""
Project Underdog — Model Serving API
Fine-tuned SmolLM-135M LoRA modelini REST API olarak sunar.
Hermes Agent ve Qualixar OS bu API'ye bağlanabilir.
"""

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from transformers import AutoModelForCausalLM, AutoTokenizer
from peft import PeftModel
import torch, uvicorn, os

app = FastAPI(title="Project Underdog Model API", version="0.1.0")

MODEL_PATH = os.environ.get("UNDERDOG_MODEL", "HuggingFaceTB/SmolLM2-135M-Instruct")
LORA_PATH = os.environ.get("UNDERDOG_LORA", "./models/underdog-test")
PORT = int(os.environ.get("UNDERDOG_PORT", "9877"))

model = None
tokenizer = None

class GenerateRequest(BaseModel):
    prompt: str
    max_tokens: int = 128
    temperature: float = 1.0

class GenerateResponse(BaseModel):
    output: str
    model: str

@app.on_event("startup")
async def load_model():
    global model, tokenizer
    base = AutoModelForCausalLM.from_pretrained(
        MODEL_PATH,
        torch_dtype=torch.float32,
        device_map={"": "cpu"},
        trust_remote_code=True,
    )
    tokenizer = AutoTokenizer.from_pretrained(MODEL_PATH, trust_remote_code=True)
    model = PeftModel.from_pretrained(base, LORA_PATH)
    print(f"[underdog] Model loaded: {MODEL_PATH} + {LORA_PATH}")

@app.get("/health")
def health():
    return {"status": "ok", "model": MODEL_PATH}

@app.post("/generate", response_model=GenerateResponse)
def generate(req: GenerateRequest):
    if model is None:
        raise HTTPException(503, "Model not loaded")
    inputs = tokenizer(req.prompt, return_tensors="pt")
    with torch.no_grad():
        outputs = model.generate(
            **inputs,
            max_new_tokens=req.max_tokens,
            temperature=req.temperature,
            do_sample=req.temperature > 0,
        )
    output = tokenizer.decode(outputs[0], skip_special_tokens=True)
    return GenerateResponse(output=output[len(req.prompt):], model=MODEL_PATH)

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=PORT)
