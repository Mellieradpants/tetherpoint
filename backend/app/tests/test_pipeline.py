"""Tests for the Tetherpoint pipeline."""

import json

import pytest

from app.input.handler import process_input
from app.meaning.handler import process_meaning
from app.origin.handler import process_origin
from app.pipeline.runner import run_pipeline
from app.schemas.models import AnalyzeOptions, AnalyzeRequest, ContentType
from app.selection.handler import process_selection
from app.structure.handler import process_structure
from app.verification.handler import process_verification


# ---------------------------------------------------------------------------
# Input layer tests
# ---------------------------------------------------------------------------

class TestInputLayer:
    def test_text_input_valid(self):
        result = process_input("Hello world.", ContentType.text)
        assert result.parse_status == "ok"
        assert result.content_type == "text"
        assert result.raw_content == "Hello world."
        assert result.size > 0

    def test_text_input_empty(self):
        result = process_input("   ", ContentType.text)
        assert result.parse_status == "error"
        assert len(result.parse_errors) > 0

    def test_xml_input_valid(self):
        result = process_input("<root><item>Test</item></root>", ContentType.xml)
        assert result.parse_status == "ok"
        assert result.parse_errors == []

    def test_xml_input_malformed(self):
        result = process_input("<root><item>Test</root>", ContentType.xml)
        assert result.parse_status == "error"
        assert any("XML" in e for e in result.parse_errors)

    def test_html_input_valid(self):
        result = process_input("<html><body><p>Hello</p></body></html>", ContentType.html)
        assert result.parse_status == "ok"
        assert result.parse_errors == []

    def test_html_input_no_elements(self):
        result = process_input("just plain text no tags", ContentType.html)
        assert result.parse_status == "error"
        assert any("no recognizable" in e.lower() for e in result.parse_errors)

    def test_json_input_valid(self):
        result = process_input('{"key": "value"}', ContentType.json)
        assert result.parse_status == "ok"
        assert result.parse_errors == []

    def test_json_input_malformed(self):
        result = process_input("{bad json", ContentType.json)
        assert result.parse_status == "error"
        assert any("JSON" in e for e in result.parse_errors)

    def test_plain_text_preserved(self):
        text = "The court ruled in favor of the defendant."
        result = process_input(text, ContentType.text)
        assert result.raw_content == text
        assert result.size == len(text.encode("utf-8"))


# ---------------------------------------------------------------------------
# Structure layer tests
# ---------------------------------------------------------------------------

class TestStructureLayer:
    def test_text_structure_nodes(self):
        inp = process_input(
            "The SEC issued a new regulation on January 15, 2024. Companies must comply within 90 days.",
            ContentType.text,
        )
        struct = process_structure(inp)
        assert struct.node_count > 0
        for node in struct.nodes:
            assert node.node_id
            assert node.source_anchor
            assert node.source_text

    def test_node_order_preserved(self):
        inp = process_input(
            "First statement here. Second statement follows. Third statement ends.",
            ContentType.text,
        )
        struct = process_structure(inp)
        texts = [n.source_text for n in struct.nodes]
        assert texts[0].startswith("First")
        assert texts[-1].startswith("Third")

    def test_xml_structure(self):
        inp = process_input(
            "<doc><section>Congress enacted Public Law 118-1.</section><section>The deadline is 2024-06-01.</section></doc>",
            ContentType.xml,
        )
        struct = process_structure(inp)
        assert struct.node_count >= 2

    def test_json_structure(self):
        data = json.dumps({"title": "Report", "body": "The court issued a ruling on the case."})
        inp = process_input(data, ContentType.json)
        struct = process_structure(inp)
        assert struct.node_count >= 1

    def test_malformed_input_produces_empty_structure(self):
        inp = process_input("{bad", ContentType.json)
        struct = process_structure(inp)
        assert struct.node_count == 0

    def test_html_structure_extracts_paragraphs(self):
        html = "<html><body><p>First paragraph.</p><p>Second paragraph.</p></body></html>"
        inp = process_input(html, ContentType.html)
        struct = process_structure(inp)
        assert struct.node_count >= 2


