"""
Filter 0 — Intent Extraction

Uses Llama-3.1-8B on featherless.ai to parse the user query into:
- Structured constraints (country, employees, revenue, year, is_public)
- Result count preference
- Semantic query string for embedding
- Criteria list for LLM reranking
"""

import json
import re
from openai import OpenAI
from config import FEATHERLESS_API_KEY, FEATHERLESS_BASE_URL, LLM_INTENT_MODEL


SYSTEM_PROMPT = """You are a query parser for a company search system.
The user query may be in any language. Understand it regardless of language, then extract structured constraints and return ONLY valid JSON — no extra text, no explanations, no lists.

Return this exact schema (use null for unspecified fields):
{
  "result_count": <integer or null>,
  "countries": <list of ISO-2 country codes or null>,
  "min_employees": <integer or null>,
  "max_employees": <integer or null>,
  "min_revenue": <number or null>,
  "max_revenue": <number or null>,
  "min_year_founded": <integer or null>,
  "max_year_founded": <integer or null>,
  "is_public": <true/false or null>,
  "business_models": <list of strings or null>,
  "semantic_query": "<English description of what kind of companies to find>",
  "criteria": ["<criterion in English 1>", "<criterion in English 2>"]
}

Country code mapping: Germany=de, France=fr, Romania=ro, Switzerland=ch,
United States=us, Sweden=se, Norway=no, Denmark=dk, Finland=fi.
"Scandinavia" -> ["se","no","dk"]. "Europe" -> null.

Revenue: "$50 million" -> 50000000. "over/more than" -> min only.

semantic_query and criteria MUST always be in English.
Criteria must be short and independently verifiable:
- Good: "operates in oil and gas sector", "founded after 2018"
- Bad: "is a good company", "petroliere"
"""


def extract_intent(query: str) -> dict:
    """Call Llama-3.1-8B on featherless.ai to extract structured intent from user query."""
    client = OpenAI(api_key=FEATHERLESS_API_KEY, base_url=FEATHERLESS_BASE_URL)

    response = client.chat.completions.create(
        model=LLM_INTENT_MODEL,
        max_tokens=512,
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": f"Query: {query}"},
        ],
    )

    raw = response.choices[0].message.content.strip()

    # Extract JSON even if the model wraps it in markdown
    match = re.search(r"\{.*\}", raw, re.DOTALL)
    if not match:
        raise ValueError(f"Intent extractor returned non-JSON: {raw}")

    intent = json.loads(match.group())
    intent["original_query"] = query
    return intent
