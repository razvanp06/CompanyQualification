# WRITEUP — Intent Qualification System

## Approach

The system is a **4-stage qualification pipeline** where each stage is cheaper and faster than the next, and each stage reduces the candidate set before passing it forward.

```
User Query
    │
    ▼
┌───────────────────────────────┐
│  Filter 0 — Intent Extractor  │  Claude Haiku (1 call)
│  Extracts structured intent + │  ~0.5s, ~$0.001
│  criteria from the query      │
└───────────┬───────────────────┘
            │  intent JSON
            ▼
┌───────────────────────────────┐
│  Filter 1 — Structured Filter │  Pandas — no API call
│  Hard constraints:            │  ~1ms
│  country, revenue, employees, │
│  year_founded, is_public      │
└───────────┬───────────────────┘
            │  ~50-400 companies
            ▼
┌───────────────────────────────┐
│  Filter 2 — Embedding Search  │  sentence-transformers (local)
│  Cosine similarity on company │  ~200ms for 477 companies
│  text profiles vs query       │  free, no API call
└───────────┬───────────────────┘
            │  top-80 candidates
            ▼
┌───────────────────────────────┐
│  Filter 3 — LLM Batch Rerank  │  Claude Haiku (8 batches of 10)
│  Scores each company against  │  ~5-10s, ~$0.01-0.02 per query
│  extracted criteria           │
└───────────┬───────────────────┘
            │  scored + ranked
            ▼
       Final results
```

### Component Details

**Filter 0 — Intent Extractor**

Uses Claude Haiku to parse the query into a structured JSON object:
- Hard constraints: `countries`, `min/max_employees`, `min/max_revenue`, `min/max_year_founded`, `is_public`
- `semantic_query`: a cleaned version of the query optimised for embedding search
- `criteria`: a list of discrete, independently verifiable criteria for LLM scoring
- `result_count`: how many results the user wants (null = return default top-N)

**Filter 1 — Structured Pandas Filter**

Applies all hard constraints from the intent JSON using vectorised Pandas operations. This is the cheapest filter (microseconds, no API calls) and can eliminate a large fraction of the dataset for structured queries.

**Filter 2 — Embedding Similarity**

Builds a text profile for each company by concatenating `description`, `core_offerings`, `target_markets`, `business_model`, and NAICS industry labels. Uses `sentence-transformers/all-MiniLM-L6-v2` (local, free) to embed profiles and the `semantic_query`. Ranks by cosine similarity and keeps the top 80 candidates.

We use the `semantic_query` (not the raw query) to improve accuracy. For example:
- Raw query: *"Companies that could supply packaging materials for a direct-to-consumer cosmetics brand"*
- Semantic query: *"packaging materials suppliers for cosmetics brands"*

This avoids the classic failure where cosmetics companies rank highest because the word "cosmetics" dominates the embedding.

**Filter 3 — LLM Batch Reranker**

Sends companies in batches of 10 to Claude Haiku. For each batch, the model receives the original query, the extracted criteria, and compact company summaries. It returns a structured JSON scoring each company `true/false` on each criterion, with a total score and a one-line reason.

**Final Ranking**

Final score = `0.4 × embedding_score + 0.6 × (llm_score / max_llm_score)`

LLM score is weighted higher because it captures semantic understanding. Embedding score is included to preserve ordering signal for companies with equal LLM scores.

---

## Tradeoffs

| Dimension | Choice | Tradeoff |
|-----------|--------|----------|
| **Cost** | Haiku for all LLM calls | Much cheaper than Sonnet/Opus; slightly less accurate on ambiguous queries |
| **Speed** | Local embeddings, batch size 10 | ~10-15s total per query; could be faster with async batching |
| **Accuracy** | 3-stage funnel | Small risk of correct companies being eliminated at stage 1 or 2 |
| **Simplicity** | Linear pipeline | Easy to debug, but no feedback loop between stages |
| **Embedding model** | all-MiniLM-L6-v2 (local) | Fast and free, but weaker than OpenAI/Cohere embeddings |

