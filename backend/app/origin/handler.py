"""Origin layer: provenance / source tracing and document anchoring only.

No credibility judgment. No truth claims. No intent claims.
"""

from __future__ import annotations

import json
import re
import xml.etree.ElementTree as ET
from typing import Optional

from bs4 import BeautifulSoup

from app.schemas.models import (
    ContentType,
    InputResult,
    OriginResult,
    OriginSignal,
    StructureResult,
)

_BILL_MARKER_RE = re.compile(
    r"^(?:h\.?\s*r\.?\s*\d+\.?|s\.?\s*\d+\.?|h\.?\s*res\.?\s*\d+\.?|s\.?\s*res\.?\s*\d+\.?)$",
    re.I,
)
_HEADER_LABEL_RE = re.compile(
    r"^(?:h\.?|r\.?|\d+\.?|an act\.?|a bill\.?|be it enacted\.?|and\.?|or\.?)$",
    re.I,
)
_CITATION_TITLE_RE = re.compile(
    r"\b(?:may be cited as|short title|table of contents|this act)\b",
    re.I,
)
_LABEL_VALUE_RE = re.compile(r"^\s*([A-Za-z][A-Za-z0-9 _/-]{1,60})\s*:\s*(.+?)\s*$")

_TEXT_IDENTITY_LABELS = {
    "source system": "source_system",
    "source": "source",
    "publisher": "publisher",
    "organization": "organization",
    "author": "author",
    "creator": "creator",
    "bill number": "bill_number",
    "record id": "record_id",
    "official record id": "record_id",
    "canonical url": "canonical_url",
    "source url": "source_url",
    "url": "source_url",
}
_TEXT_METADATA_LABELS = {
    "document title": "title",
    "title": "title",
    "document type": "content_type",
    "content type": "content_type",
    "session": "session",
    "version": "version",
    "published date": "publish_timestamp",
    "publication date": "publish_timestamp",
    "date published": "publish_timestamp",
    "created date": "created_timestamp",
    "date": "date",
}
_TEXT_DISTRIBUTION_LABELS = {
    "platform": "platform",
    "distribution platform": "platform",
    "og title": "og:title",
    "twitter title": "twitter:title",
}


def _extract_html_origin(content: str) -> dict:
    soup = BeautifulSoup(content, "html.parser")
    identity: list[OriginSignal] = []
    metadata: list[OriginSignal] = []
    distribution: list[OriginSignal] = []
    trace: list[str] = []

    canonical = soup.find("link", rel="canonical")
    if canonical and canonical.get("href"):
        identity.append(OriginSignal(signal="canonical_url", value=canonical["href"]))
        trace.append("canonical_url -> HTML canonical link")

    title_tag = soup.find("title")
    if title_tag and title_tag.string:
        metadata.append(OriginSignal(signal="title", value=title_tag.string.strip()))
        trace.append("title -> HTML <title> element")

    for meta in soup.find_all("meta"):
        name = (meta.get("name") or meta.get("property") or "").lower()
        content_val = meta.get("content", "")
        if not content_val:
            continue

        if name == "author":
            identity.append(OriginSignal(signal="author", value=content_val))
            trace.append("author -> HTML meta tag")
        elif name in ("article:published_time", "date", "pubdate"):
            metadata.append(OriginSignal(signal="publish_timestamp", value=content_val))
            trace.append(f"timestamp -> HTML meta tag ({name})")
        elif name.startswith("og:"):
            distribution.append(OriginSignal(signal=name, value=content_val, category="opengraph"))
            trace.append(f"{name} -> Open Graph meta tag")
        elif name.startswith("twitter:"):
            distribution.append(OriginSignal(signal=name, value=content_val, category="twitter_card"))
            trace.append(f"{name} -> Twitter card meta tag")

    for script in soup.find_all("script", type="application/ld+json"):
        try:
            ld = json.loads(script.string or "")
            if isinstance(ld, dict):
                pub = ld.get("publisher")
                if isinstance(pub, dict):
                    identity.append(OriginSignal(signal="jsonld_publisher", value=pub.get("name", str(pub))))
                    trace.append("publisher -> JSON-LD structured data")
                if ld.get("headline"):
                    metadata.append(OriginSignal(signal="title", value=ld["headline"]))
                    trace.append("title -> JSON-LD structured data (headline)")
                if ld.get("@type"):
                    metadata.append(OriginSignal(signal="jsonld_type", value=ld["@type"]))
                    trace.append("content_type -> JSON-LD @type")
        except (json.JSONDecodeError, TypeError):
            pass

    return {"identity": identity, "metadata": metadata, "distribution": distribution, "trace": trace}


def _extract_json_origin(content: str) -> dict:
    identity: list[OriginSignal] = []
    metadata: list[OriginSignal] = []
    trace: list[str] = []

    try:
        data = json.loads(content)
    except json.JSONDecodeError:
        return {"identity": [], "metadata": [], "distribution": [], "trace": ["JSON parse failed"]}

    if not isinstance(data, dict):
        return {"identity": identity, "metadata": metadata, "distribution": [], "trace": trace}

    source_keys = {"publisher", "source", "author", "creator", "organization"}
    time_keys = {"timestamp", "date", "published", "created", "published_at", "created_at"}
    title_keys = {"title", "headline", "document_title"}

    for key, val in data.items():
        lk = key.lower()
        if lk in source_keys and isinstance(val, str):
            identity.append(OriginSignal(signal=lk, value=val))
            trace.append(f"{lk} -> JSON top-level key ({key})")
        elif lk in time_keys and isinstance(val, str):
            metadata.append(OriginSignal(signal=lk, value=val))
            trace.append(f"timestamp -> JSON top-level key ({key})")
        elif lk in title_keys and isinstance(val, str):
            metadata.append(OriginSignal(signal="title", value=val))
            trace.append(f"title -> JSON top-level key ({key})")

    return {"identity": identity, "metadata": metadata, "distribution": [], "trace": trace}