# ---------------------------------------------------------------------------
# Selection layer tests
# ---------------------------------------------------------------------------

class TestSelectionLayer:
    def test_deterministic_selection(self):
        inp = process_input(
            "The SEC must enforce compliance by March 2025. Random words without signals.",
            ContentType.text,
        )
        struct = process_structure(inp)
        sel = process_selection(struct)
        total = len(sel.selected_nodes) + len(sel.excluded_nodes)
        assert total == struct.node_count
        assert len(sel.selection_log) == struct.node_count

    def test_blocked_node_excluded(self):
        """Nodes with CFS blocked_flags should be excluded by selection."""
        inp = process_input(
            "The company intends to reduce emissions. The regulation shall take effect.",
            ContentType.text,
        )
        struct = process_structure(inp)
        # Force a blocked flag on the first node to test exclusion
        if struct.nodes:
            struct.nodes[0].blocked_flags = ["intent_attribution"]
        sel = process_selection(struct)
        excluded_ids = [n.node_id for n in sel.excluded_nodes]
        if struct.nodes:
            assert struct.nodes[0].node_id in excluded_ids

    def test_selection_preserves_node_content(self):
        """Selected nodes must not be modified by selection layer."""
        inp = process_input(
            "The SEC issued guidance on January 10, 2024.",
            ContentType.text,
        )
        struct = process_structure(inp)
        sel = process_selection(struct)
        for sel_node in sel.selected_nodes:
            orig = next(n for n in struct.nodes if n.node_id == sel_node.node_id)
            assert sel_node.source_text == orig.source_text
            assert sel_node.normalized_text == orig.normalized_text


# ---------------------------------------------------------------------------
# Meaning layer tests
# ---------------------------------------------------------------------------

class TestMeaningLayer:
    def test_meaning_skipped_when_disabled(self):
        inp = process_input("The SEC must enforce compliance.", ContentType.text)
        struct = process_structure(inp)
        sel = process_selection(struct)
        result = process_meaning(sel.selected_nodes, run=False)
        assert result.status == "skipped"
        assert result.node_results == []

    def test_meaning_skipped_without_api_key(self):
        """Without OPENAI_API_KEY, meaning returns skipped even when run=True."""
        import os
        old = os.environ.pop("OPENAI_API_KEY", None)
        try:
            inp = process_input("The court ruled on the case.", ContentType.text)
            struct = process_structure(inp)
            sel = process_selection(struct)
            result = process_meaning(sel.selected_nodes, run=True)
            assert result.status == "skipped"
        finally:
            if old is not None:
                os.environ["OPENAI_API_KEY"] = old


# ---------------------------------------------------------------------------
# Origin layer tests
# ---------------------------------------------------------------------------

class TestOriginLayer:
    def test_origin_skipped_when_disabled(self):
        inp = process_input("Some text content.", ContentType.text)
        result = process_origin(inp, run=False)
        assert result.status == "skipped"
        assert result.origin_identity_signals == []
        assert result.origin_metadata_signals == []

    def test_origin_executes_for_html(self):
        html = '<html><head><meta name="author" content="Jane Doe"></head><body><p>Content</p></body></html>'
        inp = process_input(html, ContentType.html)
        result = process_origin(inp, run=True)
        assert result.status == "executed"

    def test_origin_executes_for_text(self):
        inp = process_input("By John Smith. Published 2024.", ContentType.text)
        result = process_origin(inp, run=True)
        assert result.status == "executed"


# ---------------------------------------------------------------------------
# Verification layer tests
# ---------------------------------------------------------------------------

