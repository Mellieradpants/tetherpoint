"""Structure layer: deterministic parsing and hierarchy enforcement. No AI."""

from __future__ import annotations

import json
import logging
import re
import xml.etree.ElementTree as ET
from typing import Optional

from bs4 import BeautifulSoup

from app.schemas.models import (
    ContentType,
    InputResult,
    StructureNode,
    StructureResult,
    StructureValidationIssue,
    StructureValidationReport,
)

logger = logging.getLogger("tetherpoint.structure")

MAX_NODE_CHARS = 240
MAX_NODE_LENGTH = MAX_NODE_CHARS


# ---------------------------------------------------------------------------
# LNS - Language Normalization System (deterministic text cleanup)
# ---------------------------------------------------------------------------

def lns_normalize(text: str) -> str:
    """Deterministic whitespace/line normalization. No semantic rewriting."""
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


# ---------------------------------------------------------------------------
# Deterministic patterns
# ---------------------------------------------------------------------------

_ABBREVIATIONS = {
    "v", "vs", "mr", "mrs", "ms", "dr", "jr", "sr", "inc", "corp", "ltd",
    "co", "no", "nos", "st", "ave", "blvd", "dept", "div", "est", "govt",
    "assn", "bros", "gen", "gov", "hon", "prof", "rep", "sen", "sgt",
    "etc", "al", "approx", "fig", "op", "vol", "rev", "ed", "u.s",
}
_CLAUSE_MARKER_RE = re.compile(r"\(([a-zA-Z]|\d+)\)")
_PRIMARY_RULE_RE = re.compile(
    r"\b(shall|must|may not|is required to|are required to|required to|may only|shall not|must not)\b",
    re.I,
)
_LIST_INTRO_RE = re.compile(
    r"^(?P<prefix>.*?)(?:,?\s+(?P<intro>including|include|includes|such as|consisting of)\b)\s*(?P<rest>.+)$",
    re.I | re.S,
)
_DEFINITION_RE = re.compile(
    r"\b(means|includes|defined as|refers to|shall mean)\b",
    re.I,
)
_CONDITION_RE = re.compile(
    r"^(if|when|where|provided that|on condition that|in the event that|after|before|upon)\b",
    re.I,
)
_EXCEPTION_RE = re.compile(
    r"^(unless|except|except that|notwithstanding|other than)\b",
    re.I,
)
_CONSEQUENCE_RE = re.compile(
    r"\b(subject to|penalty|liable|void|invalid|denied|rejected|inadmissible|shall be fined|shall be imprisoned)\b",
    re.I,
)
_EVIDENCE_RE = re.compile(
    r"\b(proof|documentary|document|documents|passport|certificate|identification|id\b|license|record|attestation|evidence)\b",
    re.I,
)
_BOILERPLATE_RE = re.compile(
    r"^(be it enacted\b|section\s+[a-z0-9.-]+\b|sec\.\s*[a-z0-9.-]+\b|short title\b|table of contents\b)",
    re.I,
)
_FRAGMENT_LABEL_RE = re.compile(
    r"^(?:h\.?|r\.?|\d+\.?|h\.?\s*r\.?\s*\d+\.?|s\.?\s*\d+\.?|an act\.?|and\.?|or\.?)$",
    re.I,
)
_AMENDMENT_FRAGMENT_RE = re.compile(
    r"^by\s+(?:striking|inserting|adding|redesignating|amending|substituting|moving|transferring)\b",
    re.I,
)
_ATOMIC_RULE_SIGNAL_RE = re.compile(
    r"\b(shall|must|may not|shall not|must not|is required to|are required to|required to|may only|proof|documentary|eligible|eligibility|register|registration|verify|verification|authority|authorized|deadline|not later than|means|includes)\b",
    re.I,
)
_MULTI_CLAUSE_RE = re.compile(r"\b(and|or)\b.+\b(and|or)\b", re.I)
_LEAD_CLAUSE_RE = re.compile(
    r"^(?P<lead>(?:if|when|where|provided that|on condition that|in the event that|after|before|upon|unless|except|except that|notwithstanding|other than)\b.+?),(?P<trail>\s*.+)$",
    re.I,
)
_OBLIGATION_SPLIT_RE = re.compile(
    r"\s*(?:,\s*)?(?:and|or)\s+(?=(?:the|a|an|any|each|this|that|such|another|no|[A-Z][a-z]+)?(?:\s+[A-Za-z][^,;]{0,40})?\s+\b(?:shall|must|may not|shall not|must not|is required to|are required to|required to)\b)",
    re.I,
)


# ---------------------------------------------------------------------------
# SSE - Source Statement Extraction
# ---------------------------------------------------------------------------

def _find_clause_marker_positions(text: str) -> list[int]:
    positions: list[int] = []
    for match in _CLAUSE_MARKER_RE.finditer(text):
        start = match.start()
        prev = text[start - 1] if start > 0 else ""
        next_char = text[match.end()] if match.end() < len(text) else ""
        if start == 0 or prev in {"\n", "\r", "\t", " ", ";", ":"}:
            if not next_char or next_char.isspace() or next_char.isalpha():
                positions.append(start)
    return positions


