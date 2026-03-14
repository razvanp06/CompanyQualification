"""
FastAPI backend for the Company Qualification System.

Endpoints:
  POST /qualify        — run full pipeline for a query
  GET  /companies      — list all companies (for debug/frontend browse)
  GET  /health         — health check
"""

import sys
import os
import math
import json
import traceback
sys.path.insert(0, os.path.dirname(__file__))

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
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
    """Pre-load data and warm up the embedding model on startup."""
    _load_data()
    from pipeline.rag_filter import _get_embeddings
    _get_embeddings()
    print("Startup complete — data and embedding model loaded.")


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
        return JSONResponse(content=_nan_safe(result))
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


def _nan_safe(obj):
    """Recursively replace NaN/Inf with None for JSON serialization."""
    if isinstance(obj, dict):
        return {k: _nan_safe(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [_nan_safe(v) for v in obj]
    if hasattr(obj, "item"):
        obj = obj.item()
    if isinstance(obj, float) and (math.isnan(obj) or math.isinf(obj)):
        return None
    return obj


@app.get("/companies")
def list_companies(limit: int = 50, offset: int = 0):
    """Return raw companies for browsing / debugging."""
    df = _load_data()
    slice_ = df.iloc[offset: offset + limit]
    data = _nan_safe({
        "total": len(df),
        "offset": offset,
        "limit": limit,
        "companies": slice_.to_dict(orient="records"),
    })
    return JSONResponse(content=data)
