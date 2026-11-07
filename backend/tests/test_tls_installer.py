import os
from pathlib import Path
import shutil
import subprocess
from tempfile import TemporaryDirectory
import unittest


SCRIPTS = Path(__file__).resolve().parents[2] / "scripts"
SHELL = os.environ.get("DLGTW_TEST_SHELL") or shutil.which("sh")


@unittest.skipUnless(SHELL and (SCRIPTS / "install-xui-tls-verification.sh").exists(), "Requires repository scripts and a POSIX shell")
class TLSInstallerTests(unittest.TestCase):
    def setUp(self):
        self.temp = TemporaryDirectory()
        self.root = Path(self.temp.name)
        (self.root / "scripts").mkdir()
        (self.root / "bin").mkdir()
        shutil.copy2(SCRIPTS / "install-xui-tls-verification.sh", self.root / "scripts")
        (self.root / "scripts/wait-panel-health.sh").write_text("#!/bin/sh\nexit 0\n", encoding="utf-8", newline="\n")
        self.environment = {**os.environ, "PATH": os.pathsep.join([str(self.root / "bin"), str(Path(SHELL).parent), os.environ.get("PATH", "")]),
                            "CASE_DIR": self.root.as_posix(), "HOME": (self.root / "home").as_posix(), "FAIL_AT": "none", "MONITOR": "absent"}
        docker = self.root / "bin/docker"
        docker.write_text('''#!/bin/sh
set -eu
printf '%s\\n' "$*" >> "$CASE_DIR/commands"
case "$*" in
    *"config --services"*)
        printf 'backend\\nfrontend\\ncaddy\\n'
        if [ "$MONITOR" != "absent" ]; then printf 'vpn-monitor\\n'; fi ;;
    *"ps --status running --services"*)
        if [ "$MONITOR" = "running" ]; then printf 'vpn-monitor\\n'; fi ;;
    *pg_dump*) if [ "$FAIL_AT" = "backup" ]; then exit 1; fi; printf 'DUMP\\n' ;;
    *"pg_restore --list"*) cat >/dev/null; printf 'TOC\\n' ;;
    *"unittest discover"*) if [ "$FAIL_AT" = "tests" ]; then exit 1; fi ;;
    *"verify_xui_connections"*)
        if [ "$FAIL_AT" = "api" ]; then exit 1; fi
        printf '{"status":"reachable","certificate":{"state":"warning"}}\\n' ;;
    *"audit_vpn_readiness"*) printf '{}\\n' ;;
esac
''', encoding="utf-8", newline="\n")
        docker.chmod(0o755)

    def tearDown(self):
        self.temp.cleanup()

    def run_installer(self):
        return subprocess.run([SHELL, (self.root / "scripts/install-xui-tls-verification.sh").as_posix()], cwd=self.root, env=self.environment, text=True, capture_output=True, timeout=15)

    def test_backup_and_api_preflight_precede_recreation_and_certificate_warning_allows_it(self):
        result = self.run_installer()
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        commands = (self.root / "commands").read_text()
        self.assertLess(commands.index("pg_restore --list"), commands.index("compose build backend"))
        self.assertLess(commands.index("unittest discover"), commands.index("force-recreate"))
        self.assertLess(commands.index("verify_xui_connections"), commands.index("force-recreate"))
        for forbidden in ("vpn-relay", "compose down", "alembic", "build frontend", "recreate --wait --wait-timeout 180 frontend"):
            self.assertNotIn(forbidden, commands)
        self.assertNotIn("build vpn-monitor", commands)
        self.assertIn('"certificate":{"state":"warning"}', result.stdout)

    def test_backup_failure_prevents_build(self):
        self.environment["FAIL_AT"] = "backup"
        self.assertNotEqual(self.run_installer().returncode, 0)
        self.assertNotIn("compose build", (self.root / "commands").read_text())

    def test_failed_tests_or_api_preflight_leave_running_containers_untouched(self):
        for failure in ("tests", "api"):
            self.environment["FAIL_AT"] = failure
            self.assertNotEqual(self.run_installer().returncode, 0)
            commands = (self.root / "commands").read_text()
            self.assertNotIn("force-recreate", commands)
            self.assertNotIn("restart caddy", commands)

    def test_running_monitor_is_rebuilt_and_recreated_after_backend(self):
        self.environment["MONITOR"] = "running"
        result = self.run_installer()
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        commands = (self.root / "commands").read_text()
        self.assertIn("compose --profile monitor build vpn-monitor", commands)
        self.assertIn("wait-timeout 300 vpn-monitor", commands)
        self.assertLess(commands.index("wait-timeout 180 backend"), commands.index("wait-timeout 300 vpn-monitor"))
        self.assertLess(commands.index("restart caddy"), commands.index("wait-timeout 300 vpn-monitor"))

    def test_stopped_monitor_image_is_updated_but_monitor_is_not_started(self):
        self.environment["MONITOR"] = "stopped"
        result = self.run_installer()
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        commands = (self.root / "commands").read_text()
        self.assertIn("compose --profile monitor build vpn-monitor", commands)
        self.assertNotIn("wait-timeout 300 vpn-monitor", commands)


if __name__ == "__main__":
    unittest.main()