def _extract_clause_spans(text: str) -> list[str]:
    marker_positions = _find_clause_marker_positions(text)
    if not marker_positions:
        return []

    spans: list[str] = []
    if marker_positions[0] > 0:
        lead_in = text[: marker_positions[0]].strip()
        if lead_in:
            spans.append(lead_in)

    for index, start in enumerate(marker_positions):
        end = marker_positions[index + 1] if index + 1 < len(marker_positions) else len(text)
        chunk = text[start:end].strip()
        if chunk:
            spans.append(chunk)
    return spans


def sse_extract(text: str) -> list[str]:
    """Split text into sentence-like spans without breaking common abbreviations."""
    raw_parts = re.split(r"(?<=[.!?])\s+(?=[A-Z])", text)

    merged: list[str] = []
    for part in raw_parts:
        if merged:
            prev = merged[-1]
            match = re.search(r"\b(\w+)\.\s*$", prev)
            if match and match.group(1).lower() in _ABBREVIATIONS:
                merged[-1] = prev + " " + part
                continue
        merged.append(part)

    return [part.strip() for part in merged if part and part.strip()]


# ---------------------------------------------------------------------------
# CFS - Constraint Filter System
# ---------------------------------------------------------------------------

_INTENT_PATTERNS = [re.compile(r"\b(intend(?:s|ed)?|aim(?:s|ed)?|goal is)\b", re.I)]
_EMOTION_PATTERNS = [re.compile(r"\b(feel(?:s|ing)?|happy|sad|angry|fear(?:ful|s)?|love(?:s|d)?)\b", re.I)]
_CAUSAL_PATTERNS = [re.compile(r"\b(because of|caused by|due to|therefore|consequently)\b", re.I)]
_NARRATIVE_PATTERNS = [re.compile(r"\b(once upon a time|in a story|narrative|tale)\b", re.I)]


def cfs_check(text: str) -> list[str]:
    """Return list of blocked flag names if violations detected."""
    flags = []
    for pattern in _INTENT_PATTERNS:
        if pattern.search(text):
            flags.append("intent_attribution")
            break
    for pattern in _EMOTION_PATTERNS:
        if pattern.search(text):
            flags.append("emotional_labeling")
            break
    for pattern in _CAUSAL_PATTERNS:
        if pattern.search(text):
            flags.append("causal_inference")
            break
    for pattern in _NARRATIVE_PATTERNS:
        if pattern.search(text):
            flags.append("narrative_language")
            break
    return flags


# ---------------------------------------------------------------------------
# 5W1H extraction (explicit only)
# ---------------------------------------------------------------------------

_WHO_RE = re.compile(
    r"(?:^|\b)([A-Z][a-z]+(?: [A-Z][a-z]+)*)\b(?=\s+(?:is|was|are|were|has|had|will|shall|may|must|should|can|said|announced|stated|reported|declared))",
)
_WHEN_RE = re.compile(
    r"\b((?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s*\d{4}|\d{4}-\d{2}-\d{2}|\d{1,2}/\d{1,2}/\d{2,4})\b",
    re.I,
)
_WHERE_RE = re.compile(r"\bin\s+((?:[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*))\b")


def extract_5w1h(text: str) -> dict[str, Optional[str]]:
    who = _WHO_RE.search(text)
    when = _WHEN_RE.search(text)
    where = _WHERE_RE.search(text)
    return {
        "who": who.group(1) if who else None,
        "what": None,
        "when": when.group(1) if when else None,
        "where": where.group(1) if where else None,
        "why": None,
        "how": None,
    }


# ---------------------------------------------------------------------------
# AAC - Actor / Action / Condition
# ---------------------------------------------------------------------------

def aac_extract(text: str) -> dict[str, Optional[str]]:
    """Extract explicit actor, action, condition. Very conservative."""
    actor = None
    action = None
    condition = None

    who_match = _WHO_RE.search(text)
    if who_match:
        actor = who_match.group(1)

    verb_match = re.search(
        r"\b(shall|must|may|will|is required to|are required to|has|had|announced|stated|reported|declared|enacted|issued|published)\b",
        text,
        re.I,
    )
    if verb_match:
        action = verb_match.group(0)

    cond_match = re.search(r"\b(if|unless|provided that|on condition that|where)\b(.{1,80}?)(?:[.,;]|$)", text, re.I)
    if cond_match:
        condition = cond_match.group(0).strip().rstrip(".,;")

    return {"actor": actor, "action": action, "condition": condition}


# ---------------------------------------------------------------------------
# TPS - Temporal Parsing System
# ---------------------------------------------------------------------------

_TEMPORAL_RE = re.compile(
    r"\b(deadline|by\s+\w+\s+\d{1,2}|before\s+\w+\s+\d{1,2}|within\s+\d+\s+days|effective\s+\w+\s+\d{1,2}|no later than|prior to|after\s+\w+\s+\d{1,2}|\d{4}-\d{2}-\d{2})\b",
    re.I,
)


def tps_extract(text: str) -> Optional[str]:
    match = _TEMPORAL_RE.search(text)
    return match.group(0) if match else None


