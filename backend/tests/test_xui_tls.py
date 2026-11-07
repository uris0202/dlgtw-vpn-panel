from datetime import datetime, timedelta, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import ipaddress
import io
import json
import os
from pathlib import Path
import ssl
from tempfile import TemporaryDirectory
from threading import Thread
from types import SimpleNamespace
import unittest
from unittest.mock import patch
from contextlib import redirect_stdout

os.environ.setdefault("DATABASE_URL", "postgresql+psycopg://vpnpanel:vpnpanel@localhost/vpnpanel")
os.environ.setdefault("JWT_SECRET", "test-secret-that-is-longer-than-thirty-two-characters")

from cryptography import x509
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.x509.oid import ExtendedKeyUsageOID, NameOID
import httpx

from app.services.xui.client import XUIClient
from app.services.xui_service import XUIService, is_certificate_error
from app.services.xui_tls_service import probe_certificate
from app.scripts import verify_xui_connections as preflight


class RealTLSVerificationTests(unittest.TestCase):
    def start_server(self, expired=False, mismatch=False):
        temporary = TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        directory = Path(temporary.name)
        now = datetime.now(timezone.utc)
        ca_key = ec.generate_private_key(ec.SECP256R1())
        ca_name = x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, "DLGTW Test CA")])
        ca = (x509.CertificateBuilder().subject_name(ca_name).issuer_name(ca_name)
              .public_key(ca_key.public_key()).serial_number(x509.random_serial_number())
              .not_valid_before(now - timedelta(days=3)).not_valid_after(now + timedelta(days=30))
              .add_extension(x509.BasicConstraints(ca=True, path_length=None), critical=True)
              .add_extension(x509.SubjectKeyIdentifier.from_public_key(ca_key.public_key()), critical=False)
              .add_extension(x509.AuthorityKeyIdentifier.from_issuer_public_key(ca_key.public_key()), critical=False)
              .add_extension(x509.KeyUsage(digital_signature=True, content_commitment=False,
                                          key_encipherment=False, data_encipherment=False,
                                          key_agreement=False, key_cert_sign=True, crl_sign=True,
                                          encipher_only=None, decipher_only=None), critical=True)
              .sign(ca_key, hashes.SHA256()))
        key = ec.generate_private_key(ec.SECP256R1())
        name = x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, "Test Server")])
        cert = (x509.CertificateBuilder().subject_name(name).issuer_name(ca_name)
                .public_key(key.public_key()).serial_number(x509.random_serial_number())
                .not_valid_before(now - timedelta(days=2)).not_valid_after(now + timedelta(days=-1 if expired else 7))
                .add_extension(x509.BasicConstraints(ca=False, path_length=None), critical=True)
                .add_extension(x509.SubjectKeyIdentifier.from_public_key(key.public_key()), critical=False)
                .add_extension(x509.AuthorityKeyIdentifier.from_issuer_public_key(ca_key.public_key()), critical=False)
                .add_extension(x509.KeyUsage(digital_signature=True, content_commitment=False,
                                            key_encipherment=False, data_encipherment=False,
                                            key_agreement=False, key_cert_sign=False, crl_sign=False,
                                            encipher_only=None, decipher_only=None), critical=True)
                .add_extension(x509.ExtendedKeyUsage([ExtendedKeyUsageOID.SERVER_AUTH]), critical=False)
                .add_extension(x509.SubjectAlternativeName([x509.IPAddress(ipaddress.ip_address("127.0.0.2" if mismatch else "127.0.0.1"))]), critical=False)
                .sign(ca_key, hashes.SHA256()))
        (directory / "ca.pem").write_bytes(ca.public_bytes(serialization.Encoding.PEM))
        (directory / "cert.pem").write_bytes(cert.public_bytes(serialization.Encoding.PEM))
        (directory / "key.pem").write_bytes(key.private_bytes(serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8, serialization.NoEncryption()))
        received = []
        class Handler(BaseHTTPRequestHandler):
            def do_GET(self):
                received.append(self.path)
                self.respond()
            def do_POST(self):
                received.append(self.path)
                self.rfile.read(int(self.headers.get("Content-Length", "0")))
                self.respond()
            def respond(self):
                body = json.dumps({"success": True, "obj": "test-csrf"}).encode()
                self.send_response(200)
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)
            def log_message(self, *args):
                pass
        server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
        context.load_cert_chain(directory / "cert.pem", directory / "key.pem")
        server.socket = context.wrap_socket(server.socket, server_side=True)
        thread = Thread(target=server.serve_forever, daemon=True)
        thread.start()
        def cleanup():
            server.shutdown()
            server.server_close()
            thread.join(timeout=3)
        self.addCleanup(cleanup)
        trusted = ssl.create_default_context(cafile=str(directory / "ca.pem"))
        # Exercise Python 3.13 defaults on older local interpreters too.
        trusted.verify_flags |= ssl.VERIFY_X509_STRICT | ssl.VERIFY_X509_PARTIAL_CHAIN
        return f"https://127.0.0.1:{server.server_port}", trusted, received

    def test_trusted_valid_certificate_permits_https_request(self):
        address, context, received = self.start_server()
        self.assertTrue(context.verify_flags & ssl.VERIFY_X509_STRICT)
        self.assertTrue(context.verify_flags & ssl.VERIFY_X509_PARTIAL_CHAIN)
        client = XUIClient(address, verify=context)
        try:
            self.assertEqual(client.client.get("/").status_code, 200)
        finally:
            client.close()
        self.assertEqual(received, ["/"])

    def test_untrusted_certificate_is_rejected_before_http_data(self):
        address, _, received = self.start_server()
        client = XUIClient(address, verify=True)
        try:
            with self.assertRaises(httpx.ConnectError) as error:
                client.client.get("/")
            self.assertTrue(is_certificate_error(error.exception))
        finally:
            client.close()
        self.assertEqual(received, [])

    def test_expired_or_address_mismatched_certificate_is_rejected(self):
        for options in ({"expired": True}, {"mismatch": True}):
            with self.subTest(**options):
                address, context, received = self.start_server(**options)
                client = XUIClient(address, verify=context)
                try:
                    with self.assertRaises(httpx.ConnectError) as error:
                        client.client.get("/")
                    self.assertTrue(is_certificate_error(error.exception))
                finally:
                    client.close()
                self.assertEqual(received, [])
                probe = probe_certificate(address, context=context)
                self.assertEqual(probe["verify_code"], 10 if options.get("expired") else 64)

    def test_bad_certificate_only_warns_while_real_api_login_succeeds(self):
        for options in ({}, {"expired": True}, {"mismatch": True}):
            with self.subTest(**options):
                address, context, received = self.start_server(**options)
                # An untrusted CA, expired certificate and IP mismatch are all warnings.
                result = probe_certificate(address, context=context if options else None)
                self.assertEqual(result["state"], "warning")
                self.assertFalse(result["verification_enforced"])
                if options:
                    self.assertEqual(result["verify_code"], 10 if options.get("expired") else 64)
                self.assertEqual(received, [], "The probe must not send HTTP credentials")
                server = SimpleNamespace(host=address, username="test-user", password="test-password", base_path="")
                xui = XUIService.connect(server)
                xui.client.close()
                self.assertIn("/login", received)

    def test_good_certificate_probe_sends_no_http_request(self):
        address, context, received = self.start_server()
        self.assertEqual(probe_certificate(address, context=context)["state"], "ok")
        self.assertEqual(received, [])


