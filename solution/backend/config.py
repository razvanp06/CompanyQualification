import os
from pathlib import Path

BASE_DIR = Path(__file__).parent
DATA_PATH = BASE_DIR.parent / "data" / "companies.jsonl"

EMBEDDING_MODEL = "all-MiniLM-L6-v2"
RAG_TOP_K = 20         # top 20 companii din FAISS
FINAL_TOP_N = 20
