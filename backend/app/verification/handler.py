"""Verification layer: external verification-path routing.

No true/false decisions. No credibility scoring. No final judgment.
This is routing logic, not truth logic.
"""

from __future__ import annotations

import re
from typing import Optional

from app.schemas.models import StructureNode, VerificationNodeResult, VerificationResult


# ---------------------------------------------------------------------------
# Assertion type detection (pattern-based, deterministic)
# ---------------------------------------------------------------------------

_ASSERTION_PATTERNS: list[tuple[str, re.Pattern]] = [
    ("legal_legislative", re.compile(
        r"\b(statute|legislation|law|enacted|codified|U\.?S\.?C\.?|United States Code|act of|public law|bill|section\s+\d+|is amended|federal office)\b",
        re.I,
    )),
    ("court_case_law", re.compile(
        r"\b(court|courtlistener|ruling|judicial decision|court opinion|case law|plaintiff|defendant|judge|verdict|appeal)\b",
        re.I,
    )),
    ("government_publication", re.compile(
        r"\b(federal register|executive order|proclamation|regulation|agency|department|bureau)\b", re.I)),
    ("scientific_biomedical", re.compile(
        r"\b(study|research|clinical|trial|peer-reviewed|journal|findings|hypothesis|evidence-based)\b", re.I)),
    ("statistical_public_data", re.compile(
        r"\b(census|survey|statistics|percent|rate|population|demographic|data)\b", re.I)),
    ("corporate_financial", re.compile(
        r"\b(SEC|filing|10-K|10-Q|annual report|quarterly|earnings|revenue|stock|shareholder)\b", re.I)),
    ("infrastructure_energy", re.compile(
        r"\b(FERC|NERC|grid|pipeline|utility|energy|power plant|transmission|generation)\b", re.I)),
    ("historical_archival", re.compile(
        r"\b(archive|historical|record|museum|manuscript|primary source|collection)\b", re.I)),
]


# ---------------------------------------------------------------------------
# Verification routing library
# ---------------------------------------------------------------------------

_RECORD_SYSTEMS: dict[str, list[str]] = {
    "legal_legislative": ["Congress.gov", "GovInfo", "Federal Register"],
    "court_case_law": ["CourtListener", "GovInfo"],
    "government_publication": ["Federal Register", "GovInfo"],
    "scientific_biomedical": ["PubMed", "JSTOR"],
    "statistical_public_data": ["Census", "data.gov"],
    "corporate_financial": ["SEC EDGAR"],
    "infrastructure_energy": ["FERC", "NERC", "EIA"],
    "historical_archival": ["National Archives", "JSTOR"],
}


def _detect_assertion(text: str) -> tuple[bool, Optional[str]]:
    """Detect if text contains an assertion and classify its type."""
    for atype, pattern in _ASSERTION_PATTERNS:
        if pattern.search(text):
            return True, atype
    return False, None


def _process_node(node: StructureNode) -> VerificationNodeResult:
    detected, atype = _detect_assertion(node.normalized_text)

    if detected and atype:
        systems = _RECORD_SYSTEMS.get(atype, [])
        return VerificationNodeResult(
            node_id=node.node_id,
            assertion_detected=True,
            assertion_type=atype,
            verification_path_available=len(systems) > 0,
            expected_record_systems=systems,
            verification_notes=f"Assertion type '{atype}' detected; routed to {len(systems)} record system(s)",
        )

    return VerificationNodeResult(
        node_id=node.node_id,
        assertion_detected=False,
        assertion_type=None,
        verification_path_available=False,
        expected_record_systems=[],
        verification_notes=None,
    )


def process_verification(
    selected_nodes: list[StructureNode],
    run: bool = True,
) -> VerificationResult:
    """Route selected nodes to candidate verification record systems."""
    if not run:
        return VerificationResult(status="skipped")

    return VerificationResult(
        status="executed",
        node_results=[_process_node(node) for node in selected_nodes],
    )
