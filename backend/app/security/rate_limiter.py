"""Simple in-memory rate limiter using sliding window."""

from __future__ import annotations

import time
from collections import defaultdict
from threading import Lock

# Requests per window
GENERAL_LIMIT = 30
MEANING_LIMIT = 5
WINDOW_SECONDS = 60


class _RateLimiter:
    def __init__(self) -> None:
        self._lock = Lock()
        self._general: dict[str, list[float]] = defaultdict(list)
        self._meaning: dict[str, list[float]] = defaultdict(list)

    def _prune(self, timestamps: list[float], now: float) -> list[float]:
        cutoff = now - WINDOW_SECONDS
        return [t for t in timestamps if t > cutoff]

    def check(self, client_ip: str, wants_meaning: bool) -> str | None:
        """Return None if allowed, or a reason string if blocked."""
        now = time.time()
        with self._lock:
            # General limit
            self._general[client_ip] = self._prune(self._general[client_ip], now)
            if len(self._general[client_ip]) >= GENERAL_LIMIT:
                return f"Rate limit exceeded: {GENERAL_LIMIT} requests per {WINDOW_SECONDS}s"
            self._general[client_ip].append(now)

            # Meaning limit (stricter)
            if wants_meaning:
                self._meaning[client_ip] = self._prune(self._meaning[client_ip], now)
                if len(self._meaning[client_ip]) >= MEANING_LIMIT:
                    return f"Meaning rate limit exceeded: {MEANING_LIMIT} requests per {WINDOW_SECONDS}s"
                self._meaning[client_ip].append(now)

        return None


rate_limiter = _RateLimiter()
