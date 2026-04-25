"""Selection layer: deterministic node eligibility. No AI, no interpretation."""

from __future__ import annotations

import re

from app.schemas.models import SelectionResult, StructureNode, StructureResult


_BILL_MARKER_RE = re.compile(
    r"^(?:h\.?\s*r\.?\s*\d+\.?|s\.?\s*\d+\.?|h\.?\s*res\.?\s*\d+\.?|s\.?\s*res\.?\s*\d+\.?)$",
    re.I,
)
_SHORT_LABEL_RE = re.compile(
    r"^(?:an act\.?|a bill\.?|and\.?|or\.?|the following\.?|be it enacted\.?)$",
    re.I,
)
_AMENDMENT_MECHANIC_RE = re.compile(
    r"^by\s+(?:adding|striking|inserting|redesignating|amending|substituting|moving|transferring)\b",
    re.I,
)
_OPERATIONAL_RE = re.compile(
    r"\b(shall|must|may|require[sd]?|prohibit(?:ed|s)?|eligible|eligibility|document(?:ary|ation)?|proof|"
    r"provide|submit|register|registration|verify|verification|review|determine|authority|authorized|"
    r"enforce(?:ment)?|deadline|not later than|after|before|if|unless|except|means|includes|defined)\b",
    re.I,
)
_ACTOR_RE = re.compile(
    r"\b(applicant|person|individual|citizen|state|official|registrar|commission|secretary|agency|"
    r"department|court|congress|voter|election|chief|employee|officer)\b",
    re.I,
)
_ACTION_RE = re.compile(
    r"\b(provide|submit|register|vote|verify|review|determine|issue|accept|reject|require|prohibit|"
    r"maintain|remove|notify|enforce|present|include|establish|permit|allow)\b",
    re.I,
)


def _normalized_text(node: StructureNode) -> str:
    return " ".join((node.source_text or node.normalized_text or "").split())


def _word_count(text: str) -> int:
    return len(re.findall(r"\b[\w'-]+\b", text))


def _is_header_or_label(text: str) -> bool:
    stripped = text.strip().strip(".;:")
    words = _word_count(stripped)
    if _BILL_MARKER_RE.match(stripped) or _SHORT_LABEL_RE.match(stripped):
        return True
    if words <= 3 and stripped.upper() == stripped and not _OPERATIONAL_RE.search(stripped):
        return True
    return False


def _is_mechanic_only(text: str) -> bool:
    if not _AMENDMENT_MECHANIC_RE.search(text):
        return False
    return not any([
        _ACTOR_RE.search(text),
        re.search(r"\b(shall|must|may|proof|eligib|register|verification|authority|deadline)\b", text, re.I),
    ])


def _has_actor(node: StructureNode, text: str) -> bool:
    return bool(node.actor or node.who or _ACTOR_RE.search(text))


def _has_action_or_requirement(node: StructureNode, text: str) -> bool:
    return bool(
        node.action
        or node.what
        or _ACTION_RE.search(text)
        or _OPERATIONAL_RE.search(text)
    )


def _has_operational_effect(node: StructureNode, text: str) -> bool:
    if node.role == "DEFINITION" and re.search(r"\b(means|includes|defined|term)\b", text, re.I):
        return _word_count(text) >= 6
    return bool(
        _OPERATIONAL_RE.search(text)
        or node.condition
        or node.temporal
        or node.jurisdiction
        or node.mechanism
        or (node.risk and any(node.risk.values()))
    )


def _selection_reasons(node: StructureNode) -> list[str]:
    reasons: list[str] = []
    text = _normalized_text(node)
    words = _word_count(text)

    if not text:
        return ["empty source_text"]

    if "origin:document_identity" in node.tags:
        reasons.append("document identity/header node routed to Origin")

    if node.validation_status == "invalid":
        reasons.append("hierarchy validation failed")

    if node.blocked_flags:
        reasons.append(f"blocked by CFS: {', '.join(node.blocked_flags)}")

    if _is_header_or_label(text):
        reasons.append("short marker/header label only")

    if _is_mechanic_only(text):
        reasons.append("amendment instruction fragment only")

    has_actor = _has_actor(node, text)
    has_action = _has_action_or_requirement(node, text)
    has_operational_effect = _has_operational_effect(node, text)

    if words < 5 and not (has_actor and has_action):
        reasons.append("too short to contain actor/action/condition")

    if not has_actor and not has_action:
        reasons.append("missing affected actor and action/requirement")
    elif not has_operational_effect and not (has_actor and has_action):
        reasons.append("no substantive operational effect detected")

    return reasons


def process_selection(structure: StructureResult) -> SelectionResult:
    """Select nodes eligible for downstream processing. Deterministic rules only."""
    selected: list[StructureNode] = []
    excluded: list[StructureNode] = []
    log: list[str] = []

    for node in structure.nodes:
        reasons = _selection_reasons(node)

        if reasons:
            excluded.append(node)
            log.append(f"{node.node_id}: EXCLUDED - {'; '.join(reasons)}")
        else:
            selected.append(node)
            log.append(f"{node.node_id}: SELECTED")

    return SelectionResult(
        selected_nodes=selected,
        excluded_nodes=excluded,
        selection_log=log,
    )