# ---------------------------------------------------------------------------
# SJM - System / Jurisdiction Mapping
# ---------------------------------------------------------------------------

_JURISDICTION_RE = re.compile(
    r"\b(federal|state|national|municipal|county|district|court|SEC|FDA|EPA|FCC|FERC|NERC|EIA|Congress|Senate|House|EU|UN)\b",
    re.I,
)


def sjm_extract(text: str) -> Optional[str]:
    match = _JURISDICTION_RE.search(text)
    return match.group(0) if match else None


# ---------------------------------------------------------------------------
# MPS - Mechanism Parsing System
# ---------------------------------------------------------------------------

_MECHANISM_RE = re.compile(
    r"\b(enforce(?:ment|d|s)?|penalty|fine|audit|inspection|compliance|regulation|rule|statute|code|procedure|process|protocol)\b",
    re.I,
)


def mps_extract(text: str) -> Optional[str]:
    match = _MECHANISM_RE.search(text)
    return match.group(0) if match else None


# ---------------------------------------------------------------------------
# RDS - Risk Decomposition System
# ---------------------------------------------------------------------------

_LIKELIHOOD_RE = re.compile(r"\b(likely|unlikely|probable|improbable|possible|certain|risk of)\b", re.I)
_IMPACT_RE = re.compile(r"\b(severe|minor|significant|catastrophic|negligible|major|critical|high impact|low impact)\b", re.I)


def rds_extract(text: str) -> dict[str, Optional[str]]:
    likelihood = _LIKELIHOOD_RE.search(text)
    impact = _IMPACT_RE.search(text)
    return {
        "likelihood": likelihood.group(0) if likelihood else None,
        "impact": impact.group(0) if impact else None,
    }


# ---------------------------------------------------------------------------
# Hierarchy helpers
# ---------------------------------------------------------------------------

def _normalize_fragment(text: str) -> str:
    text = lns_normalize(text)
    text = re.sub(r"^[\-\u2022]+", "", text).strip()
    text = re.sub(r"^\(([A-Za-z]|\d+)\)\s*", "", text)
    text = re.sub(r"^\d+\.\s*", "", text)
    return text.strip(" ,;:")


def _ensure_terminal_punctuation(text: str) -> str:
    if not text:
        return text
    if text[-1] in ".!?":
        return text
    return f"{text}."


def _word_count(text: str) -> int:
    return len(re.findall(r"\b[\w'-]+\b", text))


def _is_non_substantive_fragment(text: str) -> bool:
    normalized = _normalize_fragment(text).strip(" .;:")
    if not normalized:
        return True
    if _FRAGMENT_LABEL_RE.match(normalized):
        return True
    if _AMENDMENT_FRAGMENT_RE.match(normalized) and not _ATOMIC_RULE_SIGNAL_RE.search(normalized):
        return True
    if _word_count(normalized) <= 3 and not _ATOMIC_RULE_SIGNAL_RE.search(normalized):
        return True
    return False


def _fragment_role(text: str, hint_role: Optional[str] = None) -> str:
    if hint_role:
        return hint_role
    if _is_boilerplate(text):
        return "BOILERPLATE"
    if _is_non_substantive_fragment(text):
        return "CONSEQUENCE"
    return "PRIMARY_RULE"


def _is_boilerplate(text: str) -> bool:
    return bool(_BOILERPLATE_RE.search(text.strip()))


def _is_primary_candidate(text: str) -> bool:
    text = text.strip()
    if not text or _is_boilerplate(text) or _is_non_substantive_fragment(text):
        return False
    if _CONDITION_RE.search(text) or _EXCEPTION_RE.search(text):
        return False
    return bool(_PRIMARY_RULE_RE.search(text) or _ATOMIC_RULE_SIGNAL_RE.search(text))


def _is_atomic_parent(text: str) -> bool:
    normalized = text.strip()
    if not normalized:
        return False
    if len(normalized) > MAX_NODE_CHARS:
        return False
    if len(_PRIMARY_RULE_RE.findall(normalized)) > 1:
        return False
    if ";" in normalized:
        return False
    if _find_clause_marker_positions(normalized):
        return False
    if len(sse_extract(normalized)) > 1:
        return False
    if _LIST_INTRO_RE.search(normalized) or (":" in normalized and normalized.count(":") == 1):
        return False
    if _MULTI_CLAUSE_RE.search(normalized):
        return False
    return True


def _is_atomic_node(text: str) -> bool:
    normalized = text.strip()
    if not normalized:
        return True
    if len(normalized) > MAX_NODE_LENGTH:
        return False
    if ";" in normalized:
        return False
    if _find_clause_marker_positions(normalized):
        return False
    if len(_split_multiple_obligations(normalized)) > 1:
        return False
    if len(_split_comma_list(normalized, aggressive=True)) > 1 and _EVIDENCE_RE.search(normalized):
        return False
    if _LEAD_CLAUSE_RE.match(normalized):
        return False
    if _LIST_INTRO_RE.search(normalized):
        list_fragments = _split_list_intro(normalized, aggressive=True)
        if len(list_fragments) > 1:
            return False
    return True


