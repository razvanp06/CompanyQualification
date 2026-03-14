"""
Filter 2 — Embedding Similarity (Cosine)

Builds a text profile for each company from its textual fields,
embeds both query and profiles with a local sentence-transformer,
and returns the top-K most similar companies.

Key note: we embed the *semantic_query* extracted by the intent extractor,
NOT the raw user query. This avoids the classic failure mode where a query
like "packaging suppliers for cosmetics brands" retrieves cosmetics companies
because the word "cosmetics" dominates similarity.
"""

import numpy as np
import pandas as pd
from sentence_transformers import SentenceTransformer

from config import EMBEDDING_MODEL, EMBEDDING_TOP_K

# Load model once at import time (cached after first load)
_model: SentenceTransformer | None = None


def _get_model() -> SentenceTransformer:
    global _model
    if _model is None:
        _model = SentenceTransformer(EMBEDDING_MODEL)
    return _model


def _build_company_text(row: pd.Series) -> str:
    """Concatenate all meaningful text fields into a single string."""
    parts = []

    if pd.notna(row.get("operational_name")):
        parts.append(str(row["operational_name"]))

    if pd.notna(row.get("description")):
        parts.append(str(row["description"]))

    # primary_naics can be a dict or stringified dict
    naics = row.get("primary_naics")
    if naics and isinstance(naics, dict):
        parts.append(naics.get("label", ""))
    elif naics and isinstance(naics, str) and "label" in naics:
        import ast
        try:
            d = ast.literal_eval(naics)
            parts.append(d.get("label", ""))
        except Exception:
            pass

    for field in ("business_model", "core_offerings", "target_markets"):
        val = row.get(field)
        if isinstance(val, list):
            parts.append(" ".join(str(v) for v in val))
        elif isinstance(val, str):
            parts.append(val)

    return " ".join(p for p in parts if p).strip()


def embed_and_rank(df: pd.DataFrame, semantic_query: str, top_k: int = EMBEDDING_TOP_K) -> pd.DataFrame:
    """
    Embed company profiles and the query; return top_k by cosine similarity.
    Adds a 'embedding_score' column to the returned DataFrame.
    """
    model = _get_model()

    # Build text profiles
    texts = df.apply(_build_company_text, axis=1).tolist()

    # Embed everything in one batch (fast on CPU for <500 companies)
    query_vec = model.encode([semantic_query], normalize_embeddings=True)[0]
    company_vecs = model.encode(texts, normalize_embeddings=True, batch_size=64, show_progress_bar=False)

    # Cosine similarity = dot product when vectors are L2-normalized
    scores = company_vecs @ query_vec

    result = df.copy()
    result["embedding_score"] = scores

    # Return top_k sorted by score
    result = result.sort_values("embedding_score", ascending=False)
    if top_k and top_k < len(result):
        result = result.head(top_k)

    return result
