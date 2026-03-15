# Company Qualification System

A search engine for a database of ~477 companies. You type a plain-English query like *"pharmaceutical companies in Romania"* and it finds the best matches, ranked by how well each company truly fits — not just by keywords.

---

## What it does (plain English)

Instead of a simple keyword search (which would just look for the word "pharmaceutical" in a text field), this system **understands your query** and scores each company based on what it actually does for a living.

---

## How it works — the pipeline

Every query goes through 4 stages. Each stage is cheaper and faster than the one before it, and each stage throws out bad matches before passing the rest forward.

```
Your query
    │
    ▼
┌──────────────────────────────────────────────────────┐
│  Stage 0 — Understand the query          (< 1ms)     │
│  Regex + keyword matching                            │
│  "pharmaceutical in Romania" →                       │
│    country = Romania                                 │
│    industry = Pharmaceutical                         │
└─────────────────────┬────────────────────────────────┘
                      │
                      ▼
┌──────────────────────────────────────────────────────┐
│  Stage 1 — Hard filters                  (< 1ms)     │
│  Plain data matching, no AI              477 → ~26   │
│  "country = Romania" → keep only the                 │
│  26 Romanian companies                               │
└─────────────────────┬────────────────────────────────┘
                      │
                      ▼
┌──────────────────────────────────────────────────────┐
│  Stage 2A — Semantic search              (instant)   │
│  Pre-built FAISS vector index                        │
│  Finds the most semantically similar companies       │
│  using sentence embeddings (local model)             │
│  26 → top 26 re-ranked by relevance                  │
└─────────────────────┬────────────────────────────────┘
                      │
                      ▼
┌──────────────────────────────────────────────────────┐
│  Stage 2B — AI scoring                   (~4s)       │
│  Llama-3.1-8B reads each company and                 │
│  scores it 0-10 for the query                        │
│  Uses NAICS industry code as primary signal          │
└─────────────────────┬────────────────────────────────┘
                      │
                      ▼
              Final ranked list
              (only green ≥ 70% shown)
```

---

## Stage-by-stage explanation

### Stage 0 — Understanding the query

The system reads your query using regex and keyword matching (no API call, instant). It extracts:

- **Country** — "Romania" → `ro`, "France" → `fr`, "Scandinavia" → `[se, no, dk]`
- **Employee count** — "more than 500 employees" → `min_employees = 500`
- **Revenue** — "revenue over $50M" → `min_revenue = 50000000`
- **Public/private** — "public companies" → `is_public = true`
- **Industry** — "pharmaceutical" → industry rule for the AI scorer
- **Cities** — "companies in Bucharest" → city-level filter

> Example: *"pharmaceutical companies in Romania"* →
> `{ country: "ro", industry: "Pharmaceutical", criteria: ["primary business is pharma manufacturing or drug distribution (NOT generic chemicals)"] }`

---

### Stage 1 — Hard filters (instant)

Pure data matching using pandas. No AI involved. If you said "Romania", only Romanian companies survive. If you said "more than 500 employees", companies with fewer are removed.

This alone can cut 477 companies down to 20-50 before the expensive stages even run.

---

### Stage 2A — Semantic search with FAISS (instant)

Every company's name, description, industry label, and offerings are turned into a **vector** (a list of 384 numbers that captures the meaning of the text) using a local AI model called `all-MiniLM-L6-v2`.

This is done **once at startup** and cached. At query time, your query is also turned into a vector, and the system finds the companies whose vectors are closest to yours — these are the most semantically relevant ones.

Think of it like: instead of searching for the exact word "pharmaceutical", it understands that "drug distributor", "medicine manufacturer", and "pharma wholesaler" all mean the same thing.

---

### Stage 2B — AI scoring with Llama-3.1-8B (~4 seconds)

The remaining companies are sent in parallel batches to **Llama-3.1-8B** (a fast open-source language model hosted on featherless.ai). The model reads each company's name, NAICS industry code, and description, then scores it 0–10 based on how well it matches your query.

The scoring uses hard rules to avoid common mistakes:
- For a **pharmaceutical** query: if the company's NAICS code doesn't contain "pharmaceutical/drug/medicine" — maximum score of 2, regardless of description
- For a **logistics** query: energy/oil/gas companies score 0, even if they "distribute" a product
- The LLM focuses on what the company **IS**, not who its customers are

Batches run in **parallel** (all at the same time), so 26 companies in 3 batches takes the same time as 1 batch.

---

### Final score

```
final_score = (llm_score / 10)  +  (embedding_similarity × 0.01)
```

The embedding similarity acts as a tiny tiebreaker between companies that got the same LLM score. The LLM score is what actually matters.

Only companies scoring **≥ 70% (green)** are shown. If nothing scores that high, the top 3 are shown instead.

---

## Full backend flow — step by step

Here is exactly what happens from the moment you press Search to the moment results appear.

### 1. Your browser sends a request
```
POST /qualify  →  { query: "pharmaceutical companies in Romania", top_n: 20 }
```
`main.py` receives this and calls `qualify()`.

---

### 2. Stage 0 — Reading the query (`intent_extractor.py`)
Regex and keyword lists read your query. No AI, no API call, runs in under 1ms.

