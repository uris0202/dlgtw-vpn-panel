import os
from pathlib import Path
import shutil
import subprocess
from tempfile import TemporaryDirectory
import unittest

SCRIPTS = Path(__file__).resolve().parents[2] / "scripts"
SHELL = os.environ.get("DLGTW_TEST_SHELL") or shutil.which("sh")


@unittest.skipUnless(SHELL and (SCRIPTS / "install-vpn-session-monitor.sh").exists(), "Requires repository scripts and a POSIX shell")
class SessionInstallerTests(unittest.TestCase):
    def setUp(self):
        self.temp = TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        (self.root / "scripts").mkdir()
        (self.root / "bin").mkdir()
        shutil.copy2(SCRIPTS / "install-vpn-session-monitor.sh", self.root / "scripts")
        (self.root / "scripts/wait-panel-health.sh").write_text("#!/bin/sh\nexit 0\n", encoding="utf-8", newline="\n")
        self.env = {**os.environ, "PATH": os.pathsep.join([str(self.root / "bin"), str(Path(SHELL).parent), os.environ.get("PATH", "")]), "CASE_DIR": self.root.as_posix(), "HOME": (self.root / "home").as_posix(), "FAIL_AT": "none"}
        docker = self.root / "bin/docker"
        docker.write_text('''#!/bin/sh
set -eu
printf '%s\\n' "$*" >> "$CASE_DIR/commands"
case "$*" in
  *"ps -q vpn-monitor"*) printf 'monitor-id\\n' ;;
  *pg_dump*) if [ "$FAIL_AT" = "backup" ]; then exit 1; fi; printf 'DUMP\\n' ;;
  *"pg_restore --list"*) cat >/dev/null; printf 'TOC\\n' ;;
  *"unittest discover"*) if [ "$FAIL_AT" = "tests" ]; then exit 1; fi ;;
esac
''', encoding="utf-8", newline="\n")
        docker.chmod(0o755)

    def run_installer(self):
        return subprocess.run([SHELL, (self.root / "scripts/install-vpn-session-monitor.sh").as_posix()], cwd=self.root, env=self.env, text=True, capture_output=True, timeout=15)

    def test_separate_real_engine_tests_precede_recreation_and_setup_is_never_automatic(self):
        result = self.run_installer()
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        commands = (self.root / "commands").read_text()
        self.assertLess(commands.index("pg_restore --list"), commands.index("build backend"))
        self.assertLess(commands.index("test_vpn_canary*.py"), commands.index("force-recreate"))
        for forbidden in ("--create-profile", "configure_vpn_canary", "vpn-relay", "compose down", "alembic"):
            self.assertNotIn(forbidden, commands)

    def test_backup_or_test_failure_leaves_running_services_untouched(self):
        for failure in ("backup", "tests"):
            self.env["FAIL_AT"] = failure
            self.assertNotEqual(self.run_installer().returncode, 0)
            self.assertNotIn("force-recreate", (self.root / "commands").read_text())


if __name__ == "__main__":
    unittest.main()