def _extract_xml_origin(content: str) -> dict:
    identity: list[OriginSignal] = []
    metadata: list[OriginSignal] = []
    trace: list[str] = []

    try:
        root = ET.fromstring(content)
    except ET.ParseError:
        return {"identity": [], "metadata": [], "distribution": [], "trace": ["XML parse failed"]}

    source_tags = {"publisher", "source", "author", "creator"}
    time_tags = {"date", "timestamp", "published", "created"}
    title_tags = {"title", "headline", "documenttitle"}

    for elem in root.iter():
        tag = elem.tag.lower().split("}")[-1] if "}" in elem.tag else elem.tag.lower()
        text = (elem.text or "").strip()
        if not text:
            continue
        if tag in source_tags:
            identity.append(OriginSignal(signal=tag, value=text))
            trace.append(f"{tag} -> XML element ({elem.tag})")
        elif tag in time_tags:
            metadata.append(OriginSignal(signal=tag, value=text))
            trace.append(f"timestamp -> XML element ({elem.tag})")
        elif tag in title_tags:
            metadata.append(OriginSignal(signal="title", value=text))
            trace.append(f"title -> XML element ({elem.tag})")

    return {"identity": identity, "metadata": metadata, "distribution": [], "trace": trace}


def _extract_text_origin(content: str) -> dict:
    identity: list[OriginSignal] = []
    metadata: list[OriginSignal] = []
    distribution: list[OriginSignal] = []
    trace: list[str] = []

    for line in content.splitlines():
        match = _LABEL_VALUE_RE.match(line)
        if not match:
            continue

        raw_label = match.group(1).strip()
        label = re.sub(r"\s+", " ", raw_label.lower().replace("_", " "))
        value = match.group(2).strip()
        if not value:
            continue

        if label in _TEXT_IDENTITY_LABELS:
            signal = _TEXT_IDENTITY_LABELS[label]
            identity.append(OriginSignal(signal=signal, value=value, category="plain_text_label"))
            trace.append(f"{signal} -> plain-text label ({raw_label})")
        elif label in _TEXT_METADATA_LABELS:
            signal = _TEXT_METADATA_LABELS[label]
            metadata.append(OriginSignal(signal=signal, value=value, category="plain_text_label"))
            trace.append(f"{signal} -> plain-text label ({raw_label})")
        elif label in _TEXT_DISTRIBUTION_LABELS:
            signal = _TEXT_DISTRIBUTION_LABELS[label]
            distribution.append(OriginSignal(signal=signal, value=value, category="plain_text_label"))
            trace.append(f"{signal} -> plain-text label ({raw_label})")

    author_match = re.search(r"(?:by|author[:\s]+)([A-Z][a-z]+(?: [A-Z][a-z]+)+)", content, re.I)
    if author_match and not any(signal.signal == "author" for signal in identity):
        identity.append(OriginSignal(signal="author", value=author_match.group(1)))
        trace.append("author -> text author pattern")

    return {"identity": identity, "metadata": metadata, "distribution": distribution, "trace": trace}


def _tag(node, tag: str) -> None:
    if tag not in node.tags:
        node.tags.append(tag)


def _node_text(node) -> str:
    return " ".join((node.source_text or node.normalized_text or "").split())


def _apply_document_anchor_tags(structure_result: Optional[StructureResult]) -> list[str]:
    if structure_result is None:
        return []

    trace: list[str] = []
    anchored_count = 0
    origin_count = 0

    for node in structure_result.nodes:
        _tag(node, "anchor:node")
        anchored_count += 1

        text = _node_text(node).strip()
        stripped = text.strip(" .;:")
        if not stripped:
            continue

        is_document_identity = bool(
            _BILL_MARKER_RE.match(stripped)
            or _HEADER_LABEL_RE.match(stripped)
            or _CITATION_TITLE_RE.search(text)
        )

        if is_document_identity:
            _tag(node, "origin:document_identity")
            origin_count += 1

    trace.append(f"node_anchor -> applied to {anchored_count} structure nodes")
    if origin_count:
        trace.append(f"document_identity -> tagged {origin_count} header/title nodes")
    return trace


def process_origin(
    input_result: InputResult,
    structure_result: Optional[StructureResult] = None,
    run: bool = True,
) -> OriginResult:
    """Extract provenance signals and document-anchor tags."""
    if not run:
        return OriginResult(status="skipped")

    ct = ContentType(input_result.content_type)
    extractors = {
        ContentType.html: _extract_html_origin,
        ContentType.json: _extract_json_origin,
        ContentType.xml: _extract_xml_origin,
        ContentType.text: _extract_text_origin,
    }

    result = extractors[ct](input_result.raw_content)
    result["trace"].extend(_apply_document_anchor_tags(structure_result))

    return OriginResult(
        status="executed",
        origin_identity_signals=result["identity"],
        origin_metadata_signals=result["metadata"],
        distribution_signals=result.get("distribution", []),
        evidence_trace=result["trace"],
    )
