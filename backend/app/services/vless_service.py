import json
import os
from urllib.parse import quote
from urllib.parse import urlencode
from urllib.parse import urlparse


DEFAULT_SUBSCRIPTION_PORT = os.getenv(
    "XUI_SUBSCRIPTION_PORT",
    "2096",
)
DEFAULT_SUBSCRIPTION_PATH = os.getenv(
    "XUI_SUBSCRIPTION_PATH",
    "subs",
).strip("/")


def attach_client_links(
    server,
    clients,
    inbounds,
    subscription_port=None,
    subscription_path=None,
):

    links_by_email = {}

    for inbound in inbounds:

        if inbound.get("protocol") != "vless":
            continue

        settings = load_json(inbound.get("settings"))
        stream_settings = load_json(inbound.get("streamSettings"))

        for client in settings.get("clients", []):

            email = client.get("email")

            if not email:
                continue

            links_by_email[email] = {
                "uuid": client.get("id") or client.get("uuid"),
                "inbound_id": inbound.get("id"),
                "vless_url": build_vless_url(
                    server=server,
                    inbound=inbound,
                    client=client,
                    stream_settings=stream_settings,
                ),
                "subscription_url": build_subscription_url(
                    server=server,
                    client=client,
                    subscription_port=subscription_port,
                    subscription_path=subscription_path,
                ),
            }

    for client in clients:

        client_links = links_by_email.get(client.get("email"), {})

        client.update({
            "uuid": client_links.get("uuid"),
            "inbound_id": client_links.get("inbound_id"),
            "vless_url": client_links.get("vless_url"),
            "subscription_url": client_links.get("subscription_url"),
        })

    return clients


def build_vless_url(server, inbound, client, stream_settings):

    client_id = client.get("id") or client.get("uuid")

    if not client_id:
        return None

    host = get_public_host(server.host)
    port = inbound.get("port")

    if not host or not port:
        return None

    network = stream_settings.get("network") or "tcp"
    security = stream_settings.get("security") or "none"

    params = {
        "encryption": "none",
    }

    flow = client.get("flow")

    if flow:
        params["flow"] = flow

    add_transport_params(params, network, stream_settings)
    add_security_params(params, security, stream_settings, client)

    params["security"] = security
    params["type"] = network

    label = quote(build_label(inbound, client), safe="")
    query = urlencode(order_vless_params(params))

    return f"vless://{client_id}@{host}:{port}?{query}#{label}"


def build_subscription_url(
    server,
    client,
    subscription_port=None,
    subscription_path=None,
):

    sub_id = client.get("subId")

    if not sub_id:
        return None

    parsed = urlparse(str(server.host))
    scheme = parsed.scheme or "https"
    host = get_public_host(server.host)
    port = subscription_port or DEFAULT_SUBSCRIPTION_PORT
    path = (subscription_path or DEFAULT_SUBSCRIPTION_PATH or "subs").strip("/")

    if not host:
        return None

    return (
        f"{scheme}://{host}:{port}"
        f"/{path}/{quote(str(sub_id), safe='')}"
    )


def add_transport_params(params, network, stream_settings):

    if network == "ws":
        ws_settings = stream_settings.get("wsSettings", {})
        headers = ws_settings.get("headers", {})

        if ws_settings.get("path"):
            params["path"] = ws_settings["path"]

        if headers.get("Host"):
            params["host"] = headers["Host"]

    if network == "grpc":
        grpc_settings = stream_settings.get("grpcSettings", {})

        if grpc_settings.get("serviceName"):
            params["serviceName"] = grpc_settings["serviceName"]

        if grpc_settings.get("multiMode") is not None:
            params["mode"] = "multi" if grpc_settings["multiMode"] else "gun"

    if network == "tcp":
        tcp_settings = stream_settings.get("tcpSettings", {})
        header = tcp_settings.get("header", {})

        if header.get("type") and header["type"] != "none":
            params["headerType"] = header["type"]


def add_security_params(params, security, stream_settings, client):

    if security == "tls":
        tls_settings = stream_settings.get("tlsSettings", {})

        if tls_settings.get("serverName"):
            params["sni"] = tls_settings["serverName"]

        if tls_settings.get("fingerprint"):
            params["fp"] = tls_settings["fingerprint"]

        if tls_settings.get("alpn"):
            params["alpn"] = ",".join(tls_settings["alpn"])

    if security == "reality":
        reality_settings = stream_settings.get("realitySettings", {})
        reality_client_settings = reality_settings.get("settings", {})
        server_names = reality_settings.get("serverNames") or []
        short_ids = reality_settings.get("shortIds") or []

        public_key = (
            reality_settings.get("publicKey")
            or reality_client_settings.get("publicKey")
        )

        if public_key:
            params["pbk"] = public_key

        if reality_client_settings.get("fingerprint"):
            params["fp"] = reality_client_settings["fingerprint"]

        short_id = (
            client.get("shortId")
            or client.get("sid")
            or reality_client_settings.get("shortId")
            or get_best_short_id(short_ids)
        )

        if short_id:
            params["sid"] = short_id

        if reality_client_settings.get("serverName"):
            params["sni"] = reality_client_settings["serverName"]
        elif server_names:
            params["sni"] = server_names[0]

        spider_x = (
            client.get("spiderX")
            or client.get("spx")
            or reality_settings.get("spiderX")
            or reality_client_settings.get("spiderX")
        )

        if spider_x:
            params["spx"] = spider_x


def load_json(value):

    if isinstance(value, dict):
        return value

    if not value:
        return {}

    try:
        return json.loads(value)
    except (TypeError, ValueError):
        return {}


def get_public_host(host):

    parsed = urlparse(str(host))

    return parsed.hostname or str(host).split("/")[0].split(":")[0]


def get_best_short_id(short_ids):

    if not short_ids:
        return None

    return max(short_ids, key=len)


def order_vless_params(params):

    ordered_keys = [
        "encryption",
        "flow",
        "fp",
        "pbk",
        "security",
        "sid",
        "sni",
        "spx",
        "type",
    ]

    ordered = {}

    for key in ordered_keys:
        if key in params:
            ordered[key] = params[key]

    for key, value in params.items():
        if key not in ordered:
            ordered[key] = value

    return ordered


def build_label(inbound, client):

    email = client.get("email") or "client"
    remark = inbound.get("remark") or inbound.get("tag")

    if remark:
        return f"{remark}-{email}"

    return email