def _classify_child(text: str, hint_role: Optional[str] = None, parent_text: Optional[str] = None) -> str:
    normalized = text.strip()
    parent_text = parent_text or ""

    if hint_role:
        return hint_role
    if _is_boilerplate(normalized):
        return "BOILERPLATE"
    if _CONDITION_RE.search(normalized):
        return "CONDITION"
    if _EXCEPTION_RE.search(normalized):
        return "EXCEPTION"
    if _CONSEQUENCE_RE.search(normalized):
        return "CONSEQUENCE"
    if _DEFINITION_RE.search(normalized):
        return "DEFINITION"
    if _EVIDENCE_RE.search(normalized):
        return "EVIDENCE"
    if _EVIDENCE_RE.search(parent_text):
        return "EVIDENCE"
    return "CONSEQUENCE"


def _hint_role_from_intro(prefix: str, intro: str) -> Optional[str]:
    combined = f"{prefix} {intro}".strip()
    if re.search(r"\b(term|definition|defined)\b", combined, re.I):
        return "DEFINITION"
    if _EVIDENCE_RE.search(combined):
        return "EVIDENCE"
    if _DEFINITION_RE.search(combined):
        return "DEFINITION"
    return None


def _fragment(text: str, hint_role: Optional[str] = None, *, force_child: bool = False) -> dict[str, object]:
    return {
        "text": text,
        "hint_role": hint_role,
        "force_child": force_child,
    }


def _split_semicolons(text: str) -> list[str]:
    if ";" not in text:
        return [text]
    return [part.strip() for part in re.split(r";\s*", text) if part and part.strip()]


def _split_multiple_obligations(text: str) -> list[str]:
    if len(_PRIMARY_RULE_RE.findall(text)) <= 1:
        return [text]
    parts = [part.strip() for part in _OBLIGATION_SPLIT_RE.split(text) if part and part.strip()]
    return parts if len(parts) > 1 else [text]


def _split_comma_list(text: str, aggressive: bool) -> list[str]:
    if ";" in text or not aggressive:
        return [text]
    if not re.search(r"\b(and|or)\b", text, re.I) and text.count(",") < 2:
        return [text]
    pattern = r",\s+(?=(?:an?|the|valid|official|certified|military|passport|birth|naturalization|driver|state|federal|record|identification|document|proof)\b)"
    parts = [part.strip() for part in re.split(pattern, text) if part and part.strip()]
    if len(parts) <= 1:
        return [text]

    expanded: list[str] = []
    for part in parts:
        inner = re.split(
            r"\s+(?:or|and)\s+(?=(?:an?|the|valid|official|certified|military|passport|birth|naturalization|driver|state|federal|record|identification|document|proof)\b)",
            part,
            flags=re.I,
        )
        expanded.extend(piece.strip() for piece in inner if piece and piece.strip())
    return expanded if len(expanded) > 1 else parts


def _split_lead_clause(text: str) -> list[dict[str, object]]:
    normalized = text.strip()
    match = _LEAD_CLAUSE_RE.match(normalized)
    if not match:
        cleaned = _normalize_fragment(normalized)
        return [_fragment(_ensure_terminal_punctuation(cleaned))] if cleaned else []

    lead = _normalize_fragment(match.group("lead"))
    trail = _normalize_fragment(match.group("trail"))
    lead_role = "CONDITION" if _CONDITION_RE.search(lead) else "EXCEPTION"
    fragments: list[dict[str, object]] = []
    if lead:
        fragments.append(_fragment(_ensure_terminal_punctuation(lead), lead_role, force_child=True))
    if trail:
        fragments.append(_fragment(_ensure_terminal_punctuation(trail), "CONSEQUENCE", force_child=True))
    return fragments


def _split_list_items(text: str, hint_role: Optional[str], aggressive: bool) -> list[dict[str, object]]:
    fragments: list[dict[str, object]] = []
    chunks = _extract_clause_spans(text) or [text]
    for chunk in chunks:
        semicolon_parts = _split_semicolons(chunk)
        for part in semicolon_parts:
            comma_parts = _split_comma_list(part, aggressive)
            for item in comma_parts:
                cleaned = _normalize_fragment(item)
                if cleaned:
                    fragments.append(_fragment(_ensure_terminal_punctuation(cleaned), hint_role, force_child=True))
    return fragments


def _split_list_intro(text: str, aggressive: bool) -> list[dict[str, object]]:
    normalized = text.strip()
    match = _LIST_INTRO_RE.match(normalized)
    if match:
        prefix = _normalize_fragment(match.group("prefix"))
        intro = match.group("intro")
        rest = match.group("rest").lstrip(": ").strip()
        hint_role = _hint_role_from_intro(prefix, intro)
        if rest and (aggressive or ";" in rest or _find_clause_marker_positions(rest) or rest.count(",") >= 2):
            fragments = [_fragment(_ensure_terminal_punctuation(prefix))] if prefix else []
            fragments.extend(_split_list_items(rest, hint_role, aggressive))
            if len(fragments) > 1:
                return fragments

    if ":" in normalized:
        prefix, rest = normalized.split(":", 1)
        prefix = _normalize_fragment(prefix)
        rest = rest.strip()
        hint_role = _hint_role_from_intro(prefix, "including")
        if rest and (aggressive or ";" in rest or _find_clause_marker_positions(rest) or rest.count(",") >= 2):
            fragments = [_fragment(_ensure_terminal_punctuation(prefix))] if prefix else []
            fragments.extend(_split_list_items(rest, hint_role, aggressive))
            if len(fragments) > 1:
                return fragments

    cleaned = _normalize_fragment(normalized)
    if not cleaned:
        return []
    if _is_boilerplate(cleaned):
        return [_fragment(_ensure_terminal_punctuation(cleaned), "BOILERPLATE", force_child=True)]
    return [_fragment(_ensure_terminal_punctuation(cleaned))]