It figures out:
- **"Romania"** → filter by country code `ro`
- **"pharmaceutical"** → industry = `Pharmaceutical`, and writes a strict rule for the AI scorer: *"must be drug/medicine company, NOT generic chemicals"*

Result: a structured JSON object called the **intent**.

---

### 3. Stage 1 — Cutting the list (`structured_filter.py`)
Takes all 477 companies and applies dead-simple pandas filters:
- `country_code == "ro"` → 26 companies survive
- If you had said "more than 500 employees" it would also filter by that
- No AI, runs in under 1ms

Now we have 26 companies instead of 477.

---

### 4. Stage 2A — Finding the most relevant ones (`rag_filter.py` — FAISS)
At startup, every company's text (name + description + industry label) was converted into a list of 384 numbers called an **embedding** — a mathematical fingerprint of its meaning. These are stored in a FAISS index in memory.

Your query is also converted to 384 numbers. FAISS then finds which of the 26 Romanian companies have the closest fingerprints to your query.

This takes **0 milliseconds** because the index was built at startup and just sits in RAM.

---

### 5. Stage 2B — AI reads each company (`rag_filter.py` — LLM)
The 26 companies are split into batches of 10. All batches are sent **at the same time** (parallel threads) to Llama-3.1-8B on featherless.ai.

For each company the AI sees:
```
[1] Fildas Trading | NAICS: Drugs and Druggists' Sundries Merchant Wholesalers
    Romania's largest pharmaceutical distributor...

[2] Unilever | NAICS: Other Chemical and Allied Products Merchant Wholesalers
    Consumer goods company...
```

It also receives a hard rule injected into the prompt:
> *"If NAICS does NOT contain 'pharmaceutical/drug/medicine' — max score 2"*

It replies with just scores:
```
1:9
2:1
```

All batches finish in ~4 seconds because they run at the same time, not one after another.

---

### 6. Final ranking (`qualify.py`)
Scores are combined:
```
final_score = (llm_score / 10) + (embedding_similarity × 0.01)
```
- `llm_score / 10` — turns 0–10 into 0.0–1.0
- `embedding_similarity × 0.01` — tiny tiebreaker for companies with the same LLM score

Companies are sorted highest to lowest, converted to JSON, and sent back to your browser.

---

### 7. The browser filters the display (`App.jsx`)
The frontend receives all scored companies and shows only those with **score ≥ 70% (green)**. If nothing qualifies, the top 3 are shown so the page is never empty.

---

### Timeline of a single query

```
0ms   → intent extracted (regex, instant)
1ms   → 477 companies filtered to ~26 (pandas)
2ms   → FAISS ranks the 26 by semantic relevance (pre-built index)
~4s   → Llama-3.1-8B scores all 26 in parallel
~4s   → results appear in your browser
```

---

## Project structure

```
CompanyQualification/
├── frontend/src/App.jsx          — React UI (search box, company cards, score rings)
└── solution/
    ├── data/companies.jsonl      — 477 companies (name, description, NAICS, address, etc.)
    └── backend/
        ├── main.py               — FastAPI server (HTTP endpoints)
        ├── config.py             — API keys, model names, knobs
        ├── requirements.txt      — Python dependencies
        └── pipeline/
            ├── intent_extractor.py   — Stage 0: parse the query
            ├── structured_filter.py  — Stage 1: hard pandas filters
            ├── rag_filter.py         — Stage 2: FAISS + LLM scoring
            └── qualify.py            — Orchestrates all stages, builds final response
```

---

## How to run

### Backend

```bash
cd solution/backend
python -m venv venv
source venv/bin/activate          # Windows: venv\Scripts\activate
pip install -r requirements.txt
./venv/bin/python -m uvicorn main:app --host 0.0.0.0 --port 8000
```

The first startup takes ~20 seconds — it downloads the embedding model and builds the FAISS index. After that it's instant.

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173).

---

## Company data fields

Each company in `companies.jsonl` has:

| Field | What it is |
|---|---|
| `operational_name` | Company name |
| `description` | What the company does |
| `primary_naics` | Industry classification code + label (e.g. "Pharmaceutical Preparation Manufacturing") |
| `address` | Country, city |
| `employee_count` | Number of employees (often null) |
| `revenue` | Annual revenue in USD (often null) |
| `year_founded` | When the company was founded |
| `is_public` | Whether the company is publicly listed |
| `business_model` | e.g. B2B, SaaS, marketplace |
| `core_offerings` | Main products/services |
| `target_markets` | Who they sell to |

---

## Why results are sometimes limited

The system is only as good as the data. If you search for "pharmaceutical companies in Romania" and only one comes back, that means only one Romanian company in the database has a pharmaceutical NAICS code. The AI isn't wrong — the data just doesn't have more.

---

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | React + Vite |
| Backend | FastAPI (Python) |
| Embeddings | `all-MiniLM-L6-v2` via sentence-transformers (local) |
| Vector search | FAISS (local, in-memory) |
| LLM scoring | Llama-3.1-8B via featherless.ai (OpenAI-compatible API) |
| Intent parsing | Regex + keyword matching (no API, instant) |
