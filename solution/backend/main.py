"""
FastAPI backend for the Company Qualification System.
"""
import sys
import os
import math
import json
import psutil
try:
    import stripe
    _stripe_available = True
except ImportError:
    stripe = None
    _stripe_available = False
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel
import uvicorn
import traceback
import time
sys.path.insert(0, os.path.dirname(__file__))

if _stripe_available:
    stripe.api_key = os.getenv("STRIPE_SECRET_KEY", "")

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

class CheckoutRequest(BaseModel):
    plan: str  # "starter" | "pro" | "enterprise"
    frontend_url: str = ""

_PLANS = {
    "starter":    {"name": "Starter",    "price_cents": 4900,  "desc": "100 qualification credits / month"},
    "pro":        {"name": "Pro",        "price_cents": 14900, "desc": "500 credits + priority processing"},
    "enterprise": {"name": "Enterprise", "price_cents": 49900, "desc": "Unlimited credits + API access"},
}

FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:5173")

@app.post("/create-checkout-session")
def create_checkout_session(req: CheckoutRequest):
    if not _stripe_available:
        raise HTTPException(status_code=503, detail="Stripe not installed. Run: pip install stripe")
    plan = _PLANS.get(req.plan)
    if not plan:
        raise HTTPException(status_code=400, detail="Unknown plan")
    if not stripe.api_key:
        raise HTTPException(status_code=503, detail="Stripe not configured — set STRIPE_SECRET_KEY env var")
    base_url = req.frontend_url.rstrip("/") if req.frontend_url else FRONTEND_URL
    try:
        session = stripe.checkout.Session.create(
            payment_method_types=["card"],
            line_items=[{
                "price_data": {
                    "currency": "usd",
                    "product_data": {
                        "name": f"Intent Qualifier — {plan['name']} Plan",
                        "description": plan["desc"],
                    },
                    "unit_amount": plan["price_cents"],
                },
                "quantity": 1,
            }],
            mode="payment",
            success_url=f"{base_url}/?payment=success&plan={req.plan}",
            cancel_url=f"{base_url}/?payment=cancelled",
        )
        return {"url": session.url, "session_id": session.id}
    except stripe.StripeError as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.get("/diagnostics")
def diagnostics():
    return {
        "gpu": False,
        "message": "CPU mode",
        "ram_free_gb": round(psutil.virtual_memory().available / 1e9, 1)
    }

@app.on_event("startup")
async def startup():
    """Pre-load data and FAISS in background so port binds immediately."""
    import threading
    def _load():
        df = _load_data()
        build_global_index(df)
        print("🚀 Startup complet - index ready!")
    threading.Thread(target=_load, daemon=True).start()

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
