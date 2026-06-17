from __future__ import annotations

import httpx

from app.services.llm_client import (
    _is_transient_gemini_overload,
    _is_transient_http_error,
    _is_transient_network_error,
)


def test_ssl_eof_is_retryable_network_error() -> None:
    err = RuntimeError("[SSL: UNEXPECTED_EOF_WHILE_READING] EOF occurred in violation of protocol (_ssl.c:1000)")

    assert _is_transient_network_error(err)
    assert _is_transient_http_error(err)
    assert _is_transient_gemini_overload(err)


def test_httpx_transport_errors_are_retryable() -> None:
    err = httpx.ConnectError("connection reset by peer")

    assert _is_transient_network_error(err)
    assert _is_transient_http_error(err)
