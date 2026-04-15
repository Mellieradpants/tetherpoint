"""Pydantic models for the Tetherpoint pipeline.

Source of truth: backend/openapi.yaml
All schemas here must match the OpenAPI 3.1 spec exactly.
"""

from __future__ import annotations

from enum import Enum
from typing import Any, Literal, Optional

from pydantic import BaseModel, Field


# ---------------------------------------------------------------------------
# Request
# ---------------------------------------------------------------------------

class ContentType(str, Enum):
    xml = "xml"
    html = "html"
    json = "json"
    text = "text"


class AnalyzeOptions(BaseModel):
    run_meaning: bool = False  # default off — requires authorization
    run_origin: bool = True
    run_verification: bool = True


class AnalyzeRequest(BaseModel):
    content: str = Field(..., min_length=1, max_length=500_000)
    content_type: ContentType
    options: AnalyzeOptions = Field(default_factory=AnalyzeOptions)


# ---------------------------------------------------------------------------
# Layer 1 — Input
# Purpose: intake only. No inference, no interpretation.
# ---------------------------------------------------------------------------

class InputResult(BaseModel):
    raw_content: str
    content_type: str
    size: int
    parse_status: Literal["ok", "error"]
    parse_errors: list[str] = Field(default_factory=list)


# ---------------------------------------------------------------------------
# Layer 2 — Structure
# Purpose: deterministic parse and normalize. No AI.
# Subsystems: 5W1H, SSE, CFS, LNS, AAC, TPS, SJM, MPS, RDS, ISC
# ---------------------------------------------------------------------------

class StructureNode(BaseModel):
    node_id: str
    source_anchor: str
    source_text: str
    normalized_text: str
    actor: Optional[str] = None
    action: Optional[str] = None
    condition: Optional[str] = None
    temporal: Optional[str] = None
    jurisdiction: Optional[str] = None
    mechanism: Optional[str] = None
    risk: Optional[dict[str, Optional[str]]] = None
    tags: list[str] = Field(default_factory=list)
    blocked_flags: list[str] = Field(default_factory=list)
    who: Optional[str] = None
    what: Optional[str] = None
    when: Optional[str] = None
    where: Optional[str] = None
    why: Optional[str] = None
    how: Optional[str] = None


class StructureResult(BaseModel):
    nodes: list[StructureNode]
    node_count: int


# ---------------------------------------------------------------------------
# Layer 3 — Selection
# Purpose: deterministic node eligibility. No AI, no interpretation.
# Nodes pass through unchanged.
# ---------------------------------------------------------------------------

class SelectionResult(BaseModel):
    selected_nodes: list[StructureNode]
    excluded_nodes: list[StructureNode]
    selection_log: list[str]


# ---------------------------------------------------------------------------
# Layer 4 — Meaning
# Purpose: the ONLY AI interpretation layer.
# Operates only on selected nodes. Isolated behind clear interface.
# If no model key, returns status only — no fake output.
# ---------------------------------------------------------------------------

MeaningLensName = Literal[
    "modality_shift",
    "scope_change",
    "actor_power_shift",
    "action_domain_shift",
    "threshold_standard_shift",
    "obligation_removal",
]


class MeaningLens(BaseModel):
    lens: MeaningLensName
    detected: bool
    detail: Optional[str] = None


class MeaningNodeResult(BaseModel):
    node_id: str
    source_text: str
    lenses: list[MeaningLens]


class MeaningResult(BaseModel):
    status: Literal["executed", "skipped", "error"]
    message: Optional[str] = None
    node_results: list[MeaningNodeResult] = Field(default_factory=list)


# ---------------------------------------------------------------------------
# Layer 5 — Origin
# Purpose: provenance/source tracing only.
# No credibility judgment. No truth claims. No intent claims.
# Distribution metadata does not override origin identity.
# ---------------------------------------------------------------------------

class OriginSignal(BaseModel):
    signal: str
    value: str
    category: Optional[str] = None


class OriginResult(BaseModel):
    status: Literal["executed", "skipped"]
    origin_identity_signals: list[OriginSignal] = Field(default_factory=list)
    origin_metadata_signals: list[OriginSignal] = Field(default_factory=list)
    distribution_signals: list[OriginSignal] = Field(default_factory=list)
    evidence_trace: list[str] = Field(default_factory=list)


# ---------------------------------------------------------------------------
# Layer 6 — Verification
# Purpose: verification-path routing only.
# No true/false decisions. No credibility scoring. No final judgment.
# ---------------------------------------------------------------------------

AssertionType = Literal[
    "legal_legislative",
    "court_case_law",
    "government_publication",
    "scientific_biomedical",
    "statistical_public_data",
    "corporate_financial",
    "infrastructure_energy",
    "historical_archival",
]


class VerificationNodeResult(BaseModel):
    node_id: str
    assertion_detected: bool
    assertion_type: Optional[AssertionType] = None
    verification_path_available: bool
    expected_record_systems: list[str] = Field(default_factory=list)
    verification_notes: Optional[str] = None


class VerificationResult(BaseModel):
    status: Literal["executed", "skipped"]
    node_results: list[VerificationNodeResult] = Field(default_factory=list)


# ---------------------------------------------------------------------------
# Layer 7 — Output
# Purpose: presentation only. No transformation of upstream meaning.
# ---------------------------------------------------------------------------

class OutputResult(BaseModel):
    summary: dict[str, Any]
    total_nodes: int
    selected_count: int
    excluded_count: int
    meaning_status: str
    origin_status: str
    verification_status: str


# ---------------------------------------------------------------------------
# Pipeline error
# ---------------------------------------------------------------------------

PipelineLayerName = Literal[
    "input", "structure", "selection", "meaning",
    "origin", "verification", "output",
]


class PipelineError(BaseModel):
    layer: PipelineLayerName
    error: str
    fatal: bool = False


# ---------------------------------------------------------------------------
# Full pipeline response
# ---------------------------------------------------------------------------

class PipelineResponse(BaseModel):
    input: InputResult
    structure: StructureResult
    selection: SelectionResult
    meaning: MeaningResult
    origin: OriginResult
    verification: VerificationResult
    output: OutputResult
    errors: list[PipelineError] = Field(default_factory=list)
