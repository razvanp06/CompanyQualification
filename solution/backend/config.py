import os
from pathlib import Path

# Paths
BASE_DIR = Path(__file__).parent
DATA_PATH = BASE_DIR.parent / "data" / "companies.jsonl"

# Featherless.ai — OpenAI-compatible API
FEATHERLESS_API_KEY = os.getenv("FEATHERLESS_API_KEY", "rc_325b6b935d2c5312f46f22827e11775ad6d58fc03922fdd9c11613a843435520")
FEATHERLESS_BASE_URL = "https://api.featherless.ai/v1"

# Models on featherless.ai (HuggingFace model IDs)
# Fast 8B model for intent extraction — cheap and quick
LLM_INTENT_MODEL = "meta-llama/Meta-Llama-3.1-8B-Instruct"
# Reranking model — use same 8B model if 70B is not available on your plan
LLM_RERANK_MODEL = "meta-llama/Meta-Llama-3.1-8B-Instruct"

# Pipeline settings
EMBEDDING_MODEL = "all-MiniLM-L6-v2"   # local, free, fast
EMBEDDING_TOP_K = 80                    # candidates kept after embedding filter
LLM_BATCH_SIZE = 10                     # companies per LLM reranking call

# Scoring
STRUCTURED_FILTER_KEEPS = 200   # max companies kept after pandas filter (0 = disabled)
FINAL_TOP_N = 20                # default result size returned to user
