"""
Filter 2 — FAISS Semantic Retrieval + Parallel LLM Scoring

Step A (instant):  Pre-built FAISS index → top-40 candidates by cosine similarity
Step B (~3-4 s):   3 parallel LLM batches score every candidate 0-10 via Llama-3.1-8B

Final score passed to qualify.py:
    30% × cosine_similarity  +  70% × (llm_score / 10)

This gives a smooth 0-100 gradient instead of binary 100/0.
"""

import re
import pandas as pd
from concurrent.futures import ThreadPoolExecutor, as_completed

from langchain_community.vectorstores import FAISS
from langchain_community.embeddings import HuggingFaceEmbeddings
from langchain_core.documents import Document
import openai

from config import (
    EMBEDDING_MODEL, RAG_TOP_K,
    FEATHERLESS_API_KEY, FEATHERLESS_BASE_URL,
    LLM_RERANK_MODEL, LLM_BATCH_SIZE,
)

# ── module-level singletons ────────────────────────────────────────────────────
_embeddings:   HuggingFaceEmbeddings | None = None
_vector_store: FAISS | None = None
_llm_client:   openai.OpenAI | None = None
_total_companies: int = 0


def _get_embeddings() -> HuggingFaceEmbeddings:
    global _embeddings
    if _embeddings is None:
        _embeddings = HuggingFaceEmbeddings(model_name=EMBEDDING_MODEL)
    return _embeddings


def _get_llm() -> openai.OpenAI:
    global _llm_client
    if _llm_client is None:
        _llm_client = openai.OpenAI(
            api_key=FEATHERLESS_API_KEY,
            base_url=FEATHERLESS_BASE_URL,
        )
    return _llm_client


# ── FAISS index (built once at startup) ───────────────────────────────────────

def build_global_index(df: pd.DataFrame) -> None:
    """Build the FAISS vector store from the full dataset. Called once at startup."""
    global _vector_store, _total_companies
    print(f"[RAG Filter] Building global FAISS index for {len(df)} companies…")
    docs = [
        Document(
            page_content=_build_company_text(row),
            metadata={"df_index": idx},
        )
        for idx, row in df.iterrows()
    ]
    _vector_store = FAISS.from_documents(docs, _get_embeddings())
    _total_companies = len(df)
    print(f"[RAG Filter] Global FAISS index ready ({_total_companies} companies)")


def _build_company_text(row: pd.Series) -> str:
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


# ── LLM scoring ───────────────────────────────────────────────────────────────

def _score_batch(
    companies: list[tuple[int, pd.Series]],
    query: str,
    criteria: list[str],
) -> dict[int, tuple[float, str]]:
    """
    Ask the LLM to rate each company 0-10.
    Minimal output format (scores array only) keeps token count tiny → fast.
    Returns {df_index: (score, reason)}.
    """
    def _company_line(i: int, row: pd.Series) -> str:
        name = row.get("operational_name", "Unknown")
        naics = row.get("primary_naics")
        industry = naics.get("label", "") if isinstance(naics, dict) else ""
        desc = str(row.get("description", ""))[:200]
        line = f"[{i + 1}] {name}"
        if industry:
            line += f" ({industry})"
        line += f": {desc}"
        return line

    companies_text = "\n".join(
        _company_line(i, row) for i, (_, row) in enumerate(companies)
    )
    criteria_text = "; ".join(criteria)

    prompt = (
        f"You are a strict company qualifier. Rate each company 0-10 based on how well "
        f"its PRIMARY business matches the query. Rules:\n"
        f"- 8-10: core business directly matches\n"
        f"- 4-7: partial or indirect match\n"
        f"- 0-3: unrelated, or only a side activity\n\n"
        f"Query: \"{query}\"\n"
        f"Criteria: {criteria_text}\n\n"
        f"{companies_text}\n\n"
        f"Reply with ONLY this format, one per line: id:score\n"
        f"Example:\n1:8\n2:0\n3:9\n..."
    )

    try:
        resp = _get_llm().chat.completions.create(
            model=LLM_RERANK_MODEL,
            messages=[{"role": "user", "content": prompt}],
            temperature=0,
            max_tokens=len(companies) * 6 + 10,
        )
        raw = resp.choices[0].message.content.strip()
        # Parse "id:score" lines — robust to extra whitespace or markdown
        scores_map: dict[int, float] = {}
        for line in raw.splitlines():
            m = re.match(r"^\s*(\d+)\s*:\s*(\d+(?:\.\d+)?)", line)
            if m:
                scores_map[int(m.group(1))] = float(m.group(2))
    except Exception as e:
        print(f"[RAG Filter] LLM batch error: {e}")
        scores_map = {}

    result: dict[int, tuple[float, str]] = {}
    for i, (idx, row) in enumerate(companies):
        score = scores_map.get(i + 1, 0.0)
        result[idx] = (min(10.0, max(0.0, score)), "")

    return result


