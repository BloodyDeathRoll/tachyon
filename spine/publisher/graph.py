"""Thin Instagram Graph API client (Facebook Login for Business, graph.facebook.com).

Every write goes through `write()`, which the callers wrap in a journal entry.
No retries here; publish.py decides what to retry. Nothing is printed; errors raise.
"""

from __future__ import annotations

import json
import urllib.error
import urllib.parse
import urllib.request

VERSION = "v26.0"
GRAPH = f"https://graph.facebook.com/{VERSION}"
RUPLOAD = f"https://rupload.facebook.com/ig-api-upload/{VERSION}"


class GraphError(RuntimeError):
    def __init__(self, code: int | None, subcode: int | None, message: str, raw: dict | None = None,
                 http_status: int | None = None):
        super().__init__(f"Graph {code}/{subcode}: {message}")
        self.code, self.subcode, self.raw, self.http_status = code, subcode, raw or {}, http_status

    @property
    def ambiguous(self) -> bool:
        """A 5xx or Meta's transient codes say nothing about whether a write took effect."""
        return (self.http_status or 0) >= 500 or self.code in (1, 2) or bool(self.raw.get("is_transient"))


def _request(method: str, url: str, data: bytes | None = None, headers: dict | None = None) -> dict:
    req = urllib.request.Request(url, data=data, method=method, headers=headers or {})
    try:
        with urllib.request.urlopen(req, timeout=120) as r:
            body = r.read()
    except urllib.error.HTTPError as e:
        body = e.read()
        try:
            err = json.loads(body)["error"]
        except (ValueError, KeyError):
            raise GraphError(e.code, None, body[:300].decode(errors="replace"), http_status=e.code) from None
        raise GraphError(err.get("code"), err.get("error_subcode"), err.get("message"), err, http_status=e.code) from None
    return json.loads(body) if body else {}


class Graph:
    def __init__(self, token: str):
        self.token = token

    def get(self, path: str, **params) -> dict:
        params["access_token"] = self.token
        return _request("GET", f"{GRAPH}/{path}?{urllib.parse.urlencode(params)}")

    def write(self, path: str, **params) -> dict:
        params["access_token"] = self.token
        return _request("POST", f"{GRAPH}/{path}", urllib.parse.urlencode(params).encode())

    def upload(self, container_id: str, video: bytes) -> dict:
        """Resumable upload of the whole file in one request (files here are < 100 MB)."""
        return _request("POST", f"{RUPLOAD}/{container_id}", video, {
            "Authorization": f"OAuth {self.token}",
            "offset": "0",
            "file_size": str(len(video)),
            "Content-Type": "application/octet-stream",
        })

    # ── convenience ──────────────────────────────────────────────────────────
    def publishing_quota(self, ig_user_id: str) -> int:
        return int(self.get(f"{ig_user_id}/content_publishing_limit")["data"][0]["quota_usage"])

    def container_status(self, container_id: str) -> dict:
        return self.get(container_id, fields="status_code,status")

    def media(self, media_id: str, fields: str = "id,permalink,timestamp,media_product_type") -> dict:
        return self.get(media_id, fields=fields)

    def media_insights(self, media_id: str, metrics: list[str]) -> dict[str, float]:
        data = self.get(f"{media_id}/insights", metric=",".join(metrics))["data"]
        return {d["name"]: (d.get("values") or [{}])[0].get("value", d.get("total_value", {}).get("value"))
                for d in data}

    def account_insights(self, ig_user_id: str, metrics: list[str], period: str = "day",
                         metric_type: str = "total_value", **window) -> dict:
        data = self.get(f"{ig_user_id}/insights", metric=",".join(metrics), period=period,
                        metric_type=metric_type, **window)["data"]
        return {d["name"]: d.get("total_value", {}).get("value", (d.get("values") or [{}])[0].get("value"))
                for d in data}
