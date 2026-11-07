import os
from pathlib import Path
import shutil
import subprocess
from tempfile import TemporaryDirectory
import unittest

SCRIPTS = Path(__file__).resolve().parents[2] / "scripts"
SHELL = os.environ.get("DLGTW_TEST_SHELL") or shutil.which("sh")


@unittest.skipUnless(SHELL and (SCRIPTS / "install-online-clients.sh").exists(), "Requires repository scripts and a POSIX shell")
class OnlineInstallerTests(unittest.TestCase):
    def setUp(self):
        self.temp = TemporaryDirectory()
        self.root = Path(self.temp.name)
        (self.root / "scripts").mkdir()
        (self.root / "bin").mkdir()
        shutil.copy2(SCRIPTS / "install-online-clients.sh", self.root / "scripts")
        (self.root / "scripts/wait-panel-health.sh").write_text("#!/bin/sh\nexit 0\n", encoding="utf-8", newline="\n")
        self.environment = {**os.environ, "PATH": os.pathsep.join([str(self.root / "bin"), str(Path(SHELL).parent), os.environ.get("PATH", "")]),
                            "CASE_DIR": self.root.as_posix(), "HOME": (self.root / "home").as_posix(), "FAIL_AT": "none"}
        docker = self.root / "bin/docker"
        docker.write_text('''#!/bin/sh
set -eu
printf '%s\\n' "$*" >> "$CASE_DIR/commands"
case "$*" in
    *pg_dump*) if [ "$FAIL_AT" = "backup" ]; then exit 1; fi; printf 'DUMP\\n' ;;
    *"pg_restore --list"*) cat >/dev/null; printf 'TOC\\n' ;;
    *"unittest discover"*|*"npm test"*) if [ "$FAIL_AT" = "tests" ]; then exit 1; fi ;;
esac
''', encoding="utf-8", newline="\n")
        docker.chmod(0o755)

    def tearDown(self):
        self.temp.cleanup()

    def run_installer(self):
        return subprocess.run([SHELL, (self.root / "scripts/install-online-clients.sh").as_posix()], cwd=self.root, env=self.environment, text=True, capture_output=True, timeout=15)

    def test_backup_and_both_test_suites_precede_app_recreation(self):
        result = self.run_installer()
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        commands = (self.root / "commands").read_text()
        self.assertLess(commands.index("pg_restore --list"), commands.index("compose build"))
        self.assertLess(commands.index("unittest discover"), commands.index("force-recreate"))
        self.assertLess(commands.index("npm test"), commands.index("force-recreate"))
        for forbidden in ("vpn-relay", "vpn-monitor", "alembic", "compose down"):
            self.assertNotIn(forbidden, commands)

    def test_backup_failure_prevents_build(self):
        self.environment["FAIL_AT"] = "backup"
        self.assertNotEqual(self.run_installer().returncode, 0)
        self.assertNotIn("compose build", (self.root / "commands").read_text())

    def test_failed_tests_prevent_recreation(self):
        self.environment["FAIL_AT"] = "tests"
        self.assertNotEqual(self.run_installer().returncode, 0)
        self.assertNotIn("force-recreate", (self.root / "commands").read_text())


if __name__ == "__main__":
    unittest.main()
