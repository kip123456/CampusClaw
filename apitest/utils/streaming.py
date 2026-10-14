from __future__ import annotations

import json as _json
from urllib import request as _request
from urllib import error as _error


class StreamingClient:
    def __init__(self, base_url: str, token: str | None = None):
        self.base_url = base_url.rstrip("/")
        self.token = token

    def post_stream(self, path: str, json: dict) -> tuple[int, dict, str]:
        url = f"{self.base_url}{path}"
        headers = {"Content-Type": "application/json"}
        if self.token:
            headers["Authorization"] = f"Bearer {self.token}"
        body = _json.dumps(json).encode("utf-8")
        req = _request.Request(url, data=body, headers=headers, method="POST")
        try:
            with _request.urlopen(req, timeout=120) as resp:
                status = resp.status
                final = {}
                chunks: list[str] = []
                for raw in resp:
                    line = raw.decode("utf-8", errors="replace")
                    chunks.append(line)
                    stripped = line.strip()
                    if not stripped:
                        continue
                    if stripped.startswith("data:"):
                        payload = stripped[5:].strip()
                        if payload == "[DONE]":
                            break
                        try:
                            j = _json.loads(payload)
                        except Exception:
                            continue
                        evt = j.get("event") or j.get("type")
                        if evt == "done" or ("conversationId" in j and "answer" in j):
                            final = j
                            break
                        if "answer" in j and "conversationId" in j:
                            final = j
                return status, final, "".join(chunks)
        except _error.HTTPError as e:
            raw = e.read().decode("utf-8", errors="replace")
            return e.code, {}, raw