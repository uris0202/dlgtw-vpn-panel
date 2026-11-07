FROM ghcr.io/xtls/xray-core:26.10.31@sha256:ceabeac03a89d991d2a247361825c1d1d2e9c91cd5dc010f298c7dc0c2f325c9 AS vpn-engine

FROM python:3.13-slim AS application

WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

COPY requirements.txt .

RUN pip install --no-cache-dir -r requirements.txt

RUN addgroup --system app \
    && adduser --system --ingroup app --no-create-home app \
    && mkdir -p /var/lib/vpnpanel-monitor \
    && chown app:app /var/lib/vpnpanel-monitor

# HAProxy для проверки конфигурации, без запуска сервиса
RUN apt-get update \
    && apt-get install -y --no-install-recommends haproxy \
    && rm -rf /var/lib/apt/lists/*


COPY --chown=app:app . .

USER app

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--proxy-headers", "--limit-concurrency", "100", "--timeout-keep-alive", "10"]

FROM application AS vpn-monitor
COPY --from=vpn-engine --chmod=755 /usr/local/bin/xray /usr/local/bin/xray