# ── main public function ───────────────────────────────────────────────────────

def rag_rank(df: pd.DataFrame, intent: dict) -> pd.DataFrame:
    """
    1. FAISS retrieves top RAG_TOP_K candidates by semantic similarity (instant).
    2. LLM scores all candidates in parallel batches (~3-4 s).
    Returns DataFrame with columns: embedding_score, rag_score, match_reasons.
    """
    semantic_query = intent.get("semantic_query") or intent.get("original_query", "")
    criteria = intent.get("criteria") or [f"relevant to: {semantic_query}"]

    if df.empty:
        out = df.copy()
        out["embedding_score"] = 0.0
        out["rag_score"] = 0.0
        out["match_reasons"] = ""
        return out

    global _vector_store
    if _vector_store is None:
        build_global_index(df)

    # ── Step A: FAISS retrieval ────────────────────────────────────────────────
    filtered_indices = set(df.index.tolist())
    all_retrieved = _vector_store.similarity_search_with_score(
        semantic_query, k=_total_companies or len(df)
    )

    retrieved: list[int] = []
    emb_scores: dict[int, float] = {}
    for doc, l2_dist in all_retrieved:
        idx = doc.metadata["df_index"]
        if idx not in filtered_indices:
            continue
        # Convert L2 distance → cosine similarity (valid for normalized vectors)
        emb_scores[idx] = max(0.0, 1.0 - (float(l2_dist) ** 2) / 2.0)
        retrieved.append(idx)
        if len(retrieved) >= RAG_TOP_K:
            break

    if not retrieved:
        out = df.copy()
        out["embedding_score"] = 0.0
        out["rag_score"] = 0.0
        out["match_reasons"] = ""
        return out

    candidates = df.loc[retrieved].copy()
    candidates["embedding_score"] = candidates.index.map(emb_scores)
    print(f"[RAG Filter] {len(candidates)} candidates via FAISS → LLM scoring…")

    # ── Step B: parallel LLM scoring ──────────────────────────────────────────
    rows = [(idx, row) for idx, row in candidates.iterrows()]
    batches = [rows[i: i + LLM_BATCH_SIZE] for i in range(0, len(rows), LLM_BATCH_SIZE)]
    print(f"[RAG Filter] {len(batches)} parallel batches × {LLM_RERANK_MODEL}")

    llm_scores: dict[int, tuple[float, str]] = {}
    with ThreadPoolExecutor(max_workers=len(batches)) as executor:
        futures = {
            executor.submit(_score_batch, batch, semantic_query, criteria): batch
            for batch in batches
        }
        for future in as_completed(futures):
            llm_scores.update(future.result())

    candidates["rag_score"]     = candidates.index.map(lambda i: llm_scores.get(i, (0.0, ""))[0])
    candidates["match_reasons"] = candidates.index.map(lambda i: llm_scores.get(i, (0.0, ""))[1])
    print("[RAG Filter] LLM scoring complete")

    return candidates
