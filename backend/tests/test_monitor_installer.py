import os
from pathlib import Path
import shutil
import subprocess
from tempfile import TemporaryDirectory
import unittest


SCRIPTS = Path(__file__).resolve().parents[2] / "scripts"
SHELL = os.environ.get("DLGTW_TEST_SHELL") or shutil.which("sh")


@unittest.skipUnless(SHELL and (SCRIPTS / "install-vpn-monitor.sh").exists(), "Requires repository scripts and a POSIX shell")
class MonitorInstallerTests(unittest.TestCase):
    def setUp(self):
        self.temporary = TemporaryDirectory()
        self.root = Path(self.temporary.name)
        (self.root / "scripts").mkdir()
        (self.root / "bin").mkdir()
        shutil.copy2(SCRIPTS / "install-vpn-monitor.sh", self.root / "scripts")
        self.environment = {**os.environ, "PATH": os.pathsep.join([str(self.root / "bin"), str(Path(SHELL).parent), os.environ.get("PATH", "")]),
                            "CASE_DIR": self.root.as_posix(), "HOME": (self.root / "home").as_posix(), "FAIL_AT": "none"}
        docker = self.root / "bin/docker"
        docker.write_text('''#!/bin/sh
set -eu
printf '%s\\n' "$*" >> "$CASE_DIR/commands"
case "$*" in
    *pg_dump*) if [ "$FAIL_AT" = "backup" ]; then exit 1; fi; printf 'TEST-DUMP\\n' ;;
    *"pg_restore --list"*) cat >/dev/null; printf 'TEST-TOC\\n' ;;
    *"unittest discover"*) if [ "$FAIL_AT" = "tests" ]; then exit 1; fi ;;
    *"--check-config"*) if [ "$FAIL_AT" = "config" ]; then exit 1; fi ;;
esac
''', encoding="utf-8", newline="\n")
        docker.chmod(0o755)

    def tearDown(self):
        self.temporary.cleanup()

    def run_installer(self):
        return subprocess.run([SHELL, (self.root / "scripts/install-vpn-monitor.sh").as_posix()], cwd=self.root, env=self.environment, text=True, capture_output=True, timeout=15)

    def test_only_monitor_is_started_after_backup_tests_and_config_check(self):
        result = self.run_installer()
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        commands = (self.root / "commands").read_text()
        self.assertLess(commands.index("pg_restore --list"), commands.index("compose build vpn-monitor"))
        self.assertLess(commands.index("unittest discover"), commands.index("compose up"))
        self.assertLess(commands.index("--check-config"), commands.index("compose up"))
        self.assertIn("compose up -d --no-deps --wait --wait-timeout 300 vpn-monitor", commands)
        for forbidden in ("restart", "alembic", "compose down", "vpn-relay", "compose build backend", "frontend"):
            self.assertNotIn(forbidden, commands)

    def test_backup_failure_stops_before_build(self):
        self.environment["FAIL_AT"] = "backup"
        self.assertNotEqual(self.run_installer().returncode, 0)
        self.assertNotIn("compose build", (self.root / "commands").read_text())

    def test_failed_tests_prevent_start(self):
        self.environment["FAIL_AT"] = "tests"
        self.assertNotEqual(self.run_installer().returncode, 0)
        self.assertNotIn("compose up", (self.root / "commands").read_text())

    def test_missing_telegram_prevents_start_with_clear_message(self):
        self.environment["FAIL_AT"] = "config"
        result = self.run_installer()
        self.assertNotEqual(result.returncode, 0)
        self.assertNotIn("compose up", (self.root / "commands").read_text())
        self.assertIn("Enable Telegram notifications", result.stderr)


if __name__ == "__main__":
    unittest.main()
