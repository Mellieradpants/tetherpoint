"""Origin layer: provenance / source tracing only.

No credibility judgment. No truth claims. No intent claims.
"""

from __future__ import annotations

import json
import re
import xml.etree.ElementTree as ET

from bs4 import BeautifulSoup

from app.schemas.models import ContentType, InputResult, OriginResult, OriginSignal


def _extract_html_origin(content: str) -> dict:
    soup = BeautifulSoup(content, "html.parser")
    identity: list[OriginSignal] = []
    metadata: list[OriginSignal] = []
    distribution: list[OriginSignal] = []
    trace: list[str] = []

    canonical = soup.find("link", rel="canonical")
    if canonical and canonical.get("href"):
        identity.append(OriginSignal(signal="canonical_url", value=canonical["href"]))
        trace.append("Found canonical link")

    title_tag = soup.find("title")
    if title_tag and title_tag.string:
        metadata.append(OriginSignal(signal="title", value=title_tag.string.strip()))
        trace.append("Found title tag")

    for meta in soup.find_all("meta"):
        name = (meta.get("name") or meta.get("property") or "").lower()
        content_val = meta.get("content", "")
        if not content_val:
            continue

        if name == "author":
            identity.append(OriginSignal(signal="author", value=content_val))
            trace.append("Found author meta")
        elif name in ("article:published_time", "date", "pubdate"):
            metadata.append(OriginSignal(signal="publish_timestamp", value=content_val))
            trace.append(f"Found publish time via {name}")
        elif name.startswith("og:"):
            distribution.append(OriginSignal(signal=name, value=content_val, category="opengraph"))
            trace.append(f"Found OG tag: {name}")
        elif name.startswith("twitter:"):
            distribution.append(OriginSignal(signal=name, value=content_val, category="twitter_card"))
            trace.append(f"Found Twitter card: {name}")

    for script in soup.find_all("script", type="application/ld+json"):
        try:
            ld = json.loads(script.string or "")
            if isinstance(ld, dict):
                pub = ld.get("publisher")
                if isinstance(pub, dict):
                    identity.append(OriginSignal(signal="jsonld_publisher", value=pub.get("name", str(pub))))
                    trace.append("Found JSON-LD publisher")
                if ld.get("@type"):
                    metadata.append(OriginSignal(signal="jsonld_type", value=ld["@type"]))
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

    for key, val in data.items():
        lk = key.lower()
        if lk in source_keys and isinstance(val, str):
            identity.append(OriginSignal(signal=lk, value=val))
            trace.append(f"Found top-level key: {key}")
        elif lk in time_keys and isinstance(val, str):
            metadata.append(OriginSignal(signal=lk, value=val))
            trace.append(f"Found top-level key: {key}")

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

    for elem in root.iter():
        tag = elem.tag.lower().split("}")[-1] if "}" in elem.tag else elem.tag.lower()
        text = (elem.text or "").strip()
        if not text:
            continue
        if tag in source_tags:
            identity.append(OriginSignal(signal=tag, value=text))
            trace.append(f"Found XML element: {elem.tag}")
        elif tag in time_tags:
            metadata.append(OriginSignal(signal=tag, value=text))
            trace.append(f"Found XML element: {elem.tag}")

    return {"identity": identity, "metadata": metadata, "distribution": [], "trace": trace}


def _extract_text_origin(content: str) -> dict:
    identity: list[OriginSignal] = []
    trace: list[str] = []

    author_match = re.search(r"(?:by|author[:\s]+)([A-Z][a-z]+(?: [A-Z][a-z]+)+)", content, re.I)
    if author_match:
        identity.append(OriginSignal(signal="author", value=author_match.group(1)))
        trace.append("Found author pattern in text")

    return {"identity": identity, "metadata": [], "distribution": [], "trace": trace}


def process_origin(input_result: InputResult, run: bool = True) -> OriginResult:
    """Extract provenance signals from source content."""
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

    return OriginResult(
        status="executed",
        origin_identity_signals=result["identity"],
        origin_metadata_signals=result["metadata"],
        distribution_signals=result.get("distribution", []),
        evidence_trace=result["trace"],
    )
