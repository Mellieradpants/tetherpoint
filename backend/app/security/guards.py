"""Security guards for /analyze endpoint."""

from __future__ import annotations

import logging
import os

from fastapi import HTTPException, Request

from app.schemas.models import AnalyzeRequest
from app.security.rate_limiter import rate_limiter

logger = logging.getLogger("tetherpoint.security")

# Hard cap: 500 KB of content
MAX_CONTENT_LENGTH = 500_000


def get_client_ip(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def is_meaning_authorized(request: Request) -> bool:
    """Check if the caller is authorized to run the Meaning (AI) layer.

    Authorized if:
    - A server-side ANALYZE_SECRET is set AND the request provides it via
      X-Analyze-Secret header, OR
    - An Authorization bearer token is present (session-based auth)
    """
    server_secret = os.environ.get("ANALYZE_SECRET", "")

    if server_secret:
        client_secret = request.headers.get("x-analyze-secret", "")
        if client_secret == server_secret:
            return True

    auth_header = request.headers.get("authorization", "")
    if auth_header.startswith("Bearer ") and len(auth_header) > 10:
        return True

    return False


def enforce_security(analyze_req: AnalyzeRequest, request: Request) -> AnalyzeRequest:
    """Run all security checks. Raises HTTPException on violation.
    May mutate options (force meaning off). Returns the request."""

    client_ip = get_client_ip(request)
    content_len = len(analyze_req.content)

    # --- 1. Empty content ---
    if not analyze_req.content or not analyze_req.content.strip():
        logger.warning("Rejected empty content from %s", client_ip)
        raise HTTPException(status_code=400, detail="content must not be empty")

    # --- 2. Content size ---
    if content_len > MAX_CONTENT_LENGTH:
        logger.warning(
            "Rejected oversized request from %s: %d bytes (max %d)",
            client_ip, content_len, MAX_CONTENT_LENGTH,
        )
        raise HTTPException(
            status_code=413,
            detail=f"content too large: {content_len} bytes (max {MAX_CONTENT_LENGTH})",
        )

    # --- 3. Meaning authorization ---
    wants_meaning = analyze_req.options.run_meaning
    meaning_allowed = False

    if wants_meaning:
        meaning_allowed = is_meaning_authorized(request)
        if not meaning_allowed:
            logger.info(
                "Meaning blocked for unauthorized caller %s — forcing skip",
                client_ip,
            )
            analyze_req.options.run_meaning = False

    # --- 4. Rate limiting ---
    rate_result = rate_limiter.check(client_ip, wants_meaning and meaning_allowed)
    if rate_result:
        logger.warning("Rate limited %s: %s", client_ip, rate_result)
        raise HTTPException(status_code=429, detail=rate_result)

    # --- 5. Security log ---
    logger.info(
        "analyze request ip=%s size=%d meaning_requested=%s meaning_allowed=%s content_type=%s",
        client_ip,
        content_len,
        wants_meaning,
        meaning_allowed if wants_meaning else "n/a",
        analyze_req.content_type.value,
    )

    return analyze_req
