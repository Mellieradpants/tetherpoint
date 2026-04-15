"""Tests that validate the OpenAPI spec against the live backend models.

These tests ensure the spec stays aligned with Pydantic models —
any future drift will surface as a clear test failure.
"""

import yaml
import os
from pathlib import Path
from typing import get_args, get_origin

import pytest
from pydantic import BaseModel
from pydantic.fields import FieldInfo

from app.schemas.models import (
    AnalyzeOptions,
    AnalyzeRequest,
    ContentType,
    InputResult,
    StructureNode,
    StructureResult,
    SelectionResult,
    MeaningLens,
    MeaningNodeResult,
    MeaningResult,
    OriginSignal,
    OriginResult,
    VerificationNodeResult,
    VerificationResult,
    OutputResult,
    PipelineError,
    PipelineResponse,
)

SPEC_PATH = Path(__file__).resolve().parent.parent.parent / "openapi.yaml"


@pytest.fixture(scope="module")
def spec():
    """Load and return the parsed OpenAPI spec."""
    assert SPEC_PATH.exists(), f"OpenAPI spec not found at {SPEC_PATH}"
    with open(SPEC_PATH) as f:
        return yaml.safe_load(f)


# --- 1. Syntactic validity ---

def test_spec_is_valid_yaml(spec):
    """The spec must parse as valid YAML with expected top-level keys."""
    assert "openapi" in spec
    assert "paths" in spec
    assert "components" in spec
    assert "schemas" in spec["components"]


def test_spec_version(spec):
    """Must be OpenAPI 3.1.x."""
    assert spec["openapi"].startswith("3.1")


def test_spec_has_required_endpoints(spec):
    """Must document /analyze and /health."""
    paths = spec["paths"]
    assert "/analyze" in paths
    assert "/health" in paths


def test_analyze_endpoint_has_security(spec):
    """POST /analyze must require analyzeSecret."""
    analyze = spec["paths"]["/analyze"]["post"]
    assert "security" in analyze
    security_names = [list(s.keys())[0] for s in analyze["security"]]
    assert "analyzeSecret" in security_names


def test_analyze_error_responses(spec):
    """Must document 400, 401, 413, 422, 429 error responses."""
    responses = spec["paths"]["/analyze"]["post"]["responses"]
    for code in ["400", "401", "413", "422", "429"]:
        assert code in responses, f"Missing {code} response documentation"


# --- 2. Schema contract alignment ---

def _get_spec_schema(spec, name: str) -> dict:
    """Retrieve a named schema from the spec."""
    schemas = spec["components"]["schemas"]
    assert name in schemas, f"Schema {name} not found in spec"
    return schemas[name]


def _resolve_ref(spec, ref_or_schema: dict) -> dict:
    """Resolve a $ref if present."""
    if "$ref" in ref_or_schema:
        path = ref_or_schema["$ref"].lstrip("#/").split("/")
        result = spec
        for p in path:
            result = result[p]
        return result
    return ref_or_schema


def _get_model_field_names(model: type[BaseModel]) -> set[str]:
    """Get all field names from a Pydantic model."""
    return set(model.model_fields.keys())


def _get_spec_field_names(spec, schema_name: str) -> set[str]:
    """Get all property names from a spec schema."""
    schema = _get_spec_schema(spec, schema_name)
    return set(schema.get("properties", {}).keys())


# Mapping of spec schema name → Pydantic model
SCHEMA_MODEL_MAP = {
    "AnalyzeOptions": AnalyzeOptions,
    "AnalyzeRequest": AnalyzeRequest,
    "InputResult": InputResult,
    "StructureNode": StructureNode,
    "StructureResult": StructureResult,
    "SelectionResult": SelectionResult,
    "MeaningLens": MeaningLens,
    "MeaningNodeResult": MeaningNodeResult,
    "MeaningResult": MeaningResult,
    "OriginSignal": OriginSignal,
    "OriginResult": OriginResult,
    "VerificationNodeResult": VerificationNodeResult,
    "VerificationResult": VerificationResult,
    "OutputResult": OutputResult,
    "PipelineError": PipelineError,
    "PipelineResponse": PipelineResponse,
}


@pytest.mark.parametrize("schema_name,model", list(SCHEMA_MODEL_MAP.items()))
def test_spec_fields_match_model(spec, schema_name, model):
    """Every spec schema must have exactly the same fields as its Pydantic model."""
    spec_fields = _get_spec_field_names(spec, schema_name)
    model_fields = _get_model_field_names(model)

    extra_in_spec = spec_fields - model_fields
    extra_in_model = model_fields - spec_fields

    errors = []
    if extra_in_spec:
        errors.append(f"Fields in spec but NOT in model: {extra_in_spec}")
    if extra_in_model:
        errors.append(f"Fields in model but NOT in spec: {extra_in_model}")

    assert not errors, (
        f"Schema mismatch for {schema_name}:\n" + "\n".join(errors)
    )


def test_spec_required_fields_match_model(spec):
    """Required fields in spec must align with non-optional model fields."""
    # Check a key subset — PipelineResponse
    schema = _get_spec_schema(spec, "PipelineResponse")
    spec_required = set(schema.get("required", []))
    model_required = set()
    for name, field in PipelineResponse.model_fields.items():
        if field.is_required():
            model_required.add(name)

    assert spec_required == model_required, (
        f"PipelineResponse required mismatch:\n"
        f"  Spec: {spec_required}\n"
        f"  Model: {model_required}"
    )


def test_content_type_enum_matches(spec):
    """ContentType enum values must match spec."""
    spec_enum = set(_get_spec_schema(spec, "ContentType").get("enum", []))
    model_enum = {e.value for e in ContentType}
    assert spec_enum == model_enum, (
        f"ContentType mismatch: spec={spec_enum}, model={model_enum}"
    )


# --- 3. No stale fields ---

def test_no_translated_text_in_spec(spec):
    """translated_text must not appear anywhere — it was removed."""
    spec_str = yaml.dump(spec)
    assert "translated_text" not in spec_str, (
        "Stale field 'translated_text' found in OpenAPI spec"
    )