class TLSPreflightTests(unittest.TestCase):
    def setUp(self):
        self.server = SimpleNamespace(id=1, name="Germany", host="https://192.0.2.1:10000", enabled=True)
        probe = patch.object(preflight, "probe_certificate", return_value={"state": "warning", "policy": "warning_only", "verification_enforced": False})
        self.probe = probe.start()
        self.addCleanup(probe.stop)

    def test_bad_certificate_does_not_fail_successful_api_preflight(self):
        with patch.object(preflight, "XUIService") as service:
            service.connect.return_value.get_inbounds.return_value = [{"id": 1}]
            result = preflight.verify(self.server)
            self.assertEqual(result["status"], "reachable")
            self.assertEqual(result["certificate"]["state"], "warning")
            service.connect.return_value.client.close.assert_called_once()

    def test_disabled_server_is_skipped_and_legacy_http_is_not_blocked(self):
        with patch.object(preflight, "XUIService") as service:
            self.server.enabled = False
            self.assertEqual(preflight.verify(self.server)["status"], "disabled")
            service.connect.assert_not_called()
            self.server.enabled = True
            self.server.host = "http://192.0.2.1"
            service.connect.return_value.get_inbounds.return_value = []
            self.assertEqual(preflight.verify(self.server)["status"], "reachable")

    def test_failed_preflight_contains_no_credentials_or_full_urls(self):
        with patch.object(preflight, "XUIService") as service:
            service.connect.side_effect = httpx.ConnectTimeout("PRIVATE-URL PRIVATE-PASSWORD")
            result = preflight.verify(self.server)
        self.assertEqual(result["status"], "failed")
        self.assertEqual(result["reason"], "api_or_connection_error")
        self.assertNotIn("PRIVATE", str(result))

    def test_command_succeeds_with_certificate_warning(self):
        with patch.object(preflight, "SessionLocal"), patch.object(preflight, "ServerService") as service, patch.object(preflight, "verify", return_value={"status": "reachable", "certificate": {"state": "warning"}}), redirect_stdout(io.StringIO()):
            service.return_value.get_all.return_value = [self.server]
            self.assertEqual(preflight.main(), 0)

    def test_probe_failure_does_not_block_api_preflight(self):
        self.probe.side_effect = RuntimeError("private URL")
        with patch.object(preflight, "XUIService") as service:
            service.connect.return_value.get_inbounds.return_value = []
            result = preflight.verify(self.server)
        self.assertEqual(result["status"], "reachable")
        self.assertEqual(result["certificate"]["state"], "not_checked")
        self.assertNotIn("private", str(result))


if __name__ == "__main__":
    unittest.main()
