import os
from pathlib import Path
import shutil
import subprocess
from tempfile import TemporaryDirectory
import unittest

SCRIPTS = Path(__file__).resolve().parents[2] / "scripts"
SHELL = os.environ.get("DLGTW_TEST_SHELL") or shutil.which("sh")


@unittest.skipUnless(SHELL and (SCRIPTS / "install-public-status.sh").exists(), "Requires repository scripts and a POSIX shell")
class PublicStatusInstallerTests(unittest.TestCase):
    def setUp(self):
        self.temp = TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        (self.root / "scripts").mkdir()
        (self.root / "bin").mkdir()
        shutil.copy2(SCRIPTS / "install-public-status.sh", self.root / "scripts")
        (self.root / "scripts/wait-panel-health.sh").write_text("#!/bin/sh\nexit 0\n", encoding="utf-8", newline="\n")
        self.env = {**os.environ, "PATH": os.pathsep.join([str(self.root / "bin"), str(Path(SHELL).parent), os.environ.get("PATH", "")]), "CASE_DIR": self.root.as_posix(), "HOME": (self.root / "home").as_posix(), "FAIL_AT": "none"}
        docker = self.root / "bin/docker"
        docker.write_text('''#!/bin/sh
set -eu
printf '%s\\n' "$*" >> "$CASE_DIR/commands"
case "$*" in
  *"ps -q vpn-monitor"*) if [ "$FAIL_AT" != "missing-monitor" ]; then printf 'monitor-id\\n'; fi ;;
  *pg_dump*) if [ "$FAIL_AT" = "backup" ]; then exit 1; fi; printf 'DUMP\\n' ;;
  *"pg_restore --list"*) cat >/dev/null; printf 'TOC\\n' ;;
  *"incidents.json"*) printf '{"version":1,"incidents":{}}\\n' ;;
  *"unittest discover"*|*"npm test"*) if [ "$FAIL_AT" = "tests" ]; then exit 1; fi ;;
  *public_status_fresh*) if [ "$FAIL_AT" = "postflight" ]; then exit 1; fi ;;
esac
''', encoding="utf-8", newline="\n")
        docker.chmod(0o755)

    def run_installer(self):
        return subprocess.run([SHELL, (self.root / "scripts/install-public-status.sh").as_posix()], cwd=self.root, env=self.env, text=True, capture_output=True, timeout=15)

    def test_backup_tests_and_preflight_precede_only_expected_recreation(self):
        result = self.run_installer()
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        commands = (self.root / "commands").read_text()
        for item in ("pg_restore --list", "incidents.json", "unittest discover", "npm test", "--check-config"):
            self.assertLess(commands.index(item), commands.index("force-recreate"))
        self.assertIn("--wait-timeout 300 backend frontend vpn-monitor", commands)
        self.assertGreater(commands.index("public_status_fresh"), commands.index("force-recreate"))
        self.assertNotIn("vpn-relay", commands)
        self.assertNotIn("compose down", commands)
        self.assertNotIn("alembic", commands)

    def test_missing_monitor_backup_or_tests_failure_stops_before_recreation(self):
        for failure in ("missing-monitor", "backup", "tests"):
            self.env["FAIL_AT"] = failure
            result = self.run_installer()
            self.assertNotEqual(result.returncode, 0, failure)
            self.assertNotIn("force-recreate", (self.root / "commands").read_text())

    def test_failed_volume_postflight_does_not_announce_success(self):
        self.env["FAIL_AT"] = "postflight"
        result = self.run_installer()
        self.assertNotEqual(result.returncode, 0)
        self.assertNotIn("Public infrastructure status:", result.stdout)


if __name__ == "__main__":
    unittest.main()
