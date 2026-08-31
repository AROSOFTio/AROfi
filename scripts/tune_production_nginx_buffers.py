#!/usr/bin/env python3
"""Make AROFi Nginx tolerant of the API security-header set.

The production API uses Helmet and can return response headers larger than
Nginx's platform-default proxy header buffer. This patch is deliberately
idempotent and only adjusts proxy response-header buffers; it does not alter
routing, TLS, caching, RADIUS, captive-portal, or application behaviour.
"""
from pathlib import Path

FILES = [
    Path("config/nginx.split.conf"),
    Path("config/nginx.coolify.conf"),
]

ANCHOR = "    large_client_header_buffers 4 8k;\n"
TUNING = (
    "    large_client_header_buffers 4 8k;\n"
    "\n"
    "    # API security headers (Helmet/CSP and related headers) can exceed\n"
    "    # the platform-default upstream response-header buffer. Keep enough\n"
    "    # headroom so health/API responses are proxied instead of returning 502.\n"
    "    proxy_buffer_size 16k;\n"
    "    proxy_buffers 8 16k;\n"
    "    proxy_busy_buffers_size 32k;\n"
)

for path in FILES:
    text = path.read_text(encoding="utf-8")
    if "proxy_buffer_size 16k;" in text:
        print(f"{path}: proxy buffer tuning already present")
        continue
    if ANCHOR not in text:
        raise SystemExit(f"{path}: expected buffer anchor not found")
    path.write_text(text.replace(ANCHOR, TUNING, 1), encoding="utf-8")
    print(f"{path}: proxy response-header buffers tuned")
