"""Structure layer: deterministic parsing and normalization. No AI."""

from __future__ import annotations

import json
import re
import xml.etree.ElementTree as ET
from typing import Optional

from bs4 import BeautifulSoup

from app.schemas.models import ContentType, InputResult, StructureNode, StructureResult


# ---------------------------------------------------------------------------
# LNS – Language Normalization System (deterministic text cleanup)
# ---------------------------------------------------------------------------

def lns_normalize(text: str) -> str:
    """Deterministic whitespace/line normalization. No semantic rewriting."""
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


# ---------------------------------------------------------------------------
# SSE – Source Statement Extraction
# ---------------------------------------------------------------------------

# Abbreviations that should NOT trigger sentence splits
_ABBREVIATIONS = {
    "v", "vs", "mr", "mrs", "ms", "dr", "jr", "sr", "inc", "corp", "ltd",
    "co", "no", "nos", "st", "ave", "blvd", "dept", "div", "est", "govt",
    "assn", "bros", "gen", "gov", "hon", "prof", "rep", "sen", "sgt",
    "etc", "al", "approx", "dept", "fig", "op", "vol", "rev", "ed",
}


def sse_extract(text: str) -> list[dict[str, str]]:
    """Split text into explicit statement spans with source anchors.

    Uses a two-pass approach: first split on sentence-ending punctuation
    followed by whitespace and a capital letter, then re-join splits that
    were caused by abbreviations (e.g. 'v.', 'No.', 'Inc.').
    """
    # Split on period/!/?  followed by whitespace and uppercase
    raw_parts = re.split(r"(?<=[.!?])\s+(?=[A-Z])", text)

    # Re-join parts where the previous part ends with a known abbreviation
    merged: list[str] = []
    for part in raw_parts:
        if merged:
            prev = merged[-1]
            # Check if the previous chunk ends with "abbrev."
            m = re.search(r"\b(\w+)\.\s*$", prev)
            if m and m.group(1).lower() in _ABBREVIATIONS:
                merged[-1] = prev + " " + part
                continue
        merged.append(part)

    results = []
    offset = 0
    for sent in merged:
        sent = sent.strip()
        if not sent:
            continue
        start = text.find(sent, offset)
        if start == -1:
            start = offset
        anchor = f"char:{start}-{start + len(sent)}"
        results.append({"text": sent, "anchor": anchor})
        offset = start + len(sent)
    return results


# ---------------------------------------------------------------------------
# CFS – Constraint Filter System
# ---------------------------------------------------------------------------

_INTENT_PATTERNS = [
    re.compile(r"\b(intend(?:s|ed)?|aim(?:s|ed)?|goal is)\b", re.I),
]
_EMOTION_PATTERNS = [
    re.compile(r"\b(feel(?:s|ing)?|happy|sad|angry|fear(?:ful|s)?|love(?:s|d)?)\b", re.I),
]
_CAUSAL_PATTERNS = [
    re.compile(r"\b(because of|caused by|due to|therefore|consequently)\b", re.I),
]
_NARRATIVE_PATTERNS = [
    re.compile(r"\b(once upon a time|in a story|narrative|tale)\b", re.I),
]


def cfs_check(text: str) -> list[str]:
    """Return list of blocked flag names if violations detected."""
    flags = []
    for p in _INTENT_PATTERNS:
        if p.search(text):
            flags.append("intent_attribution")
            break
    for p in _EMOTION_PATTERNS:
        if p.search(text):
            flags.append("emotional_labeling")
            break
    for p in _CAUSAL_PATTERNS:
        if p.search(text):
            flags.append("causal_inference")
            break
    for p in _NARRATIVE_PATTERNS:
        if p.search(text):
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
_WHERE_RE = re.compile(
    r"\bin\s+((?:[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*))\b",
)


def extract_5w1h(text: str) -> dict[str, Optional[str]]:
    who = _WHO_RE.search(text)
    when = _WHEN_RE.search(text)
    where = _WHERE_RE.search(text)
    return {
        "who": who.group(1) if who else None,
        "what": None,  # requires full parse; left explicit null
        "when": when.group(1) if when else None,
        "where": where.group(1) if where else None,
        "why": None,
        "how": None,
    }


# ---------------------------------------------------------------------------
# AAC – Actor / Action / Condition
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
        text, re.I,
    )
    if verb_match:
        action = verb_match.group(0)

    cond_match = re.search(r"\b(if|unless|provided that|on condition that|where)\b(.{1,80}?)(?:[.,;]|$)", text, re.I)
    if cond_match:
        condition = cond_match.group(0).strip().rstrip(".,;")

    return {"actor": actor, "action": action, "condition": condition}


# ---------------------------------------------------------------------------
# TPS – Temporal Parsing System
# ---------------------------------------------------------------------------

_TEMPORAL_RE = re.compile(
    r"\b(deadline|by\s+\w+\s+\d{1,2}|before\s+\w+\s+\d{1,2}|within\s+\d+\s+days|effective\s+\w+\s+\d{1,2}|no later than|prior to|after\s+\w+\s+\d{1,2}|\d{4}-\d{2}-\d{2})\b",
    re.I,
)


