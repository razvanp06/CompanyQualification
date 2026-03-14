"""
Filter 2 — LangChain RAG Pipeline

Perplexity's speed comes from two things this module replicates:
  1. Pre-built index  — FAISS is built ONCE at startup from all 477 companies
                        and reused for every query (never rebuilt per-query).
  2. Parallel scoring — all LLM batches are fired concurrently via
                        ThreadPoolExecutor instead of sequentially.

Step A — Retrieval:
    Searches the global FAISS index, filters to companies that passed
    Filter 1 (structured), keeps top RAG_TOP_K by cosine similarity.
    Returns continuous embedding_score [0, 1] per company.

Step B — Parallel Qwen2.5-72B scoring:
    All batches submitted simultaneously. Wall-clock time ≈ one batch's
    latency instead of N × latency.
"""

import json
import re
import pandas as pd
from concurrent.futures import ThreadPoolExecutor, as_completed

from langchain_community.vectorstores import FAISS
from langchain_community.embeddings import HuggingFaceEmbeddings
from langchain_openai import ChatOpenAI
from langchain_core.documents import Document
from langchain_core.messages import HumanMessage, SystemMessage

from config import (
    FEATHERLESS_API_KEY,
    FEATHERLESS_BASE_URL,
    LLM_RERANK_MODEL,
    EMBEDDING_MODEL,
    RAG_TOP_K,
    LLM_BATCH_SIZE,
)


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
Missing data should be treated as unknown (false), not assumed true.
"""

# ── Module-level caches (built once at startup, reused for every query) ───────
_embeddings: HuggingFaceEmbeddings | None = None
_vector_store: FAISS | None = None          # global FAISS index over all companies
_total_companies: int = 0                   # size of the indexed dataset


def _get_embeddings() -> HuggingFaceEmbeddings:
    global _embeddings
    if _embeddings is None:
        _embeddings = HuggingFaceEmbeddings(model_name=EMBEDDING_MODEL)
    return _embeddings


def build_global_index(df: pd.DataFrame) -> None:
    """
    Build the FAISS index from the FULL dataset.
    Called once at startup — never called again per query.
    """
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
    """Build searchable text profile for a company (used for FAISS indexing)."""
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


def _build_company_summary(row: pd.Series) -> str:
    """Build a compact company summary for the LLM scoring prompt."""
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
        parts = [addr.get("town", ""), addr.get("country_code", "").upper()]
        location = ", ".join(p for p in parts if p)
        if location:
            lines.append(f"Location: {location}")

    for field in ("employee_count", "revenue", "year_founded", "is_public"):
        val = row.get(field)
        if pd.notna(val):
            lines.append(f"{field.replace('_', ' ').title()}: {val}")

    return "\n".join(lines)


def _score_batch(
    llm: ChatOpenAI,
    batch_rows: list[tuple[int, pd.Series]],
    query: str,
    criteria: list[str],
) -> list[dict]:
    """Score one batch of companies with Qwen2.5-72B. Returns list of score objects."""
    companies_text = "\n\n---\n\n".join(
        f"Company #{i}:\n{_build_company_summary(row)}"
        for i, (_, row) in enumerate(batch_rows)
    )
    criteria_text = "\n".join(f"- {c}" for c in criteria)

    messages = [
        SystemMessage(content=RERANK_SYSTEM),
        HumanMessage(content=f"Query: {query}\n\nCriteria:\n{criteria_text}\n\nCompanies to evaluate:\n{companies_text}"),
    ]

    response = llm.invoke(messages)
    raw = response.content.strip()

    match = re.search(r"\[.*\]", raw, re.DOTALL)
    if not match:
        print(f"[RAG Filter] WARNING: no JSON array in response, skipping batch")
        return [{"id": i, "scores": {}, "total": 0, "reason": "parse error"} for i in range(len(batch_rows))]

    try:
        return json.loads(match.group())
    except json.JSONDecodeError as e:
        print(f"[RAG Filter] WARNING: JSON decode error: {e}, skipping batch")
        return [{"id": i, "scores": {}, "total": 0, "reason": "parse error"} for i in range(len(batch_rows))]


def rag_rank(df: pd.DataFrame, intent: dict) -> pd.DataFrame:
    """
    Two-step RAG pipeline:

    1. Global FAISS retrieval (pre-built, instant) — searches the index built
       at startup, filters to companies that passed Filter 1, keeps top
       RAG_TOP_K by cosine similarity. Stores embedding_score [0, 1].

    2. Parallel Qwen2.5-72B scoring — all batches run concurrently so
       wall-clock time ≈ one batch's latency regardless of how many batches.

    Final score: 0.4 × embedding_score + 0.6 × (rag_score / max_rag)
    """
    semantic_query = intent.get("semantic_query") or intent.get("original_query", "")
    query = intent.get("original_query") or semantic_query
    criteria = intent.get("criteria", [])

    # Guard: nothing to rank
    if df.empty:
        df = df.copy()
        df["embedding_score"] = 0.0
        df["rag_score"] = 0
        df["match_reasons"] = ""
        return df

    # ── Step A: FAISS retrieval from pre-built global index ────────────────────
    global _vector_store
    if _vector_store is None:
        # Fallback if startup didn't build the index (should not happen normally)
        build_global_index(df)

    filtered_indices = set(df.index.tolist())

    # Search all companies in the global index — FAISS search on 477 vectors
    # takes microseconds, so fetching all is negligible cost
    all_retrieved = _vector_store.similarity_search_with_score(
        semantic_query, k=_total_companies or len(df)
    )

    # Keep only companies that passed Filter 1, ranked by similarity
    retrieved_indices = []
    embedding_scores: dict[int, float] = {}
    for doc, l2_dist in all_retrieved:
        idx = doc.metadata["df_index"]
        if idx not in filtered_indices:
            continue
        # L2-normalized vectors: cosine_similarity = 1 - L2² / 2, clipped to [0, 1]
        cosine_sim = max(0.0, 1.0 - (float(l2_dist) ** 2) / 2.0)
        retrieved_indices.append(idx)
        embedding_scores[idx] = cosine_sim
        if len(retrieved_indices) >= RAG_TOP_K:
            break

    # Deduplicate indices while preserving similarity order
    seen: set[int] = set()
    unique_indices = [i for i in retrieved_indices if not (i in seen or seen.add(i))]
    candidates = df.loc[unique_indices].copy()
    candidates["embedding_score"] = candidates.index.map(embedding_scores)
    print(f"[RAG Filter] Retrieved {len(candidates)} candidates via FAISS")

    # ── Step B: Parallel Qwen2.5-72B scoring ──────────────────────────────────
    # When no criteria extracted, derive implicit ones from the semantic query
    if not criteria:
        criteria = [
            f"relevant to the query: {semantic_query}",
            "matches the industry or sector described in the query",
            "matches the geographic location described in the query",
        ]

    llm = ChatOpenAI(
        model=LLM_RERANK_MODEL,
        openai_api_key=FEATHERLESS_API_KEY,
        openai_api_base=FEATHERLESS_BASE_URL,
        max_tokens=1024,
        temperature=0,
    )

    rows = list(candidates.iterrows())
    total_batches = (len(rows) + LLM_BATCH_SIZE - 1) // LLM_BATCH_SIZE
    batches = [
        (bn + 1, rows[bs: bs + LLM_BATCH_SIZE])
        for bn, bs in enumerate(range(0, len(rows), LLM_BATCH_SIZE))
    ]

    # Fire all batches in parallel — wall time ≈ slowest single batch
    all_results: dict[int, dict] = {}

    def _run_batch(batch_num: int, batch: list) -> tuple[int, list, list[dict]]:
        print(f"[RAG Filter] Batch {batch_num}/{total_batches} started…")
        scores = _score_batch(llm, batch, query, criteria)
        print(f"[RAG Filter] Batch {batch_num}/{total_batches} done")
        return batch_num, batch, scores

    with ThreadPoolExecutor(max_workers=total_batches) as executor:
        futures = [executor.submit(_run_batch, bn, batch) for bn, batch in batches]
        for future in as_completed(futures):
            _, batch, scores = future.result()
            for local_i, (orig_idx, _) in enumerate(batch):
                all_results[orig_idx] = scores[local_i] if local_i < len(scores) else {"total": 0, "reason": ""}

    candidates["rag_score"] = candidates.index.map(
        lambda i: all_results.get(i, {}).get("total", 0)
    )
    candidates["match_reasons"] = candidates.index.map(
        lambda i: all_results.get(i, {}).get("reason", "")
    )

    return candidates
