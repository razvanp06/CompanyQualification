# Future Improvements

Things that could be built or improved in the next versions of this project.

---

## 1. Better answers

**Problem now:** The AI scorer (Llama-3.1-8B) sometimes gives wrong scores because it's a small model and it can be confused by vague company descriptions or unusual industries.

**What could be improved:**

- **Better embedding model** — swap `all-MiniLM-L6-v2` for `BAAI/bge-large-en-v1.5` or Cohere Embed v3. These produce much more accurate semantic matches, especially for niche industries.
- **Larger scoring model** — use Llama-3.1-70B or Qwen2.5-72B instead of the 8B model. The answers would be significantly more accurate, especially for ambiguous queries. The tradeoff is speed (~10s instead of ~4s).
- **More company data** — many companies have `null` for employee count and revenue. If those fields were filled in, the structured filter (Stage 1) would do a much better job cutting out irrelevant companies before the AI even runs.
- **NAICS coverage** — some companies have no NAICS code or a very generic one. Adding secondary NAICS codes or manually tagging industries would improve scoring accuracy.
- **Multi-language support** — currently works in English and Romanian. Adding French, German, Spanish would make it useful for more users without major code changes.

---

## 2. A smaller backend

**Problem now:** The backend has several leftover files from previous versions (`embedding_filter.py`, `llm_reranker.py`, `perplexity_filter.py`, `app.py`) that are no longer used but still sit in the codebase.

**What could be improved:**

- **Remove dead code** — delete unused pipeline files. The active pipeline is: `intent_extractor.py` → `structured_filter.py` → `rag_filter.py` → `qualify.py`. Everything else is legacy.
- **Merge small files** — `config.py` could be folded into `main.py` since it's just a few constants. Fewer files = easier to navigate.
- **Replace LangChain with direct FAISS** — LangChain adds ~10 extra packages just to wrap FAISS. Using `faiss-cpu` directly would cut the dependency list in half and make installs faster.
- **Lighter requirements** — `sentence-transformers` pulls in PyTorch (~800MB). For a CPU-only deployment, this could be replaced with `onnxruntime` + a pre-exported model, cutting install size from ~1.5GB to ~150MB.
- **Single-file backend** — for a dataset of 477 companies, the entire backend could realistically be one ~300-line Python file instead of a multi-folder package.

---

## 3. Faster logic

**Problem now:** The main bottleneck is the LLM scoring step (~4s), which requires network calls to an external API. The FAISS index is already cached at startup, so that part is fast.

**What could be improved:**

- **Async HTTP calls** — currently uses `ThreadPoolExecutor` for parallelism, which is good but not optimal. Switching to `asyncio` + `httpx` would be slightly faster and use less memory.
- **Score caching** — if the same company gets queried repeatedly (e.g. "pharma in Romania" asked many times), the LLM scores could be cached in a dictionary keyed by `(company_id, query_hash)`. Most scores wouldn't change between queries.
- **Pre-filter with NAICS** — before sending companies to the LLM, automatically exclude those whose NAICS code clearly belongs to a different sector. This is partially done now but could be more aggressive, reducing the number of LLM calls.
- **Streaming results** — instead of waiting for all batches to finish before showing anything, stream results to the frontend as each batch completes. The user would see the first results in ~1s instead of waiting for all ~4s.
- **Local LLM** — run a quantized (compressed) version of Llama-3.1-8B directly on the machine using `llama.cpp` or `ollama`. No network latency, no API dependency, works offline. Tradeoff: needs a good CPU or GPU.

---

## 4. Search based on user experience (database with login)

**Problem now:** Every user gets the same generic results. The system has no memory — it doesn't know who you are, what you've searched before, or which results you found useful.

**What could be built:**

- **User accounts** — add login (email + password, or Google OAuth). Each user gets a profile stored in a database (PostgreSQL or SQLite).
- **Search history** — save every query and its results. Users can go back and see what they searched before, re-run old queries, or compare results over time.
- **Personalised ranking** — if a user consistently clicks on SaaS companies and ignores manufacturing ones, the system learns this and ranks SaaS higher for that user in future searches.
- **Saved lists** — users can save companies to a "shortlist" or "watchlist", like bookmarks. Useful for sales teams tracking prospects.
- **Feedback buttons** — add thumbs up / thumbs down on each result. These signals are stored and used to improve the scoring model over time.
- **Team accounts** — multiple users in the same organisation share a workspace. One person's saved companies and notes are visible to their teammates.

---

## 5. Better handling of bad or unclear queries

**Problem now:** If the user types something vague like *"good companies"* or *"interesting businesses"*, the system still runs the full pipeline and returns random results with no warning.

**What could be built:**

- **Query quality check** — before running the pipeline, quickly check if the query contains enough information (industry, location, or any other signal). If not, ask the user for more details.
- **Clarifying questions** — instead of returning bad results, respond with: *"Did you mean companies in a specific country? What industry are you looking for?"*
- **Query suggestions** — show autocomplete suggestions as the user types, based on what queries have worked well in the past.
- **Minimum confidence threshold** — if the intent extractor finds no country, no industry, and no filters at all, show a warning: *"Your query is very broad — results may not be accurate. Try adding a country or industry."*
- **Spelling correction** — if the user types "pharmacutical" or "romaina", auto-correct it before processing.
- **Query rewriting** — use a small LLM to rephrase the query into a cleaner form before running it through the pipeline. For example: *"fast growing tech startups in eastern europe doing AI stuff"* → *"AI technology startups in Eastern Europe, founded after 2018"*.
