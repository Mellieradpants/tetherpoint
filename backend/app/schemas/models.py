"""Pydantic models for the Tetherpoint pipeline."""

from __future__ import annotations

from enum import Enum
from typing import Any, Optional

from pydantic import BaseModel, Field


class ContentType(str, Enum):
    xml = "xml"
    html = "html"
    json = "json"
    text = "text"


class AnalyzeOptions(BaseModel):
    run_meaning: bool = True
    run_origin: bool = True
    run_verification: bool = True


class AnalyzeRequest(BaseModel):
    content: str
    content_type: ContentType
    options: AnalyzeOptions = Field(default_factory=AnalyzeOptions)


# --- Input layer ---

class InputResult(BaseModel):
    raw_content: str
    content_type: str
    size: int
    parse_status: str  # "ok" | "error"
    parse_errors: list[str] = Field(default_factory=list)


# --- Structure layer ---

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


# --- Selection layer ---

class SelectionResult(BaseModel):
    selected_nodes: list[StructureNode]
    excluded_nodes: list[StructureNode]
    selection_log: list[str]


# --- Meaning layer ---

class MeaningLens(BaseModel):
    lens: str
    detected: bool
    detail: Optional[str] = None


class MeaningNodeResult(BaseModel):
    node_id: str
    source_text: str
    lenses: list[MeaningLens]


class MeaningResult(BaseModel):
    status: str  # "executed" | "skipped" | "error"
    message: Optional[str] = None
    node_results: list[MeaningNodeResult] = Field(default_factory=list)


# --- Origin layer ---

class OriginResult(BaseModel):
    status: str  # "executed" | "skipped"
    origin_identity_signals: list[dict[str, Any]] = Field(default_factory=list)
    origin_metadata_signals: list[dict[str, Any]] = Field(default_factory=list)
    distribution_signals: list[dict[str, Any]] = Field(default_factory=list)
    evidence_trace: list[str] = Field(default_factory=list)


# --- Verification layer ---

class VerificationNodeResult(BaseModel):
    node_id: str
    assertion_detected: bool
    assertion_type: Optional[str] = None
    verification_path_available: bool
    expected_record_systems: list[str] = Field(default_factory=list)
    verification_notes: Optional[str] = None


class VerificationResult(BaseModel):
    status: str  # "executed" | "skipped"
    node_results: list[VerificationNodeResult] = Field(default_factory=list)


# --- Output layer ---

class OutputResult(BaseModel):
    summary: dict[str, Any]
    total_nodes: int
    selected_count: int
    excluded_count: int
    meaning_status: str
    origin_status: str
    verification_status: str


# --- Pipeline error ---

class PipelineError(BaseModel):
    layer: str
    error: str
    fatal: bool = False


# --- Full pipeline response ---

class PipelineResponse(BaseModel):
    input: InputResult
    structure: StructureResult
    selection: SelectionResult
    meaning: MeaningResult
    origin: OriginResult
    verification: VerificationResult
    output: OutputResult
    errors: list[PipelineError] = Field(default_factory=list)
