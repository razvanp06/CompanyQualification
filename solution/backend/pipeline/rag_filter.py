"""
Filter 2 — LangChain RAG Pipeline

Replicates Perplexity's approach: fast vector retrieval + precise LLM reasoning.

Step A — Retrieval (like Perplexity's search):
    Builds a FAISS vector store from the filtered company set using local
    sentence-transformer embeddings. Retrieves the top RAG_TOP_K most
    semantically relevant companies for the query.

Step B — Scoring (like Perplexity's answer generation):
    Sends retrieved companies in batches to Qwen2.5-72B-Instruct via
    featherless.ai using LangChain's ChatOpenAI. The model evaluates each
    company against the extracted criteria and returns structured scores.

Returns a DataFrame with 'rag_score' and 'match_reasons' columns,
sorted by rag_score descending.
"""

import json
import re
import pandas as pd

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

# Cache the embedding model — heavy to load, reuse across queries
_embeddings: HuggingFaceEmbeddings | None = None


def _get_embeddings() -> HuggingFaceEmbeddings:
    global _embeddings
    if _embeddings is None:
        _embeddings = HuggingFaceEmbeddings(model_name=EMBEDDING_MODEL)
    return _embeddings


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
    Two-step RAG pipeline replacing the old embedding filter + LLM reranker:

    1. FAISS retrieval — finds the RAG_TOP_K most semantically relevant
       companies from the filtered set using the semantic_query.
    2. Qwen2.5-72B scoring — evaluates each retrieved company against the
       extracted criteria in batches of LLM_BATCH_SIZE.

    Adds 'rag_score' and 'match_reasons' columns.
    Returns df sorted by rag_score descending.
    """
    semantic_query = intent.get("semantic_query") or intent.get("original_query", "")
    query = intent.get("original_query") or semantic_query
    criteria = intent.get("criteria", [])

    # ── Step A: LangChain FAISS retrieval ─────────────────────────────────────
    print(f"[RAG Filter] Building FAISS index for {len(df)} companies…")
    embeddings = _get_embeddings()

    docs = [
        Document(
            page_content=_build_company_text(row),
            metadata={"df_index": idx},
        )
        for idx, row in df.iterrows()
    ]
    vector_store = FAISS.from_documents(docs, embeddings)

    top_k = min(RAG_TOP_K, len(df))
    retrieved_docs = vector_store.similarity_search(semantic_query, k=top_k)
    retrieved_indices = [doc.metadata["df_index"] for doc in retrieved_docs]

    candidates = df.loc[retrieved_indices]
    print(f"[RAG Filter] Retrieved {len(candidates)} candidates via FAISS")

    # ── Step B: Qwen2.5-72B scoring ───────────────────────────────────────────
    if not criteria:
        result = candidates.copy()
        result["rag_score"] = 0
        result["match_reasons"] = ""
        return result

    llm = ChatOpenAI(
        model=LLM_RERANK_MODEL,
        openai_api_key=FEATHERLESS_API_KEY,
        openai_api_base=FEATHERLESS_BASE_URL,
        max_tokens=1024,
        temperature=0,
    )

    rows = list(candidates.iterrows())
    all_results: dict[int, dict] = {}
    total_batches = (len(rows) + LLM_BATCH_SIZE - 1) // LLM_BATCH_SIZE

    for batch_start in range(0, len(rows), LLM_BATCH_SIZE):
        batch = rows[batch_start: batch_start + LLM_BATCH_SIZE]
        batch_num = batch_start // LLM_BATCH_SIZE + 1
        print(f"[RAG Filter] Scoring batch {batch_num}/{total_batches} with Qwen2.5-72B…")
        scores = _score_batch(llm, batch, query, criteria)

        for local_i, (orig_idx, _) in enumerate(batch):
            if local_i < len(scores):
                all_results[orig_idx] = scores[local_i]
            else:
                all_results[orig_idx] = {"total": 0, "reason": ""}

    result = candidates.copy()
    result["rag_score"] = result.index.map(lambda i: all_results.get(i, {}).get("total", 0))
    result["match_reasons"] = result.index.map(lambda i: all_results.get(i, {}).get("reason", ""))

    return result.sort_values("rag_score", ascending=False)
