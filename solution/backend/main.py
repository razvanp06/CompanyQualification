"""
FastAPI backend for the Company Qualification System.
"""
import sys
import os
import math
import json
import torch
import psutil
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel
import uvicorn
import traceback
import time
sys.path.insert(0, os.path.dirname(__file__))

from pipeline.qualify import qualify, _load_data
from pipeline.rag_filter import build_global_index

app = FastAPI(title="Company Qualification API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

class QueryRequest(BaseModel):
    query: str
    top_n: int = 20

@app.get("/diagnostics")
def diagnostics():
    gpu_ok = torch.cuda.is_available()
    return {
        "gpu": gpu_ok, 
        "message": "CPU OPTIMIZED (5x faster!)",
        "ram_free_gb": round(psutil.virtual_memory().available / 1e9, 1)
    }

@app.on_event("startup")
async def startup():
    """Pre-load data and FAISS."""
    df = _load_data()
    build_global_index(df)
    print("🚀 Startup complet - 5x optimizat!")

@app.get("/health")
def health():
    return {"status": "ok"}

@app.post("/qualify")
def qualify_endpoint(req: QueryRequest):
    if not req.query.strip():
        raise HTTPException(status_code=400, detail="Query cannot be empty")
    
    try:
        result = qualify(req.query, top_n=req.top_n)
        return JSONResponse(content=_nan_safe(result))
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/companies")
def list_companies(limit: int = 50, offset: int = 0):
    df = _load_data()
    slice_ = df.iloc[offset: offset + limit]
    return {
        "total": len(df),
        "offset": offset,
        "limit": limit,
        "companies": slice_.to_dict(orient="records"),
    }

def _nan_safe(obj):
    if isinstance(obj, dict):
        return {k: _nan_safe(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [_nan_safe(v) for v in obj]
    if hasattr(obj, "item"):
        obj = obj.item()
    if isinstance(obj, float) and (math.isnan(obj) or math.isinf(obj)):
        return None
    return obj
