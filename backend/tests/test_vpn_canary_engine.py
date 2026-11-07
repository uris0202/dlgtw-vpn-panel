"""Offline integration: two real Xray processes and a private HTTPS target."""

import base64
from datetime import datetime, timedelta, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import ipaddress
import json
import os
from pathlib import Path
import socket
import ssl
import subprocess
from tempfile import TemporaryDirectory
from threading import Event, Thread
import time
import unittest

os.environ.setdefault("DATABASE_URL", "postgresql+psycopg://vpnpanel:vpnpanel@localhost/vpnpanel")
os.environ.setdefault("JWT_SECRET", "test-secret-that-is-longer-than-thirty-two-characters")

from cryptography import x509
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import rsa, x25519
from cryptography.x509.oid import ExtendedKeyUsageOID, NameOID
from app.services.vpn_canary_service import probe_vless


BINARY = os.getenv("VPN_CANARY_XRAY_BINARY", "/usr/local/bin/xray")
IDENTIFIER = "c73bb16b-1c16-48b0-9694-bfb657ca9ce8"


class Handler(BaseHTTPRequestHandler):
    def setup(self):
        self.request.settimeout(3)
        super().setup()
    def do_GET(self):
        self.send_response(204)
        self.end_headers()
    def log_message(self, *_):
        pass


class QuietServer(ThreadingHTTPServer):
    daemon_threads = True
    def handle_error(self, *_):
        pass


