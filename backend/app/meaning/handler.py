"""Meaning layer: the ONLY AI interpretation layer.

Operates only on selected nodes. If no API key is available,
returns explicit 'meaning not executed' status.
"""

from __future__ import annotations

import json
import os
from typing import Any

from app.schemas.models import (
    MeaningLens,
    MeaningNodeResult,
    MeaningResult,
    StructureNode,
)

LENSES = [
    "modality_shift",
    "scope_change",
    "actor_power_shift",
    "action_domain_shift",
    "threshold_standard_shift",
    "obligation_removal",
]


def _build_prompt(node: StructureNode) -> str:
    return (
        "You are a precise analytical system. Given the following text extracted from a document, "
        "evaluate it against each of the following lenses. For each lens, respond with a JSON object "
        "containing 'lens', 'detected' (boolean), and 'detail' (string or null).\n\n"
        f'Text: "{node.source_text}"\n\n'
        "Lenses to evaluate:\n"
        "1. modality_shift - Does the text shift obligation modality (e.g., 'shall' to 'may')?\n"
        "2. scope_change - Does the text narrow or expand scope relative to its apparent domain?\n"
        "3. actor_power_shift - Does the text redistribute authority or power among actors?\n"
        "4. action_domain_shift - Does the text move an action into a different domain?\n"
        "5. threshold_standard_shift - Does the text raise or lower a threshold or standard?\n"
        "6. obligation_removal - Does the text remove or weaken an obligation?\n\n"
        "Respond ONLY with valid JSON. No markdown fences, no prose, no explanation. "
        "Return a top-level JSON array of 6 objects. Each object must contain exactly: "
        "lens, detected, detail."
    )


def _extract_candidate_json(raw_text: str) -> str:
    text = raw_text.strip()

    if text.startswith("```"):
        lines = text.splitlines()
        if len(lines) >= 3:
            text = "\n".join(lines[1:-1]).strip()

    if text.startswith("json\n"):
        text = text[5:].strip()

    array_start = text.find("[")
    array_end = text.rfind("]")
    if array_start != -1 and array_end != -1 and array_end > array_start:
        return text[array_start : array_end + 1]

    obj_start = text.find("{")
    obj_end = text.rfind("}")
    if obj_start != -1 and obj_end != -1 and obj_end > obj_start:
        return text[obj_start : obj_end + 1]

    return text


def _normalize_lens_payload(raw_text: str) -> tuple[list[dict[str, Any]] | None, dict[str, str] | None]:
    candidate = _extract_candidate_json(raw_text)

    try:
        payload = json.loads(candidate)
    except json.JSONDecodeError as exc:
        return None, {
            "error": "response_parse_failed",
            "message": f"{type(exc).__name__}: {exc}",
            "raw_response": raw_text,
        }

    if isinstance(payload, dict):
        if isinstance(payload.get("lenses"), list):
            payload = payload["lenses"]
        else:
            return None, {
                "error": "response_shape_mismatch",
                "message": "Model returned a JSON object instead of a lens array.",
                "raw_response": raw_text,
            }

    if not isinstance(payload, list):
        return None, {
            "error": "response_shape_mismatch",
            "message": "Model response was not a JSON array.",
            "raw_response": raw_text,
        }

    normalized: list[dict[str, Any]] = []
    for item in payload:
        if not isinstance(item, dict):
            return None, {
                "error": "response_shape_mismatch",
                "message": "One or more lens entries were not JSON objects.",
                "raw_response": raw_text,
            }
        normalized.append(item)

    return normalized, None


def _call_openai(prompt: str, api_key: str) -> tuple[list[dict[str, Any]] | None, dict[str, str] | None]:
    """Call OpenAI-compatible API and return normalized lens results or an error object."""
    try:
        import httpx
    except ImportError as exc:
        return None, {
            "error": "dependency_import_failed",
            "message": f"{type(exc).__name__}: {exc}",
        }

    try:
        resp = httpx.post(
            "https://api.openai.com/v1/chat/completions",
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
            json={
                "model": "gpt-4o-mini",
                "messages": [{"role": "user", "content": prompt}],
                "temperature": 0.0,
            },
            timeout=30.0,
        )
    except Exception as exc:
        return None, {
            "error": "api_request_failed",
            "message": f"{type(exc).__name__}: {exc}",
        }

    raw_body = resp.text

    try:
        resp.raise_for_status()
    except Exception as exc:
        return None, {
            "error": "api_http_error",
            "message": f"{type(exc).__name__}: {exc}",
            "raw_response": raw_body,
        }

    try:
        response_json = resp.json()
        content = response_json["choices"][0]["message"]["content"]
    except Exception as exc:
        return None, {
            "error": "api_response_shape_error",
            "message": f"{type(exc).__name__}: {exc}",
            "raw_response": raw_body,
        }

    if not isinstance(content, str):
        return None, {
            "error": "api_response_shape_error",
            "message": "Model content was not a string.",
            "raw_response": json.dumps(content, ensure_ascii=False),
        }

    return _normalize_lens_payload(content)


def process_meaning(
    selected_nodes: list[StructureNode],
    run: bool = True,
) -> MeaningResult:
    """Process meaning for selected nodes. AI layer."""
    if not run:
        return MeaningResult(
            status="skipped",
            message="Meaning layer skipped by options",
        )

    api_key = os.environ.get("OPENAI_API_KEY", "")
    if not api_key:
        return MeaningResult(
            status="skipped",
            message="Meaning not executed: no OPENAI_API_KEY configured",
        )

    node_results: list[MeaningNodeResult] = []

    for node in selected_nodes:
        prompt = _build_prompt(node)
        raw, error = _call_openai(prompt, api_key)

        if error is not None:
            node_results.append(
                MeaningNodeResult(
                    node_id=node.node_id,
                    source_text=node.source_text,
                    status="error",
                    error=error.get("error"),
                    message=error.get("message"),
                    raw_response=error.get("raw_response"),
                    lenses=[],
                )
            )
            continue

        lenses: list[MeaningLens] = []
        for item in raw or []:
            lens_name = item.get("lens", "unknown")
            if lens_name not in LENSES:
                continue
            lenses.append(
                MeaningLens(
                    lens=lens_name,
                    detected=bool(item.get("detected", False)),
                    detail=item.get("detail"),
                )
            )

        node_results.append(
            MeaningNodeResult(
                node_id=node.node_id,
                source_text=node.source_text,
                status="executed",
                lenses=lenses,
            )
        )

    return MeaningResult(status="executed", node_results=node_results)
