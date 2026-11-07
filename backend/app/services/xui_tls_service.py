"""Certificate-only probe. No credentials, HTTP requests, or enforcement."""

import socket
import ssl
from urllib.parse import urlsplit

import certifi


def probe_certificate(host, context=None):
    policy = {"verification_enforced": False, "policy": "warning_only"}
    try:
        address = urlsplit(str(host))
        if address.scheme != "https":
            return {**policy, "state": "warning", "summary": "Адрес 3X-UI использует HTTP. Сертификата HTTPS нет; рабочие запросы не блокируются."}
        hostname, port = address.hostname, address.port or 443
        if not hostname:
            raise ValueError("Missing hostname")
        context = context or ssl.create_default_context(cafile=certifi.where())
        with socket.create_connection((hostname, port), timeout=4, source_address=("0.0.0.0", 0)) as raw:
            with context.wrap_socket(raw, server_hostname=hostname) as connection:
                certificate = connection.getpeercert()
        return {**policy, "state": "ok", "summary": "Сертификат прошёл отдельную проверку срока, доверия и адреса. Рабочий API не блокирует ошибки сертификата.", "expires": certificate.get("notAfter")}
    except ssl.SSLCertVerificationError as error:
        return {**policy, "state": "warning", "summary": "Сертификат не прошёл проверку срока, доверия или адреса. Это предупреждение: рабочие запросы к 3X-UI не блокируются.", "verify_code": getattr(error, "verify_code", None)}
    except (OSError, ValueError, TypeError):
        return {**policy, "state": "not_checked", "summary": "Отдельную проверку сертификата выполнить не удалось. Рабочий API проверяется независимо и не блокируется этой проверкой."}
