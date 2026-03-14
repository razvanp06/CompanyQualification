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
Given a user query, extract structured constraints and return ONLY valid JSON.

Return this exact schema (use null for unspecified fields):
{
  "result_count": <integer or null>,      // how many companies the user wants (null = return all matches)
  "countries": <list of ISO-2 country codes or null>,  // e.g. ["de","fr"] - null means any country
  "min_employees": <integer or null>,
  "max_employees": <integer or null>,
  "min_revenue": <number or null>,        // in USD
  "max_revenue": <number or null>,        // in USD
  "min_year_founded": <integer or null>,
  "max_year_founded": <integer or null>,
  "is_public": <true/false or null>,
  "business_models": <list of strings or null>,  // e.g. ["B2B","SaaS"]
  "semantic_query": "<string>",           // cleaned query optimised for embedding search
  "criteria": [                           // list of discrete criteria the company must satisfy
    "<criterion 1>",
    "<criterion 2>"
  ]
}

Country code mapping examples: Germany=de, France=fr, Romania=ro, Switzerland=ch,
United States=us, Sweden=se, Norway=no, Denmark=dk, Finland=fi.
"Scandinavia" -> ["se","no","dk"]. "Europe" -> null (too broad to enumerate).

Revenue interpretation: "$50 million" -> 50000000. "over" / "more than" -> min only.

Criteria should be short, concrete, and independently verifiable:
- Good: "operates in logistics sector", "founded after 2018", "provides HR software"
- Bad: "is a good company", "matches the query"
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
