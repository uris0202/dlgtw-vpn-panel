import os
from pathlib import Path
import shutil
import subprocess
from tempfile import TemporaryDirectory
import unittest


SCRIPTS = Path(__file__).resolve().parents[2] / "scripts"
SHELL = os.environ.get("DLGTW_TEST_SHELL") or shutil.which("sh")


@unittest.skipUnless(SHELL and (SCRIPTS / "wait-panel-health.sh").exists(), "Requires repository shell scripts and a POSIX shell")
class RelayInstallerTests(unittest.TestCase):
    def setUp(self):
        self.temporary = TemporaryDirectory()
        self.root = Path(self.temporary.name)
        (self.root / "scripts").mkdir()
        (self.root / "bin").mkdir()
        for name in ("setup-vpn-relay.sh", "wait-panel-health.sh", "prepare-relay-permissions.sh"):
            shutil.copy2(SCRIPTS / name, self.root / "scripts" / name)
        self.environment = {
            **os.environ,
            "PATH": os.pathsep.join([str(self.root / "bin"), str(Path(SHELL).parent), os.environ.get("PATH", "")]),
            "CASE_DIR": self.root.as_posix(),
            "HOME": (self.root / "home").as_posix(),
            "READY_AFTER": "3",
            "FAILURE_CODE": "7",
        }
        self.mock("curl", '''
attempt=0
if [ -f "$CASE_DIR/attempts" ]; then attempt=$(cat "$CASE_DIR/attempts"); fi
attempt=$((attempt + 1))
printf '%s' "$attempt" > "$CASE_DIR/attempts"
printf '%s\\n' "$*" >> "$CASE_DIR/curl-arguments"
if [ "$attempt" -lt "$READY_AFTER" ]; then exit "$FAILURE_CODE"; fi
exit 0
''')
        self.mock("sleep", "exit 0\n")

    def tearDown(self):
        self.temporary.cleanup()

    def mock(self, name, body):
        path = self.root / "bin" / name
        path.write_text("#!/bin/sh\nset -eu\n" + body, encoding="utf-8", newline="\n")
        path.chmod(0o755)

    def run_script(self, name, *arguments):
        return subprocess.run(
            [SHELL, (self.root / "scripts" / name).as_posix(), *arguments],
            cwd=self.root,
            env=self.environment,
            text=True,
            capture_output=True,
            timeout=15,
        )

    def test_connection_refused_is_retried_until_caddy_is_ready(self):
        result = self.run_script("wait-panel-health.sh", "4", "0")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual((self.root / "attempts").read_text(), "3")
        arguments = (self.root / "curl-arguments").read_text()
        self.assertIn("--resolve dlgtw.ru:443:127.0.0.1", arguments)
        self.assertIn("--noproxy *", arguments)
        self.assertIn("https://dlgtw.ru/api/health", arguments)
        self.assertNotIn("--insecure", arguments)

    def test_temporary_http_error_is_also_retried(self):
        self.environment["FAILURE_CODE"] = "22"
        result = self.run_script("wait-panel-health.sh", "4", "0")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual((self.root / "attempts").read_text(), "3")

    def test_persistent_failure_stops_after_a_bounded_number_of_attempts(self):
        self.environment["READY_AFTER"] = "99"
        result = self.run_script("wait-panel-health.sh", "2", "0")
        self.assertEqual(result.returncode, 1)
        self.assertEqual((self.root / "attempts").read_text(), "2")
        self.assertIn("did not become ready", result.stderr)

    def prepare_installer(self):
        relay = self.root / "relay"
        relay.mkdir()
        (relay / "routes.failed.json").write_text('{"version":1,"routes":[]}')
        (relay / "haproxy.next.cfg").write_text("defaults\n    mode tcp\n")
        (relay / "ports.next.txt").write_text("24443\n")
        (relay / "ports.previous.txt").write_text("")
        self.mock("id", "printf '0\\n'\n")
        self.mock("chmod", "exit 0\n")
        self.mock("chown", "exit 0\n")
        self.mock("ufw", "printf 'Status: inactive\\n'\n")
        self.mock("ss", '''
if [ -f "$CASE_DIR/running" ]; then printf 'LISTEN 0 100 0.0.0.0:24443\\n'; fi
''')
        self.mock("docker", '''
printf '%s\\n' "$*" >> "$CASE_DIR/docker-arguments"
case "$*" in
    "compose run --rm --no-deps -T backend id -g") printf '100\\n' ;;
    "compose exec -T postgres "*) printf 'SELECT 1;\\n' ;;
    "compose --profile relay up "*vpn-relay) printf 'running' > "$CASE_DIR/running" ;;
    "compose --profile relay ps --status running -q vpn-relay")
        if [ -f "$CASE_DIR/running" ]; then printf 'relay-container\\n'; fi ;;
    "compose --profile relay stop vpn-relay")
        if [ -f "$CASE_DIR/running" ]; then mv "$CASE_DIR/running" "$CASE_DIR/stopped"; fi ;;
esac
''')

    def test_resume_recovers_saved_routes_without_rebuilding_or_restarting_caddy(self):
        self.prepare_installer()
        result = self.run_script("setup-vpn-relay.sh", "--resume")
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertTrue((self.root / "relay" / "routes.json").exists())
        self.assertTrue((self.root / "running").exists())
        commands = (self.root / "docker-arguments").read_text()
        self.assertNotIn("compose build", commands)
        self.assertNotIn("pull vpn-relay", commands)
        self.assertNotIn("restart caddy", commands)
        self.assertNotIn("force-recreate --wait", commands)
        self.assertIn("compose up -d --no-deps caddy", commands)

    def test_resume_still_rolls_back_when_https_never_becomes_ready(self):
        self.prepare_installer()
        self.environment["READY_AFTER"] = "99"
        result = self.run_script("setup-vpn-relay.sh", "--resume")
        self.assertEqual(result.returncode, 1, result.stdout + result.stderr)
        self.assertFalse((self.root / "relay" / "routes.json").exists())
        self.assertTrue((self.root / "relay" / "routes.failed.json").exists())
        self.assertTrue((self.root / "stopped").exists())


if __name__ == "__main__":
    unittest.main()
