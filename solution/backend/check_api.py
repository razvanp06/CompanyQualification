import sys, os
sys.path.insert(0, os.path.dirname(__file__))

from openai import OpenAI
from config import FEATHERLESS_API_KEY, FEATHERLESS_BASE_URL, LLM_INTENT_MODEL, LLM_RERANK_MODEL

client = OpenAI(api_key=FEATHERLESS_API_KEY, base_url=FEATHERLESS_BASE_URL)

for model in [LLM_INTENT_MODEL, LLM_RERANK_MODEL]:
    try:
        resp = client.chat.completions.create(
            model=model,
            max_tokens=10,
            messages=[{"role": "user", "content": "Say OK"}],
        )
        print(f"OK     {model}")
    except Exception as e:
        print(f"FAILED {model} -> {e}")
