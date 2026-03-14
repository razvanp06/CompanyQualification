"""
Filter 2 — FAISS Semantic Search (no API call, instant)

Pre-built FAISS index is searched at query time — runs in microseconds.
Scores are cosine similarity between query embedding and company embeddings.
"""

import pandas as pd

from langchain_community.vectorstores import FAISS
from langchain_community.embeddings import HuggingFaceEmbeddings
from langchain_core.documents import Document

from config import EMBEDDING_MODEL, RAG_TOP_K


_embeddings: HuggingFaceEmbeddings | None = None
_vector_store: FAISS | None = None
_total_companies: int = 0


def _get_embeddings() -> HuggingFaceEmbeddings:
    global _embeddings
    if _embeddings is None:
        _embeddings = HuggingFaceEmbeddings(model_name=EMBEDDING_MODEL)
    return _embeddings


def build_global_index(df: pd.DataFrame) -> None:
    """Build the FAISS index from the full dataset. Called once at startup."""
    global _vector_store, _total_companies
    print(f"[RAG Filter] Building global FAISS index for {len(df)} companies…")
    embeddings = _get_embeddings()
    docs = [
        Document(
            page_content=_build_company_text(row),
            metadata={"df_index": idx},
        )
        for idx, row in df.iterrows()
    ]
    _vector_store = FAISS.from_documents(docs, embeddings)
    _total_companies = len(df)
    print(f"[RAG Filter] Global FAISS index ready ({_total_companies} companies)")


def _build_company_text(row: pd.Series) -> str:
    """Build searchable text profile for a company."""
    parts = []

    if pd.notna(row.get("operational_name")):
        parts.append(str(row["operational_name"]))

    if pd.notna(row.get("description")):
        parts.append(str(row["description"]))

    naics = row.get("primary_naics")
    if isinstance(naics, dict):
        parts.append(naics.get("label", ""))

    for field in ("business_model", "core_offerings", "target_markets"):
        val = row.get(field)
        if isinstance(val, list):
            parts.append(" ".join(str(v) for v in val))
        elif isinstance(val, str):
            parts.append(val)

    return " ".join(p for p in parts if p).strip()


def rag_rank(df: pd.DataFrame, intent: dict) -> pd.DataFrame:
    """
    FAISS semantic search — instant, no API calls.

    Searches the pre-built global index, keeps top RAG_TOP_K companies
    from those that passed Filter 1, ranked by cosine similarity.
    """
    semantic_query = intent.get("semantic_query") or intent.get("original_query", "")

    if df.empty:
        df = df.copy()
        df["embedding_score"] = 0.0
        df["rag_score"] = 0
        df["match_reasons"] = ""
        return df

    global _vector_store
    if _vector_store is None:
        build_global_index(df)

    filtered_indices = set(df.index.tolist())

    all_retrieved = _vector_store.similarity_search_with_score(
        semantic_query, k=_total_companies or len(df)
    )

    retrieved_indices = []
    embedding_scores: dict[int, float] = {}
    for doc, l2_dist in all_retrieved:
        idx = doc.metadata["df_index"]
        if idx not in filtered_indices:
            continue
        cosine_sim = max(0.0, 1.0 - (float(l2_dist) ** 2) / 2.0)
        retrieved_indices.append(idx)
        embedding_scores[idx] = cosine_sim
        if len(retrieved_indices) >= RAG_TOP_K:
            break

    seen: set[int] = set()
    unique_indices = [i for i in retrieved_indices if not (i in seen or seen.add(i))]
    candidates = df.loc[unique_indices].copy()
    candidates["embedding_score"] = candidates.index.map(embedding_scores)
    candidates["rag_score"] = candidates["embedding_score"]
    candidates["match_reasons"] = ""
    print(f"[RAG Filter] Retrieved {len(candidates)} candidates via FAISS")

    return candidates
