"""
Perplexity AI Filter — replaces Filter 2 (embedding) + Filter 3 (LLM reranker).

Sends companies in batches to Perplexity's sonar-pro model which:
  - Deeply reasons about each company's fit against the query criteria
  - Can supplement local profile data with up-to-date web knowledge about companies

Only companies that pass Filter 1 (structured) are sent here.
Input is capped at PERPLEXITY_TOP_K companies to control API cost.

Returns a DataFrame with 'perplexity_score' and 'match_reasons' columns,
sorted by perplexity_score descending.
"""

import json
import re
from openai import OpenAI
import pandas as pd

from config import (
    PERPLEXITY_API_KEY,
    PERPLEXITY_BASE_URL,
    PERPLEXITY_MODEL,
    LLM_BATCH_SIZE,
    PERPLEXITY_TOP_K,
)


PERPLEXITY_SYSTEM = """You are an expert business analyst evaluating whether companies match a search query.

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

Be strict: only mark a criterion true if there is clear evidence in the profile or your knowledge.
Missing data should generally be treated as unknown (false), not assumed true.
You may use your knowledge of the company (website, industry reputation, etc.) to supplement the provided profile.
"""


def _build_company_summary(row: pd.Series) -> str:
    """Build a compact company summary for the Perplexity prompt."""
    lines = []

    if pd.notna(row.get("operational_name")):
        lines.append(f"Name: {row['operational_name']}")

    if pd.notna(row.get("website")):
        lines.append(f"Website: {row['website']}")

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
            lines.append(f"Location: {', '.join(p for p in [town, country] if p)}")

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
    """Score one batch of companies using Perplexity. Returns list of score objects."""
    companies_text = "\n\n---\n\n".join(
        f"Company #{i}:\n{_build_company_summary(row)}"
        for i, (_, row) in enumerate(batch_rows)
    )

    criteria_text = (
        "\n".join(f"- {c}" for c in criteria)
        if criteria
        else "- General relevance and fit to the query"
    )

    user_message = f"""Query: {query}

Criteria:
{criteria_text}

Companies to evaluate:
{companies_text}"""

    response = client.chat.completions.create(
        model=PERPLEXITY_MODEL,
        max_tokens=1024,
        messages=[
            {"role": "system", "content": PERPLEXITY_SYSTEM},
            {"role": "user", "content": user_message},
        ],
    )

    raw = response.choices[0].message.content.strip()

    # Extract JSON array even if wrapped in markdown
    match = re.search(r"\[.*\]", raw, re.DOTALL)
    if not match:
        print(f"[Perplexity] WARNING: no JSON array in response, skipping batch")
        return [{"id": i, "scores": {}, "total": 0, "reason": "parse error"} for i in range(len(batch_rows))]

    try:
        return json.loads(match.group())
    except json.JSONDecodeError as e:
        print(f"[Perplexity] WARNING: JSON decode error: {e}, skipping batch")
        return [{"id": i, "scores": {}, "total": 0, "reason": "parse error"} for i in range(len(batch_rows))]


def perplexity_rank(df: pd.DataFrame, intent: dict) -> pd.DataFrame:
    """
    Score companies using Perplexity AI.
    Replaces both the embedding filter (Filter 2) and LLM reranker (Filter 3).

    - Caps input at PERPLEXITY_TOP_K companies to control cost.
    - Adds 'perplexity_score' and 'match_reasons' columns.
    - Returns df sorted by perplexity_score descending.
    """
    query = intent.get("original_query") or intent.get("semantic_query", "")
    criteria = intent.get("criteria", [])

    if not PERPLEXITY_API_KEY:
        raise ValueError(
            "PERPLEXITY_API_KEY is not set. "
            "Get a key at https://www.perplexity.ai/settings/api and set it as an environment variable."
        )

    # Cap candidates to control API cost
    if len(df) > PERPLEXITY_TOP_K:
        df = df.head(PERPLEXITY_TOP_K)

    if not criteria:
        df = df.copy()
        df["perplexity_score"] = 0
        df["match_reasons"] = ""
        return df

    client = OpenAI(api_key=PERPLEXITY_API_KEY, base_url=PERPLEXITY_BASE_URL)

    rows = list(df.iterrows())
    all_results: dict[int, dict] = {}
    total_batches = (len(rows) + LLM_BATCH_SIZE - 1) // LLM_BATCH_SIZE

    for batch_start in range(0, len(rows), LLM_BATCH_SIZE):
        batch = rows[batch_start: batch_start + LLM_BATCH_SIZE]
        batch_num = batch_start // LLM_BATCH_SIZE + 1
        print(f"[Perplexity] Batch {batch_num}/{total_batches} ({len(batch)} companies)…")
        scores = _score_batch(client, batch, query, criteria)

        for local_i, (orig_idx, _) in enumerate(batch):
            if local_i < len(scores):
                all_results[orig_idx] = scores[local_i]
            else:
                all_results[orig_idx] = {"total": 0, "reason": ""}

    result = df.copy()
    result["perplexity_score"] = result.index.map(
        lambda i: all_results.get(i, {}).get("total", 0)
    )
    result["match_reasons"] = result.index.map(
        lambda i: all_results.get(i, {}).get("reason", "")
    )

    return result.sort_values("perplexity_score", ascending=False)