class TestVerificationLayer:
    def test_verification_skipped_when_disabled(self):
        inp = process_input("The SEC must enforce compliance.", ContentType.text)
        struct = process_structure(inp)
        sel = process_selection(struct)
        result = process_verification(sel.selected_nodes, run=False)
        assert result.status == "skipped"
        assert result.node_results == []

    def test_verification_detects_legal_assertion(self):
        inp = process_input("Congress enacted Public Law 118-1.", ContentType.text)
        struct = process_structure(inp)
        sel = process_selection(struct)
        result = process_verification(sel.selected_nodes, run=True)
        assert result.status == "executed"
        found_legal = any(
            nr.assertion_type and "legal" in nr.assertion_type
            for nr in result.node_results
        )
        assert found_legal

    def test_verification_detects_corporate_assertion(self):
        inp = process_input("The SEC filed charges against the company.", ContentType.text)
        struct = process_structure(inp)
        sel = process_selection(struct)
        result = process_verification(sel.selected_nodes, run=True)
        assert result.status == "executed"
        found = any(nr.assertion_detected for nr in result.node_results)
        assert found


# ---------------------------------------------------------------------------
# Full pipeline tests
# ---------------------------------------------------------------------------

class TestFullPipeline:
    def test_text_pipeline(self):
        req = AnalyzeRequest(
            content="Congress enacted the Clean Air Act in 1970. The EPA must enforce compliance.",
            content_type=ContentType.text,
            options=AnalyzeOptions(run_meaning=False, run_origin=True, run_verification=True),
        )
        result = run_pipeline(req)
        assert result.input.parse_status == "ok"
        assert result.meaning.status == "skipped"
        assert result.origin.status == "executed"
        assert result.verification.status == "executed"

    def test_html_pipeline(self):
        html = """<html><head><title>Report</title><meta name="author" content="Jane Doe"></head>
        <body><p>The federal court ruled on the case in January 2024.</p></body></html>"""
        req = AnalyzeRequest(
            content=html,
            content_type=ContentType.html,
            options=AnalyzeOptions(run_meaning=False, run_origin=True, run_verification=True),
        )
        result = run_pipeline(req)
        assert result.input.parse_status == "ok"
        assert len(result.origin.origin_identity_signals) > 0 or len(result.origin.origin_metadata_signals) > 0

    def test_xml_pipeline(self):
        xml = "<doc><section>Congress enacted Public Law 118-1.</section></doc>"
        req = AnalyzeRequest(
            content=xml,
            content_type=ContentType.xml,
            options=AnalyzeOptions(run_meaning=False, run_origin=True, run_verification=True),
        )
        result = run_pipeline(req)
        assert result.input.parse_status == "ok"
        assert result.structure.node_count >= 1
        assert result.origin.status == "executed"

    def test_json_pipeline(self):
        data = json.dumps({"title": "Report", "body": "The court issued a ruling."})
        req = AnalyzeRequest(
            content=data,
            content_type=ContentType.json,
            options=AnalyzeOptions(run_meaning=False, run_origin=True, run_verification=True),
        )
        result = run_pipeline(req)
        assert result.input.parse_status == "ok"
        assert result.structure.node_count >= 1

    def test_malformed_json_pipeline(self):
        req = AnalyzeRequest(
            content="{bad json",
            content_type=ContentType.json,
            options=AnalyzeOptions(run_meaning=False, run_origin=False, run_verification=False),
        )
        result = run_pipeline(req)
        assert result.input.parse_status == "error"
        assert len(result.errors) > 0
        assert result.errors[0].layer == "input"

    def test_malformed_xml_pipeline(self):
        req = AnalyzeRequest(
            content="<root><broken>",
            content_type=ContentType.xml,
            options=AnalyzeOptions(run_meaning=False, run_origin=False, run_verification=False),
        )
        result = run_pipeline(req)
        assert result.input.parse_status == "error"
        assert len(result.errors) > 0

    def test_skipped_layers(self):
        req = AnalyzeRequest(
            content="Simple text.",
            content_type=ContentType.text,
            options=AnalyzeOptions(run_meaning=False, run_origin=False, run_verification=False),
        )
        result = run_pipeline(req)
        assert result.meaning.status == "skipped"
        assert result.origin.status == "skipped"
        assert result.verification.status == "skipped"

    def test_response_has_all_8_top_level_keys(self):
        req = AnalyzeRequest(
            content="The SEC must enforce compliance.",
            content_type=ContentType.text,
            options=AnalyzeOptions(run_meaning=False, run_origin=False, run_verification=False),
        )
        result = run_pipeline(req)
        assert result.input is not None
        assert result.structure is not None
        assert result.selection is not None
        assert result.meaning is not None
        assert result.origin is not None
        assert result.verification is not None
        assert result.output is not None
        assert result.errors is not None

    def test_errors_present_even_when_empty(self):
        req = AnalyzeRequest(
            content="The SEC must enforce compliance by March 2025.",
            content_type=ContentType.text,
            options=AnalyzeOptions(run_meaning=False, run_origin=True, run_verification=True),
        )
        result = run_pipeline(req)
        assert isinstance(result.errors, list)

    def test_response_serializes_all_8_keys_via_api(self):
        """Verify the HTTP response JSON contains exactly the 8 required keys."""
        from fastapi.testclient import TestClient
        from app.main import app

        client = TestClient(app)
        resp = client.post("/analyze", json={
            "content": "Test content.",
            "content_type": "text",
            "options": {"run_meaning": False, "run_origin": False, "run_verification": False},
        })
        assert resp.status_code == 200
        body = resp.json()
        required_keys = {"input", "structure", "selection", "meaning", "origin", "verification", "output", "errors"}
        assert required_keys == set(body.keys())


