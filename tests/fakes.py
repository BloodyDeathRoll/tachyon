"""A stand-in for urllib's opener: answers from a script, records every request."""

from __future__ import annotations

import io
import json
import urllib.error


class FakeWorker:
    """Answers (status, body) in order; a body that is bytes goes back as is, anything else as
    JSON. `calls` holds (method, url, json body or None, headers) per request."""

    def __init__(self, *answers):
        self.answers, self.calls = list(answers), []

    def __call__(self, req, timeout=0):
        data = req.data
        body = None
        if data and req.get_header("Content-type", "").startswith("application/json"):
            body = json.loads(data)
        self.calls.append((req.get_method(), req.full_url, body if body is not None else data, dict(req.header_items())))
        if not self.answers:
            raise AssertionError(f"unexpected request {req.get_method()} {req.full_url}")
        status, payload = self.answers.pop(0)
        raw = payload if isinstance(payload, bytes) else json.dumps(payload).encode()
        if status >= 400:
            raise urllib.error.HTTPError(req.full_url, status, "x", {}, io.BytesIO(raw))
        r = io.BytesIO(b"" if status == 204 else raw)
        r.status = status
        r.__enter__ = lambda *a: r
        r.__exit__ = lambda *a: None
        return r