def _explode_fragments(text: str, aggressive: bool) -> list[dict[str, object]]:
    fragments: list[dict[str, object]] = []
    for sentence in sse_extract(text):
        clause_spans = _extract_clause_spans(sentence) or [sentence]
        for clause in clause_spans:
            for semicolon_part in _split_semicolons(clause):
                for obligation_part in _split_multiple_obligations(semicolon_part):
                    for clause_part in _split_lead_clause(obligation_part):
                        list_fragments = _split_list_intro(str(clause_part["text"]), aggressive)
                        if clause_part.get("hint_role") or clause_part.get("force_child"):
                            for list_fragment in list_fragments:
                                if not list_fragment.get("hint_role") and clause_part.get("hint_role"):
                                    list_fragment["hint_role"] = clause_part.get("hint_role")
                                if clause_part.get("force_child"):
                                    list_fragment["force_child"] = True
                        fragments.extend(list_fragments)

    final_fragments: list[dict[str, object]] = []
    for fragment in fragments:
        normalized = _normalize_fragment(fragment["text"] or "")
        if not normalized:
            continue
        if _is_boilerplate(normalized):
            continue
        cleaned = _ensure_terminal_punctuation(normalized)
        if len(cleaned) > MAX_NODE_CHARS and "," in cleaned:
            for piece in _split_comma_list(cleaned, aggressive=True):
                piece = _normalize_fragment(piece)
                if piece and not _is_boilerplate(piece):
                    final_fragments.append(_fragment(
                        _ensure_terminal_punctuation(piece),
                        fragment.get("hint_role"),
                        force_child=bool(fragment.get("force_child", False)),
                    ))
            continue
        final_fragments.append(_fragment(
            cleaned,
            fragment.get("hint_role"),
            force_child=bool(fragment.get("force_child", False)),
        ))
    return final_fragments


def _fallback_groups(fragments: list[dict[str, object]]) -> list[dict[str, list[dict[str, object]]]]:
    if not fragments:
        return []

    parent_index: Optional[int] = None
    for index, fragment in enumerate(fragments):
        if _is_primary_candidate(str(fragment["text"] or "")):
            parent_index = index
            break
    if parent_index is None:
        for index, fragment in enumerate(fragments):
            if fragment.get("hint_role") in {"CONSEQUENCE", "EVIDENCE", "DEFINITION"}:
                parent_index = index
                break
    if parent_index is None:
        for index, fragment in enumerate(fragments):
            if not _is_boilerplate(str(fragment["text"] or "")):
                parent_index = index
                break
    if parent_index is None:
        parent_index = 0

    parent = _fragment(str(fragments[parent_index]["text"] or ""), fragments[parent_index].get("hint_role"))
    children = [fragment for index, fragment in enumerate(fragments) if index != parent_index]
    return [{"parent": parent, "children": children}]


def _build_section_groups(text: str, aggressive: bool) -> list[dict[str, list[dict[str, object]]]]:
    fragments = _explode_fragments(text, aggressive=aggressive)
    if not fragments:
        return []

    groups: list[dict[str, list[dict[str, object]]]] = []
    pending_children: list[dict[str, object]] = []
    current_group: Optional[dict[str, list[dict[str, object]]]] = None

    for fragment in fragments:
        fragment_text = str(fragment["text"] or "")
        if not bool(fragment.get("force_child", False)) and _is_primary_candidate(fragment_text):
            if current_group:
                groups.append(current_group)
            current_group = {"parent": _fragment(fragment_text), "children": []}
            if pending_children:
                current_group["children"].extend(pending_children)
                pending_children = []
            continue

        if current_group:
            current_group["children"].append(fragment)
        else:
            pending_children.append(fragment)

    if current_group:
        groups.append(current_group)

    if pending_children:
        if groups:
            groups[0]["children"] = pending_children + groups[0]["children"]
        else:
            groups = _fallback_groups(pending_children)

    return groups


def _base_span_from_anchor(anchor: str) -> tuple[int, int]:
    match = re.match(r"char:(\d+)-(\d+)$", anchor)
    if not match:
        return 0, 0
    return int(match.group(1)), int(match.group(2))


def _span_for_text(section_text: str, fragment_text: str, anchor: str, offset: int) -> tuple[int, int, int]:
    base_start, _ = _base_span_from_anchor(anchor)
    local_start = section_text.find(fragment_text, offset)
    if local_start == -1:
        local_start = offset
    local_end = local_start + len(fragment_text)
    return base_start + local_start, base_start + local_end, local_end


