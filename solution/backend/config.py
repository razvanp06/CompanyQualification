import os
from pathlib import Path

# Paths
BASE_DIR = Path(__file__).parent
DATA_PATH = BASE_DIR.parent / "data" / "companies.jsonl"

# Featherless.ai — OpenAI-compatible API hosting HuggingFace models
FEATHERLESS_API_KEY = os.getenv("FEATHERLESS_API_KEY", "rc_325b6b935d2c5312f46f22827e11775ad6d58fc03922fdd9c11613a843435520")
FEATHERLESS_BASE_URL = "https://api.featherless.ai/v1"

# Filter 0 — intent extraction (fast 8B model, cheap)
LLM_INTENT_MODEL = "meta-llama/Meta-Llama-3.1-8B-Instruct"

# Filter 2 — LangChain RAG pipeline
# Retrieval: local sentence-transformer embeddings + FAISS vector store
EMBEDDING_MODEL = "all-MiniLM-L6-v2"   # local, free, fast
RAG_TOP_K = 40                          # top companies retrieved before LLM scoring

# Scoring: same 8B model as intent extraction — fast, proven to work, ~10x faster than 72B
LLM_RERANK_MODEL = "meta-llama/Meta-Llama-3.1-8B-Instruct"
LLM_BATCH_SIZE = 20                     # 40 candidates / 20 per batch = 2 parallel calls

# Scoring
STRUCTURED_FILTER_KEEPS = 200   # max companies kept after pandas filter (0 = disabled)
FINAL_TOP_N = 20                # default result size returned to user
