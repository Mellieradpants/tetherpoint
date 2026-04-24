"""Meaning layer: the ONLY AI interpretation layer.

Operates only on selected nodes and returns a terminal node-scoped meaning result.
"""

from __future__ import annotations

import json
import os
from typing import Any

from app.schemas.models import (
    MeaningNodeResult,
    MeaningNodeResult,
    MeaningResult,
    MeaningNodeResult,
    StructureNode,
)


def _build_prompt(node: StructureNode) -> str:
    return (
        "You are the meaning layer for a deterministic pipeline. "
        "Read exactly one node and return ONLY one JSON object. No markdown, no prose, no explanation.\n\n"
        f'Node text: "{node.source_text}"\n\n'
        "Required output contract:\n"
        "Success:\n"
        '{"status":"success","plain_meaning":"one plain sentence","structured":{"actors":[],"actions":[],"object":null,"temporal":null,"jurisdiction":null}}\n\n'
        "Empty:\n"
        '{"status":"empty","plain_meaning":null,"structured":null,"reason":"no meaningful content extracted"}\n\n'
        "Rules:\n"
        "- status must be exactly success or empty\n"
        "- plain_meaning must be one plain sentence or null\n"
        "- structured must be an object on success or null on empty\n"
        "- structured.actors must be a list of strings\n"
        "- structured.actions must be a list of strings\n"
        "- structured.object must be a string or null\n"
        "- structured.temporal must be a string or null\n"
        "- structured.jurisdiction must be a string or null\n"
        "- do not include node_id\n"
        "- do not include any extra keys\n"
        "- if there is no meaningful content to interpret, return empty\n"
    )


def _extract_candidate_json(raw_text: str) -> str:
    text = raw_text.strip()

    if text.startswith("```"):
        lines = text.splitlines()
        if len(lines) >= 3:
            text = "\n".join(lines[1:-1]).strip()

    if text.startswith("json\n"):
        text = text[5:].strip()

    obj_start = text.find("{")
    obj_end = text.rfind("}")
    if obj_start != -1 and obj_end != -1 and obj_end > obj_start:
        return text[obj_start : obj_end + 1]

    return text


def _validate_success_payload(node_id: str, payload: dict[str, Any]):
    plain_meaning = payload.get("plain_meaning")
    structured = payload.get("structured")

    if not isinstance(plain_meaning, str) or not plain_meaning.strip():
        return MeaningNodeResult(
            node_id=node_id,
            status="error",
            reason="plain_meaning must be a non-empty string for success output",
        )

    if not isinstance(structured, dict):
        return MeaningNodeResult(
            node_id=node_id,
            status="error",
            reason="structured must be an object for success output",
        )

    actors = structured.get("actors")
    actions = structured.get("actions")
    object_value = structured.get("object")
    temporal = structured.get("temporal")
    jurisdiction = structured.get("jurisdiction")

    if not isinstance(actors, list) or not all(isinstance(item, str) for item in actors):
        return MeaningNodeResult(
            node_id=node_id,
            status="error",
            reason="structured.actors must be a list of strings",
        )

    if not isinstance(actions, list) or not all(isinstance(item, str) for item in actions):
        return MeaningNodeResult(
            node_id=node_id,
            status="error",
            reason="structured.actions must be a list of strings",
        )

    if object_value is not None and not isinstance(object_value, str):
        return MeaningNodeResult(
            node_id=node_id,
            status="error",
            reason="structured.object must be a string or null",
        )

    if temporal is not None and not isinstance(temporal, str):
        return MeaningNodeResult(
            node_id=node_id,
            status="error",
            reason="structured.temporal must be a string or null",
        )

    if jurisdiction is not None and not isinstance(jurisdiction, str):
        return MeaningNodeResult(
            node_id=node_id,
            status="error",
            reason="structured.jurisdiction must be a string or null",
        )

    return MeaningNodeResult(
        node_id=node_id,
        status="success",
        plain_meaning=plain_meaning.strip(),
        structured=MeaningStructured(
            actors=actors,
            actions=actions,
            object=object_value,
            temporal=temporal,
            jurisdiction=jurisdiction,
        ),
    )


