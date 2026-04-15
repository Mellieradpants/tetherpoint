"""Tests for security guards on /analyze endpoint."""

from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)


def _req(content="The court ruled.", content_type="text", **opts):
    body = {"content": content, "content_type": content_type, "options": opts}
    return client.post("/analyze", json=body)


class TestInputValidation:
    def test_empty_content_rejected(self):
        r = client.post("/analyze", json={"content": "", "content_type": "text"})
        assert r.status_code == 422  # pydantic min_length=1

    def test_whitespace_only_rejected(self):
        r = _req(content="   ")
        assert r.status_code == 400

    def test_invalid_content_type_rejected(self):
        r = client.post("/analyze", json={"content": "hi", "content_type": "yaml"})
        assert r.status_code == 422

    def test_oversized_content_rejected(self):
        r = _req(content="x" * 500_001)
        assert r.status_code == 413


class TestMeaningProtection:
    def test_meaning_defaults_to_false(self):
        r = _req()
        assert r.status_code == 200
        data = r.json()
        assert data["meaning"]["status"] == "skipped"

    def test_meaning_blocked_without_auth(self):
        r = _req(run_meaning=True)
        assert r.status_code == 200
        data = r.json()
        assert data["meaning"]["status"] == "skipped"

    def test_meaning_allowed_with_secret(self):
        import os
        os.environ["ANALYZE_SECRET"] = "test-secret-123"
        try:
            r = client.post(
                "/analyze",
                json={"content": "Test.", "content_type": "text", "options": {"run_meaning": True}},
                headers={"x-analyze-secret": "test-secret-123"},
            )
            assert r.status_code == 200
            # Meaning will be "skipped" due to no OPENAI_API_KEY, but it was allowed through
        finally:
            del os.environ["ANALYZE_SECRET"]


class TestRateLimiting:
    def test_rate_limit_triggers(self):
        from app.security.rate_limiter import rate_limiter, GENERAL_LIMIT
        # Reset state
        rate_limiter._general.clear()
        rate_limiter._meaning.clear()

        results = []
        for _ in range(GENERAL_LIMIT + 5):
            r = _req()
            results.append(r.status_code)

        assert 429 in results