# ---------------------------------------------------------------------------
# Complex HTML integration tests
# ---------------------------------------------------------------------------

COMPLEX_HTML = '''<!DOCTYPE html>
<html lang="en">
<head>
  <title>Federal Energy Commission Issues New Grid Reliability Standards</title>
  <meta name="author" content="Sarah Chen">
  <meta name="publish-date" content="2024-11-15T09:00:00Z">
  <link rel="canonical" href="https://energy-regulatory-news.example.com/articles/ferc-grid-2024">
  <meta property="og:title" content="FERC Issues New Grid Reliability Standards for 2025">
  <meta property="og:description" content="Federal regulators mandate upgraded transmission infrastructure by Q3 2025">
  <meta property="og:type" content="article">
  <meta property="og:url" content="https://energy-regulatory-news.example.com/articles/ferc-grid-2024">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:site" content="@EnergyRegNews">
  <script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "NewsArticle",
    "headline": "FERC Issues New Grid Reliability Standards",
    "author": {"@type": "Person", "name": "Sarah Chen"},
    "publisher": {"@type": "Organization", "name": "Energy Regulatory News"},
    "datePublished": "2024-11-15T09:00:00Z"
  }
  </script>
</head>
<body>
  <article>
    <p>The Federal Energy Regulatory Commission enacted Order No. 2222-A on November 1, 2024, requiring all interstate transmission operators to upgrade grid monitoring systems.</p>
    <p>According to a study published in Nature Energy, distributed energy resources reduced peak load by 12% across ERCOT during summer 2024.</p>
    <p>Tesla Inc. reported Q3 2024 revenue of $25.2 billion, exceeding analyst consensus estimates by 4.3%.</p>
    <p>The Supreme Court ruled in West Virginia v. EPA that the Clean Air Act does not grant EPA authority to mandate generation-shifting measures.</p>
    <p>Historical records confirm that the Northeast Blackout of 2003 affected approximately 55 million people across eight U.S. states and Ontario.</p>
    <p>The company intends to accelerate its transition to renewable energy sources over the next decade.</p>
  </article>
</body>
</html>'''


