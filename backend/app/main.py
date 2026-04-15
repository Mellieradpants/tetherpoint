"""Tetherpoint API — source-anchored parsing stack."""

import logging

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware

from app.pipeline.runner import run_pipeline
from app.schemas.models import AnalyzeRequest, PipelineResponse
from app.security.guards import enforce_security

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(name)s %(levelname)s %(message)s",
)

app = FastAPI(
    title="Tetherpoint",
    description="Source-anchored parsing stack",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.post("/analyze", response_model=PipelineResponse)
def analyze(body: AnalyzeRequest, request: Request) -> PipelineResponse:
    """Run the locked 7-layer pipeline on the provided document."""
    body = enforce_security(body, request)
    return run_pipeline(body)


@app.get("/health")
def health():
    return {"status": "ok"}