def _normalize_meaning_payload(node_id: str, raw_text: str):
    candidate = _extract_candidate_json(raw_text)

    try:
        payload = json.loads(candidate)
    except json.JSONDecodeError as exc:
        return MeaningNodeResult(
            node_id=node_id,
            status="error",
            reason=f"{type(exc).__name__}: {exc}",
        )

    if not isinstance(payload, dict):
        return MeaningNodeResult(
            node_id=node_id,
            status="error",
            reason="model response was not a JSON object",
        )

    status = payload.get("status")
    if status not in {"success", "empty"}:
        return MeaningNodeResult(
            node_id=node_id,
            status="error",
            reason="model status must be success or empty",
        )

    if status == "empty":
        reason = payload.get("reason")
        if not isinstance(reason, str) or not reason.strip():
            return MeaningNodeResult(
                node_id=node_id,
                status="error",
                reason="empty output must include a non-empty reason",
            )
        return MeaningNodeResult(
            node_id=node_id,
            status="empty",
            reason=reason.strip(),
        )

    return _validate_success_payload(node_id, payload)


def _call_openai(node: StructureNode, api_key: str):
    try:
        import httpx
    except ImportError as exc:
        return MeaningNodeResult(
            node_id=node.node_id,
            status="error",
            reason=f"{type(exc).__name__}: {exc}",
        )

    prompt = _build_prompt(node)

    try:
        resp = httpx.post(
            "https://api.openai.com/v1/chat/completions",
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
            json={
                "model": "gpt-4o-mini",
                "messages": [
                    {
                        "role": "system",
                        "content": "Return only one JSON object that matches the user contract exactly.",
                    },
                    {"role": "user", "content": prompt},
                ],
                "temperature": 0.0,
            },
            timeout=30.0,
        )
    except Exception as exc:
        return MeaningNodeResult(
            node_id=node.node_id,
            status="error",
            reason=f"{type(exc).__name__}: {exc}",
        )

    try:
        resp.raise_for_status()
    except Exception as exc:
        return MeaningNodeResult(
            node_id=node.node_id,
            status="error",
            reason=f"{type(exc).__name__}: {exc}",
        )

    try:
        response_json = resp.json()
        content = response_json["choices"][0]["message"]["content"]
    except Exception as exc:
        return MeaningNodeResult(
            node_id=node.node_id,
            status="error",
            reason=f"{type(exc).__name__}: {exc}",
        )

    if not isinstance(content, str):
        return MeaningNodeResult(
            node_id=node.node_id,
            status="error",
            reason="model content was not a string",
        )

    return _normalize_meaning_payload(node.node_id, content)


def process_meaning(
    selected_nodes: list[StructureNode],
    run: bool = True,
) -> MeaningResult:
    """Process meaning for selected nodes. AI layer."""
    if not run:
        return MeaningResult(
            status="skipped",
            message="Meaning layer skipped by options",
            node_results=[],
        )

    api_key = os.environ.get("OPENAI_API_KEY", "")
    if not api_key:
        return MeaningResult(
            status="error",
            message="Meaning not executed: no OPENAI_API_KEY configured",
            node_results=[
                MeaningNodeResult(
                    node_id=node.node_id,
                    status="error",
                    reason="OPENAI_API_KEY not configured",
                )
                for node in selected_nodes
            ],
        )

    node_results = []
    for node in selected_nodes:
        if not node.source_text.strip():
            node_results.append(
                MeaningNodeResult(
                    node_id=node.node_id,
                    status="empty",
                    reason="no meaningful content extracted",
                )
            )
            continue

        node_results.append(_call_openai(node, api_key))

    return MeaningResult(status="executed", node_results=node_results)
