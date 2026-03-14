"""
Main pipeline orchestrator.

Runs the full qualification pipeline:
  Filter 0: Intent extraction (Llama-3.1-8B via featherless.ai)
  Filter 1: Structured pandas filter (employee count, country, revenue, etc.)
  Filter 2: LangChain RAG — FAISS retrieval + Qwen2.5-72B scoring

Returns a ranked list of matching companies.
"""

import pandas as pd

from pipeline.intent_extractor import extract_intent
from pipeline.structured_filter import apply_structured_filter
from pipeline.rag_filter import rag_rank
from config import FINAL_TOP_N, DATA_PATH


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
            "intent": dict,             # extracted structured intent
            "total_candidates": int,    # companies in dataset
            "after_filter1": int,       # after structured filter
            "after_filter2": int,       # companies sent to Perplexity
            "results": [                # final ranked companies
                {
                    "rank": int,
                    "operational_name": str,
                    "website": str,
                    "address": dict,
                    "rag_score": int,
                    "match_reasons": str,
                    "final_score": float,
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

    # ── Filter 2: LangChain RAG (FAISS retrieval + Qwen2.5-72B scoring) ────
    print(f"[Filter 2] Running RAG pipeline on {after_f1} companies…")
    reranked = rag_rank(filtered, intent)
    after_f2 = len(reranked)
    print(f"[Filter 2] RAG pipeline complete — {after_f2} companies scored")

    # ── Final ranking: 40% semantic similarity + 60% LLM criteria score ──────
    # This prevents the binary 100/0 problem: even when rag_score clusters
    # companies into a few tiers, embedding_score creates a smooth gradient.
    max_rag = reranked["rag_score"].max() or 1
    reranked["final_score"] = (
        0.4 * reranked["embedding_score"]
        + 0.6 * (reranked["rag_score"] / max_rag)
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
        "embedding_score", "rag_score", "match_reasons", "final_score",
    ]
    output_cols = [c for c in output_cols if c in reranked.columns]

    import math

    def _clean(val):
        """Recursively convert numpy scalars, NaN, and Inf to JSON-safe Python types."""
        if isinstance(val, dict):
            return {k: _clean(v) for k, v in val.items()}
        if isinstance(val, list):
            return [_clean(v) for v in val]
        if hasattr(val, "item"):        # numpy scalar
            val = val.item()
        if isinstance(val, float) and (math.isnan(val) or math.isinf(val)):
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