def tps_extract(text: str) -> Optional[str]:
    m = _TEMPORAL_RE.search(text)
    return m.group(0) if m else None


# ---------------------------------------------------------------------------
# SJM – System / Jurisdiction Mapping
# ---------------------------------------------------------------------------

_JURISDICTION_RE = re.compile(
    r"\b(federal|state|national|municipal|county|district|court|SEC|FDA|EPA|FCC|FERC|NERC|Congress|Senate|House|EU|UN)\b",
    re.I,
)


def sjm_extract(text: str) -> Optional[str]:
    m = _JURISDICTION_RE.search(text)
    return m.group(0) if m else None


# ---------------------------------------------------------------------------
# MPS – Mechanism Parsing System
# ---------------------------------------------------------------------------

_MECHANISM_RE = re.compile(
    r"\b(enforce(?:ment|d|s)?|penalty|fine|audit|inspection|compliance|regulation|rule|statute|code|procedure|process|protocol)\b",
    re.I,
)


def mps_extract(text: str) -> Optional[str]:
    m = _MECHANISM_RE.search(text)
    return m.group(0) if m else None


# ---------------------------------------------------------------------------
# RDS – Risk Decomposition System
# ---------------------------------------------------------------------------

_LIKELIHOOD_RE = re.compile(r"\b(likely|unlikely|probable|improbable|possible|certain|risk of)\b", re.I)
_IMPACT_RE = re.compile(r"\b(severe|minor|significant|catastrophic|negligible|major|critical|high impact|low impact)\b", re.I)


def rds_extract(text: str) -> dict[str, Optional[str]]:
    lk = _LIKELIHOOD_RE.search(text)
    imp = _IMPACT_RE.search(text)
    return {
        "likelihood": lk.group(0) if lk else None,
        "impact": imp.group(0) if imp else None,
    }


# ---------------------------------------------------------------------------
# ISC – Information Set Construction (assembles nodes)
# ---------------------------------------------------------------------------

def _build_node(idx: int, text: str, anchor: str) -> StructureNode:
    normalized = lns_normalize(text)
    blocked = cfs_check(normalized)
    w5h1 = extract_5w1h(normalized)
    aac = aac_extract(normalized)
    temporal = tps_extract(normalized)
    jurisdiction = sjm_extract(normalized)
    mechanism = mps_extract(normalized)
    risk = rds_extract(normalized)

    tags: list[str] = []
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


# ---------------------------------------------------------------------------
# Text extraction per content type
# ---------------------------------------------------------------------------

def _extract_statements_text(content: str) -> list[dict[str, str]]:
    return sse_extract(content)


def _extract_statements_html(content: str) -> list[dict[str, str]]:
    """Extract statements from HTML by iterating block-level elements individually.

    Instead of dumping all text and splitting by sentence boundaries (which
    merges titles with first paragraphs), we extract text from each block
    element separately, then apply sentence splitting within each block.
    """
    soup = BeautifulSoup(content, "html.parser")
    _BLOCK_TAGS = {
        "p", "h1", "h2", "h3", "h4", "h5", "h6",
        "li", "td", "th", "blockquote", "figcaption",
        "dt", "dd", "caption", "title",
    }

    results: list[dict[str, str]] = []
    seen_texts: set[str] = set()

    # First pass: collect text from block-level elements
    blocks = soup.find_all(_BLOCK_TAGS)

    if blocks:
        for block in blocks:
            text = block.get_text(separator=" ").strip()
            if not text or text in seen_texts:
                continue
            seen_texts.add(text)
            # Apply sentence splitting within this block
            sentences = sse_extract(text)
            results.extend(sentences)
    else:
        # Fallback: no block elements found, use full text extraction
        text = soup.get_text(separator="\n")
        results = sse_extract(text)

    return results


def _extract_statements_xml(content: str) -> list[dict[str, str]]:
    try:
        root = ET.fromstring(content)
    except ET.ParseError:
        return []
    results = []
    for idx, elem in enumerate(root.iter()):
        if elem.text and elem.text.strip():
            tag_path = elem.tag
            anchor = f"xpath:{tag_path}[{idx}]"
            results.append({"text": elem.text.strip(), "anchor": anchor})
    return results


def _extract_statements_json(content: str) -> list[dict[str, str]]:
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
        for k, v in obj.items():
            _walk_json(v, f"{path}.{k}", out)
    elif isinstance(obj, list):
        for i, v in enumerate(obj):
            _walk_json(v, f"{path}[{i}]", out)


# ---------------------------------------------------------------------------
# Public entry point
# ---------------------------------------------------------------------------

def process_structure(input_result: InputResult) -> StructureResult:
    """Parse and normalize structure from input. Deterministic only."""
    if input_result.parse_status == "error":
        return StructureResult(nodes=[], node_count=0)

    content = input_result.raw_content
    ct = ContentType(input_result.content_type)

    extractors = {
        ContentType.text: _extract_statements_text,
        ContentType.html: _extract_statements_html,
        ContentType.xml: _extract_statements_xml,
        ContentType.json: _extract_statements_json,
    }

    statements = extractors[ct](content)

    nodes = [_build_node(i, s["text"], s["anchor"]) for i, s in enumerate(statements)]

    return StructureResult(nodes=nodes, node_count=len(nodes))