def _record_node_error(node: StructureNode, message: str) -> None:
    if message not in node.validation_errors:
        node.validation_errors.append(message)
    node.validation_status = "invalid"


def _make_issue(
    section_id: str,
    issue_type: str,
    message: str,
    *,
    node_id: Optional[str] = None,
) -> StructureValidationIssue:
    return StructureValidationIssue(
        section_id=section_id,
        issue_type=issue_type,
        message=message,
        node_id=node_id,
    )


def filter_visible_nodes(nodes: list[StructureNode]) -> list[StructureNode]:
    return [node for node in nodes if node.role != "BOILERPLATE"]


def filterVisibleNodes(nodes: list[StructureNode]) -> list[StructureNode]:
    return filter_visible_nodes(nodes)


def validateSection(
    section_nodes: list[StructureNode],
    visible_nodes: Optional[list[StructureNode]] = None,
) -> list[StructureValidationIssue]:
    if not section_nodes:
        return []

    issues: list[StructureValidationIssue] = []
    section_id = section_nodes[0].section_id
    visible_section_nodes = visible_nodes if visible_nodes is not None else section_nodes
    parents = [node for node in visible_section_nodes if node.role == "PRIMARY_RULE"]
    if not parents and visible_section_nodes and all(
        _is_non_substantive_fragment(node.normalized_text) for node in visible_section_nodes
    ):
        return []

    if len(parents) == 0:
        message = f"{section_id}: missing PRIMARY_RULE"
        issues.append(_make_issue(section_id, "missing_primary", message))
        for node in visible_section_nodes:
            _record_node_error(node, message)
        return issues

    if len(parents) > 1:
        message = f"{section_id}: multiple PRIMARY_RULE nodes detected"
        issues.append(_make_issue(section_id, "multiple_primary", message))
        for node in visible_section_nodes:
            _record_node_error(node, message)
        return issues

    parent = parents[0]
    if not _is_atomic_parent(parent.normalized_text):
        message = f"{section_id}: {parent.node_id} exceeds atomic parent constraints"
        issues.append(_make_issue(section_id, "oversized_node", message, node_id=parent.node_id))
        _record_node_error(parent, message)

    for node in visible_section_nodes:
        if node.role == "BOILERPLATE":
            message = f"{section_id}: visible boilerplate leaked into output"
            issues.append(_make_issue(section_id, "boilerplate_leak", message, node_id=node.node_id))
            _record_node_error(node, message)

        if len(node.normalized_text) > MAX_NODE_LENGTH or not _is_atomic_node(node.normalized_text):
            message = f"{section_id}: {node.node_id} is oversized or non-atomic"
            issues.append(_make_issue(section_id, "oversized_node", message, node_id=node.node_id))
            _record_node_error(node, message)

        if not node.role:
            message = f"{section_id}: {node.node_id} is unclassified"
            issues.append(_make_issue(section_id, "unclassified_node", message, node_id=node.node_id))
            _record_node_error(node, message)

        if node.role == "PRIMARY_RULE":
            continue

        if node.parent_id != parent.node_id:
            message = f"{section_id}: {node.node_id} is unattached"
            issues.append(_make_issue(section_id, "unattached_child", message, node_id=node.node_id))
            _record_node_error(node, message)

    return issues


def _validate_sections(nodes: list[StructureNode]) -> list[StructureValidationIssue]:
    issues: list[StructureValidationIssue] = []
    grouped: dict[str, list[StructureNode]] = {}
    for node in nodes:
        grouped.setdefault(node.section_id, []).append(node)

    visible_grouped: dict[str, list[StructureNode]] = {}
    for node in filter_visible_nodes(nodes):
        visible_grouped.setdefault(node.section_id, []).append(node)

    for section_id, section_nodes in grouped.items():
        issues.extend(validateSection(section_nodes, visible_grouped.get(section_id, [])))

    return issues


# ---------------------------------------------------------------------------
# ISC - Information Set Construction (assembles nodes)
# ---------------------------------------------------------------------------

def _build_node(
    idx: int,
    section_id: str,
    text: str,
    anchor: str,
    role: str,
    *,
    parent_id: Optional[str] = None,
    depth: int = 0,
    source_span_start: Optional[int] = None,
    source_span_end: Optional[int] = None,
    validation_status: str = "valid",
    validation_errors: Optional[list[str]] = None,
) -> StructureNode:
    normalized = lns_normalize(text)
    blocked = cfs_check(normalized)
    w5h1 = extract_5w1h(normalized)
    aac = aac_extract(normalized)
    temporal = tps_extract(normalized)
    jurisdiction = sjm_extract(normalized)
    mechanism = mps_extract(normalized)
    risk = rds_extract(normalized)

    tags: list[str] = [f"role:{role.lower()}"]
    if role == "BOILERPLATE":
        tags.append("hidden_by_default")
    if aac["actor"]:
        tags.append("has_actor")
    if temporal:
        tags.append("has_temporal")
    if jurisdiction:
        tags.append("has_jurisdiction")
    if mechanism:
        tags.append("has_mechanism")

    return StructureNode(
        node_id=f"node-{idx:04d}",
        section_id=section_id,
        parent_id=parent_id,
        role=role,
        depth=depth,
        source_span_start=source_span_start,
        source_span_end=source_span_end,
        validation_status=validation_status,
        validation_errors=validation_errors or [],
        source_anchor=anchor,
        source_text=text,
        normalized_text=normalized,
        actor=aac["actor"],
        action=aac["action"],
        condition=aac["condition"],
        temporal=temporal,
        jurisdiction=jurisdiction,
        mechanism=mechanism,
        risk=risk if any(risk.values()) else None,
        tags=tags,
        blocked_flags=blocked,
        who=w5h1["who"],
        what=w5h1["what"],
        when=w5h1["when"],
        where=w5h1["where"],
        why=w5h1["why"],
        how=w5h1["how"],
    )