---

## Error Analysis

### Where the system works well

- **Structured queries** with hard constraints (country, employee count, revenue, year): Filter 1 handles these perfectly with zero LLM cost.
- **Clear industry queries**: "logistics companies in Romania", "pharma in Switzerland" — embedding + NAICS codes give strong signal.
- **B2B SaaS / HR / fintech**: These terms appear consistently in company descriptions and core_offerings.

### Where the system struggles

**1. Supply chain role inference**

Query: *"Companies that manufacture or supply critical components for electric vehicle battery production"*

The system may rank battery-pack assemblers and EV manufacturers higher than the actual upstream suppliers (e.g., lithium refining, cathode material producers) because those companies' descriptions may not explicitly mention "EV batteries".

**2. "Fast-growing" and "competing with"**

Query: *"Fast-growing fintech companies competing with traditional banks in Europe"*

There is no `growth_rate` field in the dataset. The LLM must infer this from revenue, year_founded, and employee_count — which is unreliable.

**3. Platform inference**

Query: *"E-commerce companies using Shopify or similar platforms"*

No company description mentions their e-commerce platform. The system can only infer from `core_offerings` and `business_model`, which is a weak signal.

**4. Missing data**

Many companies have `null` for `employee_count` and `revenue`. The structured filter treats unknown employee count as eligible (avoid false negatives), but this means we can't confidently filter "fewer than 200 employees" for data-sparse companies.

---

## Scaling

For 100,000 companies per query:

| Stage | Current | At 100k |
|-------|---------|---------|
| Filter 1 (pandas) | ~1ms | ~10ms — still trivial |
| Filter 2 (embeddings) | ~200ms | ~5s batch encode — acceptable; can be precomputed |
| Filter 3 (LLM) | 8 calls × 10 = 80 companies | Still 80 companies — no change! |

**Key insight**: The pipeline is designed so that Filters 1 and 2 do the heavy lifting. The LLM (the expensive step) always sees at most `EMBEDDING_TOP_K` companies, regardless of dataset size.

For true production scale:
1. **Pre-compute and cache embeddings** — store them in a vector DB (Pinecone, Weaviate, pgvector). Embedding update only needed when companies change.
2. **Make Filter 3 async** — send all batches in parallel instead of sequentially.
3. **Add a metadata index** — use Elasticsearch or DuckDB for fast Filter 1 queries instead of in-memory Pandas.
4. **Use approximate nearest neighbour (ANN)** — FAISS or HNSW index for sub-millisecond embedding search at 100k+ scale.

---

## Failure Modes

### Confident but incorrect results

**1. Criteria hallucination**: Claude may score a company `true` on a criterion if the description is vague but plausible-sounding. For example, a generic "technology company" description may cause it to score true for "B2B SaaS" even if the company is not SaaS.

**2. False embedding matches**: Companies with verbose descriptions covering many topics may rank highly on cosine similarity for unrelated queries.

**3. Intent extraction errors**: If the query is ambiguous or uses unusual phrasing, the intent extractor may extract wrong country codes or revenue thresholds.

### Production monitoring

- **Track `after_filter1 / total`**: If it's always 0, the country extraction is failing. If it's always 1.0, the filter is too permissive.
- **LLM score distribution**: If all companies score 0 or all score max, criteria extraction is likely broken.
- **User feedback loop**: Allow users to mark results as relevant/irrelevant. Use these signals to tune the embedding weight vs LLM weight.
- **Latency by stage**: Log time per filter to detect regressions.

---

## What We Would Prioritise Next

1. **Async LLM batches** — biggest speed win for the current scale
2. **Pre-computed embeddings** — eliminate 200ms embed time at query time
3. **Better embedding model** — `BAAI/bge-large-en-v1.5` or Cohere Embed v3 for meaningfully better ranking
4. **Structured NAICS filter** — Filter 1 could directly match NAICS codes to industry taxonomy, bypassing LLM for industry classification
5. **Confidence calibration** — expose `llm_score / num_criteria` as a match confidence percentage
