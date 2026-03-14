"""
Main pipeline orchestrator.

Runs the full qualification pipeline:
  Filter 0: Intent extraction (Claude haiku)
  Filter 1: Structured pandas filter
  Filter 2: Embedding similarity (sentence-transformers)
  Filter 3: LLM batch reranker (Claude haiku)

Returns a ranked list of matching companies.
"""

import pandas as pd

from pipeline.intent_extractor import extract_intent
from pipeline.structured_filter import apply_structured_filter
from pipeline.embedding_filter import embed_and_rank
from pipeline.llm_reranker import llm_rerank
from config import EMBEDDING_TOP_K, FINAL_TOP_N, DATA_PATH


# Load dataset once at module level
_df: pd.DataFrame | None = None


def _load_data() -> pd.DataFrame:
    global _df
    if _df is None:
        _df = pd.read_json(DATA_PATH, lines=True)
        # Parse address dicts stored as strings
        import ast
        def safe_parse(val):
            if isinstance(val, dict):
                return val
            if isinstance(val, str):
                try:
                    return ast.literal_eval(val)
                except Exception:
                    return {"raw": val}
            return {}
        _df["address"] = _df["address"].apply(safe_parse)

        # Parse naics fields similarly
        def safe_parse_naics(val):
            if isinstance(val, dict):
                return val
            if isinstance(val, str):
                try:
                    return ast.literal_eval(val)
                except Exception:
                    return {}
            return val
        _df["primary_naics"] = _df["primary_naics"].apply(safe_parse_naics)
    return _df


def qualify(query: str, top_n: int = FINAL_TOP_N) -> dict:
    """
    Full qualification pipeline.

    Returns:
        {
            "query": str,
            "intent": dict,           # extracted structured intent
            "total_candidates": int,  # companies in dataset
            "after_filter1": int,     # after structured filter
            "after_filter2": int,     # after embedding filter
            "results": [              # final ranked companies
                {
                    "rank": int,
                    "operational_name": str,
                    "website": str,
                    "address": dict,
                    "embedding_score": float,
                    "llm_score": int,
                    "match_reasons": str,
                    ...
                }
            ]
        }
    """
    df = _load_data()

    # ── Filter 0: extract intent ───────────────────────────────────────────
    intent = extract_intent(query)
    print(f"[Filter 0] Intent: {intent}")

    # ── Filter 1: structured pandas filters ───────────────────────────────
    filtered = apply_structured_filter(df, intent)
    after_f1 = len(filtered)
    print(f"[Filter 1] {len(df)} -> {after_f1} companies after structured filter")

    # ── Filter 2: embedding similarity ────────────────────────────────────
    semantic_query = intent.get("semantic_query") or query
    top_k = min(EMBEDDING_TOP_K, after_f1)
    embedded = embed_and_rank(filtered, semantic_query, top_k=top_k)
    after_f2 = len(embedded)
    print(f"[Filter 2] {after_f1} -> {after_f2} companies after embedding filter")

    # ── Filter 3: LLM batch reranker ──────────────────────────────────────
    reranked = llm_rerank(embedded, intent)
    print(f"[Filter 3] Scored {after_f2} companies with LLM")

    # ── Final ranking: combine scores ─────────────────────────────────────
    # Normalize embedding score to [0, 1] then weight: 40% embedding + 60% LLM
    max_llm = reranked["llm_score"].max() or 1
    reranked["final_score"] = (
        0.4 * reranked["embedding_score"]
        + 0.6 * (reranked["llm_score"] / max_llm)
    )
    reranked = reranked.sort_values("final_score", ascending=False)

    # Respect result_count from intent if specified
    result_count = intent.get("result_count") or top_n
    result_count = min(result_count, top_n, len(reranked))

    # Build output
    output_cols = [
        "operational_name", "website", "address", "year_founded",
        "employee_count", "revenue", "is_public",
        "primary_naics", "description", "business_model",
        "core_offerings", "target_markets",
        "embedding_score", "llm_score", "match_reasons", "final_score",
    ]
    output_cols = [c for c in output_cols if c in reranked.columns]

    import math

    def _clean(val):
        """Convert numpy scalars and NaN to JSON-safe Python types."""
        if hasattr(val, "item"):
            val = val.item()
        if isinstance(val, float) and math.isnan(val):
            return None
        return val

    results = []
    for rank, (_, row) in enumerate(reranked.head(result_count).iterrows(), start=1):
        entry = {"rank": rank}
        for col in output_cols:
            entry[col] = _clean(row.get(col))
        results.append(entry)

    return {
        "query": query,
        "intent": intent,
        "total_candidates": len(df),
        "after_filter1": after_f1,
        "after_filter2": after_f2,
        "results": results,
    }