@unittest.skipUnless(Path(BINARY).is_file(), "Requires the official Xray binary")
class RealCanaryEngineTests(unittest.TestCase):
    def setUp(self):
        self.temp = TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        root = Path(self.temp.name)
        now = datetime.now(timezone.utc)
        ca_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
        ca_name = x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, "DLGTW test CA")])
        ca_id = x509.SubjectKeyIdentifier.from_public_key(ca_key.public_key())
        ca = (x509.CertificateBuilder().subject_name(ca_name).issuer_name(ca_name).public_key(ca_key.public_key()).serial_number(x509.random_serial_number())
              .not_valid_before(now - timedelta(days=1)).not_valid_after(now + timedelta(days=3))
              .add_extension(x509.BasicConstraints(ca=True, path_length=0), critical=True)
              .add_extension(x509.KeyUsage(digital_signature=True, content_commitment=False, key_encipherment=False, data_encipherment=False, key_agreement=False, key_cert_sign=True, crl_sign=True, encipher_only=False, decipher_only=False), critical=True)
              .add_extension(ca_id, critical=False).add_extension(x509.AuthorityKeyIdentifier.from_issuer_public_key(ca_key.public_key()), critical=False).sign(ca_key, hashes.SHA256()))
        key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
        cert = (x509.CertificateBuilder().subject_name(x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, "probe.test")])).issuer_name(ca_name).public_key(key.public_key()).serial_number(x509.random_serial_number())
                .not_valid_before(now - timedelta(days=1)).not_valid_after(now + timedelta(days=2))
                .add_extension(x509.BasicConstraints(ca=False, path_length=None), critical=True)
                .add_extension(x509.SubjectAlternativeName([x509.DNSName("probe.test"), x509.IPAddress(ipaddress.ip_address("127.0.0.1"))]), critical=False)
                .add_extension(x509.ExtendedKeyUsage([ExtendedKeyUsageOID.SERVER_AUTH]), critical=False)
                .add_extension(x509.KeyUsage(digital_signature=True, content_commitment=False, key_encipherment=True, data_encipherment=False, key_agreement=False, key_cert_sign=False, crl_sign=False, encipher_only=False, decipher_only=False), critical=True)
                .add_extension(x509.SubjectKeyIdentifier.from_public_key(key.public_key()), critical=False)
                .add_extension(x509.AuthorityKeyIdentifier.from_issuer_public_key(ca_key.public_key()), critical=False).sign(ca_key, hashes.SHA256()))
        (root / "ca.pem").write_bytes(ca.public_bytes(serialization.Encoding.PEM))
        (root / "cert.pem").write_bytes(cert.public_bytes(serialization.Encoding.PEM))
        (root / "key.pem").write_bytes(key.private_bytes(serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8, serialization.NoEncryption()))
        self.context = ssl.create_default_context(cafile=str(root / "ca.pem"))
        server_context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
        server_context.load_cert_chain(str(root / "cert.pem"), str(root / "key.pem"))
        server_context.set_alpn_protocols(["h2", "http/1.1"])
        self.https = QuietServer(("127.0.0.1", 0), Handler)
        self.https.socket = server_context.wrap_socket(self.https.socket, server_side=True, do_handshake_on_connect=False)
        thread = Thread(target=self.https.serve_forever, daemon=True); thread.start()
        self.addCleanup(self.https.server_close); self.addCleanup(self.https.shutdown)
        self.target = f"https://127.0.0.1:{self.https.server_port}/generate_204"
        with socket.socket() as listener:
            listener.bind(("127.0.0.1", 0)); self.port = listener.getsockname()[1]
        private = x25519.X25519PrivateKey.generate()
        encode = lambda value: base64.urlsafe_b64encode(value).decode().rstrip("=")
        pub = encode(private.public_key().public_bytes(serialization.Encoding.Raw, serialization.PublicFormat.Raw))
        priv = encode(private.private_bytes(serialization.Encoding.Raw, serialization.PrivateFormat.Raw, serialization.NoEncryption()))
        config = {"log": {"loglevel": "none"}, "inbounds": [{"listen": "127.0.0.1", "port": self.port, "protocol": "vless", "settings": {"clients": [{"id": IDENTIFIER, "flow": "xtls-rprx-vision"}], "decryption": "none"}, "streamSettings": {"network": "tcp", "security": "reality", "realitySettings": {"target": f"127.0.0.1:{self.https.server_port}", "serverNames": ["probe.test"], "privateKey": priv, "shortIds": ["0123456789abcdef"]}}}], "outbounds": [{"protocol": "freedom"}]}
        # New Xray versions block private targets by default; allow only this fixture.
        config["outbounds"][0]["settings"] = {"finalRules": [{"action": "allow", "ip": ["127.0.0.1/32"], "port": str(self.https.server_port), "network": "tcp"}]}
        path = root / "server.json"; path.write_text(json.dumps(config), encoding="utf-8")
        self.process = subprocess.Popen([BINARY, "run", "-config", str(path)], stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, creationflags=subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0)
        self.addCleanup(self.stop_process)
        for _ in range(60):
            if self.process.poll() is not None:
                self.fail("Test Xray server failed to start")
            try:
                with socket.create_connection(("127.0.0.1", self.port), timeout=0.2): break
            except OSError: time.sleep(0.05)
        else: self.fail("Test Xray server did not become ready")
        self.url = f"vless://{IDENTIFIER}@127.0.0.1:{self.port}?security=reality&type=tcp&flow=xtls-rprx-vision&fp=chrome&sni=probe.test&pbk={pub}&sid=0123456789abcdef"

    def stop_process(self):
        if self.process.poll() is None:
            self.process.terminate()
        try: self.process.wait(timeout=3)
        except subprocess.TimeoutExpired:
            self.process.kill(); self.process.wait(timeout=3)

    def test_real_reality_vision_vless_and_verified_https_data_transfer(self):
        self.assertEqual(probe_vless(self.url, Event(), lambda: None, targets=(self.target,), binary=BINARY, target_context=self.context), "up")

    def test_wrong_uuid_cannot_succeed_by_falling_back_to_direct_internet(self):
        wrong = self.url.replace(IDENTIFIER, "9ab681d6-91a1-4875-a0de-2820d54ccfd0")
        self.assertEqual(probe_vless(wrong, Event(), lambda: None, targets=(self.target,), binary=BINARY, target_context=self.context), "down")

    def test_inner_https_certificate_still_has_to_be_trusted(self):
        self.assertEqual(probe_vless(self.url, Event(), lambda: None, targets=(self.target,), binary=BINARY), "unknown")


if __name__ == "__main__":
    unittest.main()