def _parse_section(
    section_index: int,
    text: str,
    anchor: str,
    node_start_index: int,
    *,
    aggressive: bool,
) -> tuple[list[StructureNode], int]:
    normalized = lns_normalize(text)
    if not normalized:
        return [], node_start_index

    groups = _build_section_groups(normalized, aggressive=aggressive)
    if not groups:
        return [], node_start_index

    nodes: list[StructureNode] = []
    next_index = node_start_index

    for group_index, group in enumerate(groups):
        section_id = f"section-{section_index:04d}-{group_index:02d}"
        parent_text = _ensure_terminal_punctuation(_normalize_fragment(group["parent"]["text"] or ""))
        if not _is_atomic_node(parent_text):
            raise ValueError(f"{section_id}: non-atomic parent candidate reached classification")
        parent_start, parent_end, search_offset = _span_for_text(normalized, parent_text, anchor, 0)
        parent_role = _fragment_role(parent_text, group["parent"].get("hint_role"))
        parent_node = _build_node(
            next_index,
            section_id,
            parent_text,
            f"{anchor}#p{group_index}",
            parent_role,
            depth=0,
            source_span_start=parent_start,
            source_span_end=parent_end,
        )
        if parent_role != "PRIMARY_RULE" and "fragment:incomplete" not in parent_node.tags:
            parent_node.tags.append("fragment:incomplete")
        next_index += 1

        child_nodes: list[StructureNode] = []
        for child_index, fragment in enumerate(group["children"]):
            child_text = _ensure_terminal_punctuation(_normalize_fragment(fragment["text"] or ""))
            if not child_text or child_text == parent_text:
                continue
            if not _is_atomic_node(child_text):
                raise ValueError(f"{section_id}: non-atomic child reached classification")
            role = _classify_child(child_text, fragment["hint_role"], parent_text)
            child_start, child_end, search_offset = _span_for_text(normalized, child_text, anchor, search_offset)
            child_node = _build_node(
                next_index,
                section_id,
                child_text,
                f"{anchor}#p{group_index}-c{child_index}",
                role,
                parent_id=parent_node.node_id,
                depth=1,
                source_span_start=child_start,
                source_span_end=child_end,
            )
            next_index += 1
            child_nodes.append(child_node)

        nodes.append(parent_node)
        nodes.extend(child_nodes)

    return nodes, next_index


def _parse_with_validation(
    section_index: int,
    text: str,
    anchor: str,
    node_start_index: int,
) -> tuple[list[StructureNode], int, list[StructureValidationIssue], bool]:
    try:
        nodes, next_index = _parse_section(
            section_index,
            text,
            anchor,
            node_start_index,
            aggressive=False,
        )
    except ValueError as exc:
        logger.info("Atomicity guard triggered for section %s: %s", section_index, exc)
        nodes, next_index = [], node_start_index
    validation_issues = _validate_sections(nodes)
    if not nodes:
        validation_issues = [
            _make_issue(
                f"section-{section_index:04d}-00",
                "missing_primary",
                f"section-{section_index:04d}-00: parser produced no visible atomic PRIMARY_RULE",
            )
        ]
    if not validation_issues:
        return nodes, next_index, [], False

    try:
        reparsed_nodes, reparsed_next_index = _parse_section(
            section_index,
            text,
            anchor,
            node_start_index,
            aggressive=True,
        )
    except ValueError as exc:
        logger.warning("Aggressive atomicity guard triggered for section %s: %s", section_index, exc)
        reparsed_nodes, reparsed_next_index = [], node_start_index
    reparse_issues = _validate_sections(reparsed_nodes)
    if not reparsed_nodes:
        reparse_issues = [
            _make_issue(
                f"section-{section_index:04d}-00",
                "missing_primary",
                f"section-{section_index:04d}-00: aggressive reparse produced no visible atomic PRIMARY_RULE",
            )
        ]
    if not reparse_issues:
        for node in reparsed_nodes:
            if node.validation_status == "valid":
                node.validation_status = "repaired"
        logger.info("Aggressive hierarchy reparse succeeded for section %s", section_index)
        return reparsed_nodes, reparsed_next_index, validation_issues, True

    logger.warning("Hierarchy validation still failing for section %s", section_index)
    return reparsed_nodes, reparsed_next_index, reparse_issues, False


