"""
Filter 3 — LLM Batch Reranker

Sends companies in batches to Llama-3.3-70B on featherless.ai and asks it
to score each company against the extracted criteria. Returns a DataFrame
with a 'llm_score' column (0–N where N = number of criteria) and a
'match_reasons' column.

Each API call processes LLM_BATCH_SIZE companies at once (default 10),
keeping cost manageable.
"""

import json
import re
from openai import OpenAI
import pandas as pd

from config import FEATHERLESS_API_KEY, FEATHERLESS_BASE_URL, LLM_BATCH_SIZE, LLM_RERANK_MODEL


RERANK_SYSTEM = """You are an expert business analyst evaluating whether companies match a search query.

You will receive:
1. The original user query
2. A list of criteria derived from that query
3. A batch of company profiles

For EACH company, evaluate EACH criterion independently and return a JSON array.

Return ONLY a JSON array with one object per company (same order as input):
[
  {
    "id": <index>,
    "scores": {<criterion>: true/false, ...},
    "total": <sum of true values>,
    "reason": "<one-line explanation>"
  },
  ...
]

Be strict: only mark a criterion true if there is clear evidence in the profile.
Missing data should generally be treated as unknown (false), not assumed true.
"""


def _build_company_summary(row: pd.Series) -> str:
    """Build a compact company summary for the LLM prompt."""
    lines = []
    if pd.notna(row.get("operational_name")):
        lines.append(f"Name: {row['operational_name']}")
    if pd.notna(row.get("description")):
        lines.append(f"Description: {row['description'][:400]}")

    naics = row.get("primary_naics")
    if isinstance(naics, dict):
        lines.append(f"Industry: {naics.get('label', '')}")

    for field in ("business_model", "core_offerings", "target_markets"):
        val = row.get(field)
        if isinstance(val, list) and val:
            lines.append(f"{field.replace('_', ' ').title()}: {', '.join(str(v) for v in val[:8])}")

    addr = row.get("address")
    if isinstance(addr, dict):
        country = addr.get("country_code", "").upper()
        town = addr.get("town", "")
        if country or town:
            lines.append(f"Location: {town}, {country}".strip(", "))

    for field in ("employee_count", "revenue", "year_founded", "is_public"):
        val = row.get(field)
        if pd.notna(val):
            lines.append(f"{field.replace('_', ' ').title()}: {val}")

    return "\n".join(lines)


def _score_batch(
    client: OpenAI,
    batch_rows: list[tuple[int, pd.Series]],
    query: str,
    criteria: list[str],
) -> list[dict]:
    """Score one batch of companies. Returns list of score objects."""
    companies_text = "\n\n---\n\n".join(
        f"Company #{i}:\n{_build_company_summary(row)}"
        for i, (_, row) in enumerate(batch_rows)
    )

    criteria_text = "\n".join(f"- {c}" for c in criteria)

    user_message = f"""Query: {query}

Criteria:
{criteria_text}

Companies to evaluate:
{companies_text}
"""

    response = client.chat.completions.create(
        model=LLM_RERANK_MODEL,
        max_tokens=1024,
        messages=[
            {"role": "system", "content": RERANK_SYSTEM},
            {"role": "user", "content": user_message},
        ],
    )

    raw = response.choices[0].message.content.strip()

    # Extract JSON array even if wrapped in markdown
    match = re.search(r"\[.*\]", raw, re.DOTALL)
    if not match:
        # Fallback: all zeros
        return [{"id": i, "scores": {}, "total": 0, "reason": "parse error"} for i in range(len(batch_rows))]

    return json.loads(match.group())


def llm_rerank(df: pd.DataFrame, intent: dict) -> pd.DataFrame:
    """
    Score all companies in df using LLM batch evaluation.
    Adds 'llm_score' and 'match_reasons' columns.
    Returns df sorted by llm_score descending.
    """
    criteria = intent.get("criteria", [])
    query = intent.get("original_query", intent.get("semantic_query", ""))

    if not criteria:
        # No criteria to evaluate — keep embedding order
        df = df.copy()
        df["llm_score"] = 0
        df["match_reasons"] = ""
        return df

    client = OpenAI(api_key=FEATHERLESS_API_KEY, base_url=FEATHERLESS_BASE_URL)

    rows = list(df.iterrows())  # list of (index, Series)
    all_results: dict[int, dict] = {}

    for batch_start in range(0, len(rows), LLM_BATCH_SIZE):
        batch = rows[batch_start: batch_start + LLM_BATCH_SIZE]
        scores = _score_batch(client, batch, query, criteria)

        for local_i, (orig_idx, _) in enumerate(batch):
            if local_i < len(scores):
                all_results[orig_idx] = scores[local_i]
            else:
                all_results[orig_idx] = {"total": 0, "reason": ""}

    result = df.copy()
    result["llm_score"] = result.index.map(lambda i: all_results.get(i, {}).get("total", 0))
    result["match_reasons"] = result.index.map(lambda i: all_results.get(i, {}).get("reason", ""))

    return result.sort_values("llm_score", ascending=False)