class TestComplexHTMLIntegration:
    """End-to-end tests with complex HTML containing OG tags, JSON-LD,
    multiple assertion types, and CFS-triggering content."""

    @pytest.fixture(autouse=True)
    def _run_pipeline(self):
        req = AnalyzeRequest(
            content=COMPLEX_HTML,
            content_type=ContentType.html,
            options=AnalyzeOptions(run_meaning=False, run_origin=True, run_verification=True),
        )
        self.result = run_pipeline(req)

    # -- Origin: OG tags --------------------------------------------------

    def test_og_title_extracted(self):
        all_signals = (
            self.result.origin.origin_identity_signals
            + self.result.origin.origin_metadata_signals
            + self.result.origin.distribution_signals
        )
        og_values = [s.value for s in all_signals if s.value]
        assert any("FERC Issues New Grid Reliability Standards" in v for v in og_values)

    def test_og_type_extracted(self):
        all_signals = (
            self.result.origin.origin_identity_signals
            + self.result.origin.origin_metadata_signals
            + self.result.origin.distribution_signals
        )
        og_values = [s.value for s in all_signals if s.value]
        assert any("article" == v for v in og_values)

    def test_og_url_extracted(self):
        all_signals = (
            self.result.origin.origin_identity_signals
            + self.result.origin.origin_metadata_signals
            + self.result.origin.distribution_signals
        )
        og_values = [s.value for s in all_signals if s.value]
        assert any("ferc-grid-2024" in v for v in og_values)

    def test_twitter_card_extracted(self):
        all_signals = (
            self.result.origin.origin_identity_signals
            + self.result.origin.origin_metadata_signals
            + self.result.origin.distribution_signals
        )
        values = [s.value for s in all_signals if s.value]
        assert any("summary_large_image" in v for v in values)

    # -- Origin: JSON-LD --------------------------------------------------

    def test_jsonld_publisher_extracted(self):
        all_signals = (
            self.result.origin.origin_identity_signals
            + self.result.origin.origin_metadata_signals
        )
        values = [s.value for s in all_signals if s.value]
        assert any("Energy Regulatory News" in v for v in values)

    def test_jsonld_author_extracted(self):
        all_signals = (
            self.result.origin.origin_identity_signals
            + self.result.origin.origin_metadata_signals
        )
        values = [s.value for s in all_signals if s.value]
        assert any("Sarah Chen" in v for v in values)

    # -- Origin: canonical URL --------------------------------------------

    def test_canonical_url_extracted(self):
        all_signals = (
            self.result.origin.origin_identity_signals
            + self.result.origin.origin_metadata_signals
        )
        values = [s.value for s in all_signals if s.value]
        assert any("energy-regulatory-news.example.com" in v for v in values)

    # -- CFS: intent_attribution blocking ---------------------------------

    def test_intent_attribution_blocked(self):
        """'The company intends to...' must be flagged with intent_attribution."""
        intent_nodes = [
            n for n in self.result.structure.nodes
            if "intends" in n.source_text.lower()
        ]
        assert len(intent_nodes) >= 1
        for node in intent_nodes:
            assert "intent_attribution" in node.blocked_flags

    def test_blocked_node_excluded_from_selection(self):
        """CFS-blocked nodes must not appear in selected_nodes."""
        selected_ids = {n.node_id for n in self.result.selection.selected_nodes}
        for node in self.result.structure.nodes:
            if node.blocked_flags:
                assert node.node_id not in selected_ids

    # -- Verification: FERC routing ---------------------------------------

    def test_ferc_routing(self):
        """The FERC/energy regulation paragraph should route to FERC record system."""
        all_systems = []
        for nr in self.result.verification.node_results:
            all_systems.extend(nr.expected_record_systems)
        assert "FERC" in all_systems

    # -- Verification: court/PACER routing --------------------------------

    def test_court_routing(self):
        """The Supreme Court paragraph should route to court record systems."""
        all_systems = []
        for nr in self.result.verification.node_results:
            all_systems.extend(nr.expected_record_systems)
        assert any(s in ("CourtListener", "GovInfo", "PACER", "Supreme Court opinions", "Westlaw") for s in all_systems)

    # -- Verification: multiple assertion types detected ------------------

    def test_multiple_assertion_types(self):
        """Pipeline should detect more than one distinct assertion type."""
        types_found = {
            nr.assertion_type
            for nr in self.result.verification.node_results
            if nr.assertion_type
        }
        assert len(types_found) >= 2

    # -- Overall pipeline integrity ---------------------------------------

    def test_no_errors(self):
        assert self.result.errors == []

    def test_all_8_keys_present(self):
        assert self.result.input is not None
        assert self.result.structure is not None
        assert self.result.selection is not None
        assert self.result.meaning is not None
        assert self.result.origin is not None
        assert self.result.verification is not None
        assert self.result.output is not None
        assert self.result.errors is not None