# ---------------------------------------------------------------------------
# Text extraction per content type
# ---------------------------------------------------------------------------

def _block_anchors_from_text(content: str) -> list[dict[str, str]]:
    normalized = content.replace("\r\n", "\n").replace("\r", "\n")
    parts = [part.strip() for part in re.split(r"\n{2,}", normalized) if part and part.strip()]
    if not parts:
        parts = [normalized.strip()] if normalized.strip() else []

    results: list[dict[str, str]] = []
    offset = 0
    for part in parts:
        start = normalized.find(part, offset)
        if start == -1:
            start = offset
        results.append({"text": part, "anchor": f"char:{start}-{start + len(part)}"})
        offset = start + len(part)
    return results


def _extract_sections_text(content: str) -> list[dict[str, str]]:
    return _block_anchors_from_text(content)


def _extract_sections_html(content: str) -> list[dict[str, str]]:
    soup = BeautifulSoup(content, "html.parser")
    block_tags = {
        "p", "h1", "h2", "h3", "h4", "h5", "h6",
        "li", "td", "th", "blockquote", "figcaption",
        "dt", "dd", "caption", "title",
    }

    results: list[dict[str, str]] = []
    seen_texts: set[str] = set()
    blocks = soup.find_all(block_tags)

    if blocks:
        for index, block in enumerate(blocks):
            text = lns_normalize(block.get_text(separator=" "))
            if not text or text in seen_texts:
                continue
            seen_texts.add(text)
            results.append({"text": text, "anchor": f"html:{block.name}[{index}]"})
    else:
        text = lns_normalize(soup.get_text(separator="\n"))
        if text:
            results = [{"text": text, "anchor": "html:document"}]

    return results


def _extract_sections_xml(content: str) -> list[dict[str, str]]:
    try:
        root = ET.fromstring(content)
    except ET.ParseError:
        return []

    results: list[dict[str, str]] = []
    for index, elem in enumerate(root.iter()):
        if elem.text and elem.text.strip():
            results.append({"text": elem.text.strip(), "anchor": f"xpath:{elem.tag}[{index}]"})
    return results


def _extract_sections_json(content: str) -> list[dict[str, str]]:
    try:
        data = json.loads(content)
    except json.JSONDecodeError:
        return []

    results: list[dict[str, str]] = []
    _walk_json(data, "$", results)
    return results


def _walk_json(obj: object, path: str, out: list[dict[str, str]]) -> None:
    if isinstance(obj, str) and obj.strip():
        out.append({"text": obj.strip(), "anchor": f"jsonpath:{path}"})
    elif isinstance(obj, dict):
        for key, value in obj.items():
            _walk_json(value, f"{path}.{key}", out)
    elif isinstance(obj, list):
        for index, value in enumerate(obj):
            _walk_json(value, f"{path}[{index}")


# ---------------------------------------------------------------------------
# Public entry point
# ---------------------------------------------------------------------------

def process_structure(input_result: InputResult) -> StructureResult:
    """Parse, classify, and enforce hierarchy from input. Deterministic only."""
    if input_result.parse_status == "error":
        return StructureResult(
            nodes=[],
            node_count=0,
            section_count=0,
            validation_report=StructureValidationReport(status="clean", issues=[], repaired_sections=[]),
        )

    content = input_result.raw_content
    content_type = ContentType(input_result.content_type)
    extractors = {
        ContentType.text: _extract_sections_text,
        ContentType.html: _extract_sections_html,
        ContentType.xml: _extract_sections_xml,
        ContentType.json: _extract_sections_json,
    }

    raw_sections = extractors[content_type](content)

    internal_nodes: list[StructureNode] = []
    validation_issues: list[StructureValidationIssue] = []
    repaired_sections: list[str] = []
    next_index = 0

    for section_index, section in enumerate(raw_sections):
        section_nodes, next_index, section_issues, was_repaired = _parse_with_validation(
            section_index,
            section["text"],
            section["anchor"],
            next_index,
        )
        internal_nodes.extend(section_nodes)
        validation_issues.extend(section_issues)
        if section_issues:
            logger.warning(
                "Section %s validation issues: %s",
                section_index,
                ", ".join(issue.issue_type for issue in section_issues),
            )
        if was_repaired:
            repaired_sections.extend(sorted({node.section_id for node in section_nodes}))

    nodes = filterVisibleNodes(internal_nodes)
    filtered_boilerplate = len(internal_nodes) - len(nodes)
    if filtered_boilerplate:
        logger.info("Filtered %s boilerplate nodes from visible structure output", filtered_boilerplate)
    section_count = len({node.section_id for node in nodes})
    validation_status = "clean"
    if validation_issues and repaired_sections:
        validation_status = "repaired"
    elif validation_issues:
        validation_status = "failed"
    if any(node.validation_status == "invalid" for node in internal_nodes):
        validation_status = "failed"
    return StructureResult(
        nodes=nodes,
        node_count=len(nodes),
        section_count=section_count,
        validation_report=StructureValidationReport(
            status=validation_status,
            issues=validation_issues,
            repaired_sections=sorted(set(repaired_sections)),
        ),
    )
