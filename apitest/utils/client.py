from __future__ import annotations

import json as _json
from urllib import request as _request
from urllib import error as _error
from urllib.parse import urlencode


class HttpClient:
    def __init__(self, base_url: str):
        self.base_url = base_url.rstrip("/")
        self._token: str | None = None

    def set_token(self, token: str) -> None:
        self._token = token

    def _headers(self, token: str | None = None) -> dict[str, str]:
        headers = {"Content-Type": "application/json"}
        effective = token or self._token
        if effective:
            headers["Authorization"] = f"Bearer {effective}"
        return headers

    def _needs_token(self, path: str) -> bool:
        no_auth_prefixes = (
            "/api/auth/login",
            "/api/health",
            "/openapi.json",
            "/api-docs",
        )
        return not path.startswith(no_auth_prefixes)

    def request(
        self,
        method: str,
        path: str,
        json: dict | None = None,
        data: bytes | None = None,
        headers: dict | None = None,
        params: dict | None = None,
        token: str | None = None,
    ) -> dict:
        url = f"{self.base_url}{path}"
        if params:
            url = f"{url}?{urlencode(params)}"

        final_headers = self._headers(token)
        if headers:
            final_headers.update(headers)

        body = None
        if json is not None:
            body = _json.dumps(json).encode("utf-8")
        elif data is not None:
            body = data

        req = _request.Request(url, data=body, headers=final_headers, method=method.upper())

        try:
            with _request.urlopen(req, timeout=30) as resp:
                raw = resp.read().decode("utf-8")
                return {
                    "status": resp.status,
                    "body": _try_json(raw),
                    "text": raw,
                    "headers": dict(resp.headers.items()),
                }
        except _error.HTTPError as e:
            raw = e.read().decode("utf-8", errors="replace")
            return {
                "status": e.code,
                "body": _try_json(raw),
                "text": raw,
                "headers": dict(e.headers.items()) if e.headers else {},
            }

    def get(self, path: str, **kwargs) -> dict:
        return self.request("GET", path, **kwargs)

    def post(self, path: str, **kwargs) -> dict:
        return self.request("POST", path, **kwargs)

    def put(self, path: str, **kwargs) -> dict:
        return self.request("PUT", path, **kwargs)

    def delete(self, path: str, **kwargs) -> dict:
        return self.request("DELETE", path, **kwargs)


def _try_json(raw: str):
    if not raw:
        return None
    try:
        return _json.loads(raw)
    except Exception:
        return None