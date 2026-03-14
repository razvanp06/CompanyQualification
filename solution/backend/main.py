"""
FastAPI backend for the Company Qualification System.

Endpoints:
  POST /qualify        — run full pipeline for a query
  GET  /companies      — list all companies (for debug/frontend browse)
  GET  /health         — health check
"""

import sys
import os
sys.path.insert(0, os.path.dirname(__file__))

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from pipeline.qualify import qualify, _load_data

app = FastAPI(title="Company Qualification API", version="1.0.0")

# Allow all origins in development (restrict in production)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


class QueryRequest(BaseModel):
    query: str
    top_n: int = 20


@app.on_event("startup")
async def startup():
    """Pre-load data and embedding model on startup."""
    _load_data()
    # Warm up embedding model
    from pipeline.embedding_filter import _get_model
    _get_model()
    print("Startup complete — data and model loaded.")


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/qualify")
def qualify_endpoint(req: QueryRequest):
    """
    Run the full qualification pipeline for a user query.
    Returns ranked companies with scores and reasoning.
    """
    if not req.query.strip():
        raise HTTPException(status_code=400, detail="Query cannot be empty")
    try:
        result = qualify(req.query, top_n=req.top_n)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/companies")
def list_companies(limit: int = 50, offset: int = 0):
    """Return raw companies for browsing / debugging."""
    df = _load_data()
    slice_ = df.iloc[offset: offset + limit]
    return {
        "total": len(df),
        "offset": offset,
        "limit": limit,
        "companies": slice_.to_dict(orient="records"),
    }
