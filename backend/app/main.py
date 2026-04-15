"""Tetherpoint API — source-anchored parsing stack."""

import logging
import os

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware

from app.pipeline.runner import run_pipeline
from app.schemas.models import AnalyzeRequest, PipelineResponse
from app.security.guards import enforce_security

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(name)s %(levelname)s %(message)s",
)

logger = logging.getLogger("tetherpoint.cors")

app = FastAPI(
    title="Tetherpoint",
    description="Source-anchored parsing stack",
    version="0.1.0",
)

# ------------------------------------------------------------------
# CORS — restrict to known origins.
# Set ALLOWED_ORIGINS as a comma-separated list in the environment,
# e.g. "https://anchored-flow-stack.lovable.app,https://example.com"
# Falls back to the published Lovable URL only.
# ------------------------------------------------------------------
_default_origins = (
    "https://anchored-flow-stack.lovable.app,"
    "https://id-preview--37017f8b-59ad-473e-bfb5-253a00e3a6f0.lovable.app,"
    "https://37017f8b-59ad-473e-bfb5-253a00e3a6f0.lovableproject.com"
)
_raw = os.environ.get("ALLOWED_ORIGINS", _default_origins)
ALLOWED_ORIGINS = [o.strip() for o in _raw.split(",") if o.strip()]

logger.info("CORS allowed origins: %s", ALLOWED_ORIGINS)

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["POST", "GET", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization", "X-Analyze-Secret"],
)


@app.post("/analyze", response_model=PipelineResponse)
def analyze(body: AnalyzeRequest, request: Request) -> PipelineResponse:
    """Run the locked 7-layer pipeline on the provided document."""
    body = enforce_security(body, request)
    return run_pipeline(body)


@app.get("/health")
def health():
    return {"status": "ok"}
