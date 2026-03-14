import os
from pathlib import Path

BASE_DIR = Path(__file__).parent
DATA_PATH = BASE_DIR.parent / "data" / "companies.jsonl"

EMBEDDING_MODEL = "all-MiniLM-L6-v2"
RAG_TOP_K      = 50   # candidates FAISS retrieves before LLM scoring
FINAL_TOP_N    = 20   # results returned to frontend

# Featherless.ai — OpenAI-compatible endpoint
FEATHERLESS_API_KEY  = os.getenv("FEATHERLESS_API_KEY",  "rc_325b6b935d2c5312f46f22827e11775ad6d58fc03922fdd9c11613a843435520")
FEATHERLESS_BASE_URL = os.getenv("FEATHERLESS_BASE_URL", "https://api.featherless.ai/v1")

# 8B model: ~10× faster than 72B, good instruction-following
LLM_RERANK_MODEL = os.getenv("LLM_RERANK_MODEL", "meta-llama/Meta-Llama-3.1-8B-Instruct")

# 50 candidates / 10 per batch = 5 parallel LLM calls (~3s wall time)
LLM_BATCH_SIZE = 10
