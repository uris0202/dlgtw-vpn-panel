from contextlib import redirect_stdout
import importlib.util
import io
import json
from pathlib import Path
import socket
import subprocess
from tempfile import TemporaryDirectory
from threading import Thread
import unittest
from unittest.mock import patch
from urllib.error import HTTPError
from urllib.request import urlopen


SCRIPT = Path(__file__).resolve().parents[2] / "scripts/vpn-entry-test.py"


@unittest.skipUnless(SCRIPT.exists(), "Requires repository test-entry scripts outside the backend image")
class VPNEntryTestTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        spec = importlib.util.spec_from_file_location("vpn_entry_test", SCRIPT)
        cls.tool = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(cls.tool)

    def setUp(self):
        self.temporary = TemporaryDirectory()
        self.directory = Path(self.temporary.name)
        self.source = self.directory / "routes.json"
        self.configuration = {"version": 1, "public_host": "vpn.dlgtw.ru", "private_token": "do-not-copy", "routes": [
            {"server_id": 1, "inbound_id": 1, "upstream_ip": "192.0.2.1", "upstream_port": 888, "listen_port": 24443, "password": "do-not-copy"},
            {"server_id": 2, "inbound_id": 2, "upstream_ip": "192.0.2.2", "upstream_port": 30001, "listen_port": 24444},
            {"server_id": 3, "inbound_id": 1, "upstream_ip": "192.0.2.3", "upstream_port": 30001, "listen_port": 24445},
        ]}
        self.source.write_text(json.dumps(self.configuration))
        self.bundle = self.directory / "bundle"

    def tearDown(self):
        self.temporary.cleanup()

    def prepare(self):
        with redirect_stdout(io.StringIO()):
            return self.tool.prepare(self.source, "139.100.230.76", self.bundle)

    def test_prepare_preserves_source_and_copies_no_credentials(self):
        old = self.source.read_bytes()
        manifest = self.prepare()
        self.assertEqual(self.source.read_bytes(), old)
        self.assertEqual([route["listen_port"] for route in manifest["routes"]], [24443, 24444, 24445])
        for path in self.bundle.iterdir():
            self.assertNotIn("do-not-copy", path.read_text(encoding="utf-8"))
        self.assertTrue((self.bundle / "vpn-entry-speed.html").exists())
        self.assertTrue((self.bundle / "vpn-entry-test.py").exists())

    def test_prepare_does_not_overwrite_an_existing_directory(self):
        self.bundle.mkdir()
        with self.assertRaises(FileExistsError):
            self.prepare()

    def test_config_uses_only_new_entry_and_existing_destinations(self):
        manifest = self.prepare()
        config = self.tool.render_config(manifest)
        self.assertIn("bind 139.100.230.76:24443", config)
        self.assertIn("192.0.2.1:888", config)
        self.assertIn("192.0.2.2:30001", config)
        self.assertIn("mode tcp", config)
        self.assertNotIn("ssl", config)
        self.assertNotIn("send-proxy", config)
        self.assertNotIn("stats socket", config)
        self.assertNotIn("139.100.235.247", config)

    def test_rejects_invalid_route_addresses_ports_and_collisions(self):
        variants = [
            {"upstream_ip": "192.0.2.1\nmalicious"}, {"listen_port": 80},
            {"upstream_port": 65536}, {"listen_port": 18080},
        ]
        for changed in variants:
            config = {"routes": [{**self.configuration["routes"][0], **changed}]}
            with self.subTest(changed=changed), self.assertRaises(ValueError):
                self.tool.make_manifest(config, "139.100.230.76")
        for value in ("example.com", "139.100.230.76;command", "::1"):
            with self.subTest(value=value), self.assertRaises(ValueError):
                self.tool.make_manifest(self.configuration, value)

    def test_rejects_duplicate_ports_duplicate_keys_and_empty_routes(self):
        first = self.configuration["routes"][0]
        for routes in ([], [first, first], [first, {**first, "server_id": 2}]):
            with self.assertRaises(ValueError):
                self.tool.make_manifest({"routes": routes}, "139.100.230.76")

    def test_runner_rejects_the_production_machine_before_starting_anything(self):
        self.prepare()
        with patch.object(self.tool, "local_ipv4_addresses", return_value={"139.100.235.247"}), patch.object(self.tool.subprocess, "Popen") as process:
            with self.assertRaisesRegex(ValueError, "Wrong machine"):
                self.tool.run(self.bundle, 30)
            process.assert_not_called()

    def test_runner_rejects_unbounded_duration(self):
        for seconds in (0, 29, 901):
            with self.assertRaisesRegex(ValueError, "Duration"):
                self.tool.run(self.bundle, seconds)

    def test_runner_stops_only_its_own_process_at_deadline(self):
        self.prepare()
        with patch.object(self.tool, "check_machine"), patch.object(self.tool, "probe_routes"), patch.object(self.tool.shutil, "which", return_value="haproxy"), patch.object(self.tool.subprocess, "run"), patch.object(self.tool.subprocess, "Popen") as factory, patch.object(self.tool, "TestHTTPServer") as server, redirect_stdout(io.StringIO()):
            process = factory.return_value
            process.wait.side_effect = [subprocess.TimeoutExpired("haproxy", 30), 0]
            process.poll.return_value = None
            self.tool.run(self.bundle, 30)
            process.terminate.assert_called_once()
            server.return_value.shutdown.assert_called_once()
            server.return_value.server_close.assert_called_once()
            self.assertIn("-db", factory.call_args.args[0])
            self.assertIn("--kill-after=5s", factory.call_args.args[0])
            self.assertTrue(factory.call_args.kwargs["start_new_session"])

    def test_runner_does_not_start_after_syntax_check_failure(self):
        self.prepare()
        with patch.object(self.tool, "check_machine"), patch.object(self.tool.shutil, "which", return_value="haproxy"), patch.object(self.tool.subprocess, "run", side_effect=subprocess.CalledProcessError(1, "haproxy")), patch.object(self.tool.subprocess, "Popen") as process:
            with self.assertRaises(subprocess.CalledProcessError):
                self.tool.run(self.bundle, 30)
            process.assert_not_called()

    def test_http_serves_only_the_test_page_and_public_status(self):
        from functools import partial
        manifest = self.prepare()
        server = self.tool.TestHTTPServer(("127.0.0.1", 0), partial(self.tool.TestHandler, manifest=manifest, html=b"TEST PAGE", expires_at="test"))
        worker = Thread(target=server.serve_forever, daemon=True)
        worker.start()
        base = f"http://127.0.0.1:{server.server_port}"
        try:
            with urlopen(base + "/", timeout=3) as response:
                self.assertEqual(response.read(), b"TEST PAGE")
                self.assertEqual(response.headers["Cache-Control"], "no-store")
            with urlopen(base + "/status", timeout=3) as response:
                data = json.loads(response.read())
                self.assertEqual(data["entry_ip"], "139.100.230.76")
                self.assertEqual(data["ports"], [24443, 24444, 24445])
                self.assertNotIn("do-not-copy", json.dumps(data))
            with self.assertRaises(HTTPError) as failure:
                urlopen(base + "/../.env", timeout=3)
            self.assertEqual(failure.exception.code, 404)
        finally:
            server.shutdown()
            server.server_close()
            worker.join(timeout=3)


if __name__ == "__main__":
    unittest.main()
