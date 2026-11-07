import os
from pathlib import Path
import shutil
import subprocess
from tempfile import TemporaryDirectory
import unittest


SCRIPTS = Path(__file__).resolve().parents[2] / "scripts"
SHELL = os.environ.get("DLGTW_TEST_SHELL") or shutil.which("sh")


@unittest.skipUnless(SHELL and (SCRIPTS / "install-server-diagnostics.sh").exists(), "Requires repository shell scripts and a POSIX shell")
class DiagnosticsInstallerTests(unittest.TestCase):
    def setUp(self):
        self.temporary = TemporaryDirectory()
        self.root = Path(self.temporary.name)
        (self.root / "scripts").mkdir()
        (self.root / "bin").mkdir()
        shutil.copy2(SCRIPTS / "install-server-diagnostics.sh", self.root / "scripts")
        (self.root / "scripts/wait-panel-health.sh").write_text("#!/bin/sh\nexit 0\n", encoding="utf-8", newline="\n")
        self.environment = {
            **os.environ,
            "PATH": os.pathsep.join([str(self.root / "bin"), str(Path(SHELL).parent), os.environ.get("PATH", "")]),
            "CASE_DIR": self.root.as_posix(), "HOME": (self.root / "home").as_posix(), "FAIL_AT": "none",
        }
        docker = self.root / "bin/docker"
        docker.write_text('''#!/bin/sh
set -eu
printf '%s\\n' "$*" >> "$CASE_DIR/commands"
case "$*" in
    *pg_dump*)
        if [ "$FAIL_AT" = "backup" ]; then exit 1; fi
        printf 'TEST-DUMP\\n' ;;
    *"pg_restore --list"*) cat >/dev/null; printf 'TEST-TOC\\n' ;;
    *"unittest discover"*) if [ "$FAIL_AT" = "tests" ]; then exit 1; fi ;;
    *"audit_vpn_readiness"*) printf '{"server_id":1,"checks":{}}\\n' ;;
esac
''', encoding="utf-8", newline="\n")
        docker.chmod(0o755)

    def tearDown(self):
        self.temporary.cleanup()

    def run_installer(self):
        return subprocess.run([SHELL, (self.root / "scripts/install-server-diagnostics.sh").as_posix()], cwd=self.root, env=self.environment, text=True, capture_output=True, timeout=15)

    def test_backups_and_tests_precede_recreation_no_vpn_restart(self):
        result = self.run_installer()
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        commands = (self.root / "commands").read_text()
        self.assertLess(commands.index("pg_dump"), commands.index("compose build"))
        self.assertLess(commands.index("pg_restore --list"), commands.index("compose build"))
        self.assertLess(commands.index("unittest discover"), commands.index("force-recreate"))
        self.assertLess(commands.index("npm test"), commands.index("force-recreate"))
        self.assertLess(commands.index("force-recreate"), commands.index("audit_vpn_readiness"))
        self.assertNotIn("vpn-relay", commands)
        self.assertNotIn("alembic", commands)
        self.assertNotIn("down", commands)
        reports = list((self.root / "home").rglob("diagnostics.jsonl"))
        self.assertEqual(len(reports), 1)
        self.assertIn('"server_id":1', reports[0].read_text())

    def test_backup_failure_leaves_running_app_untouched(self):
        self.environment["FAIL_AT"] = "backup"
        self.assertNotEqual(self.run_installer().returncode, 0)
        commands = (self.root / "commands").read_text()
        self.assertNotIn("compose build", commands)
        self.assertNotIn("force-recreate", commands)

    def test_test_failure_leaves_running_app_untouched(self):
        self.environment["FAIL_AT"] = "tests"
        self.assertNotEqual(self.run_installer().returncode, 0)
        commands = (self.root / "commands").read_text()
        self.assertNotIn("force-recreate", commands)
        self.assertNotIn("restart caddy", commands)
        self.assertNotIn("audit_vpn_readiness", commands)


if __name__ == "__main__":
    unittest.main()
