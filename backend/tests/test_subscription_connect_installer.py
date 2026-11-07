import os
from pathlib import Path
import shutil
import subprocess
from tempfile import TemporaryDirectory
import unittest

SCRIPTS = Path(__file__).resolve().parents[2] / "scripts"
SHELL = os.environ.get("DLGTW_TEST_SHELL") or shutil.which("sh")


@unittest.skipUnless(SHELL and (SCRIPTS / "install-subscription-connect.sh").exists(), "Requires repository scripts and a POSIX shell")
class SubscriptionConnectInstallerTests(unittest.TestCase):
    def setUp(self):
        self.temp = TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        (self.root / "scripts").mkdir()
        (self.root / "bin").mkdir()
        shutil.copy2(SCRIPTS / "install-subscription-connect.sh", self.root / "scripts")
        (self.root / "scripts/wait-panel-health.sh").write_text("#!/bin/sh\nexit 0\n", encoding="utf-8", newline="\n")
        self.env = {**os.environ, "PATH": os.pathsep.join([str(self.root / "bin"), str(Path(SHELL).parent), os.environ.get("PATH", "")]), "CASE_DIR": self.root.as_posix(), "HOME": (self.root / "home").as_posix(), "FAIL_AT": "none"}
        (self.root / "bin/docker").write_text('''#!/bin/sh
set -eu
printf '%s\\n' "$*" >> "$CASE_DIR/commands"
case "$*" in
  *"ps -q frontend"*) if [ "$FAIL_AT" != "missing-frontend" ]; then printf 'frontend-id\\n'; fi ;;
  *"inspect --format {{.Image}}"*) printf 'sha256:old-image\\n' ;;
  *"inspect --format {{.Config.Image}}"*) printf 'vpnpanel-frontend\\n' ;;
  *pg_dump*) if [ "$FAIL_AT" = "backup" ]; then exit 1; fi; printf 'DUMP\\n' ;;
  *"pg_restore --list"*) cat >/dev/null; printf 'TOC\\n' ;;
  *"build frontend"*) if [ "$FAIL_AT" = "build" ]; then exit 1; fi ;;
  *"npm test"*) if [ "$FAIL_AT" = "tests" ]; then exit 1; fi ;;
esac
''', encoding="utf-8", newline="\n")
        (self.root / "bin/curl").write_text('''#!/bin/sh
printf 'curl %s\\n' "$*" >> "$CASE_DIR/commands"
[ "$FAIL_AT" != "postflight" ]
''', encoding="utf-8", newline="\n")
        for file in (self.root / "bin").iterdir():
            file.chmod(0o755)

    def run_installer(self):
        return subprocess.run([SHELL, (self.root / "scripts/install-subscription-connect.sh").as_posix()], cwd=self.root, env=self.env, text=True, capture_output=True, timeout=15)

    def test_backup_build_and_tests_precede_frontend_only_recreation(self):
        result = self.run_installer()
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        commands = (self.root / "commands").read_text()
        for item in ("image tag", "pg_restore --list", "build frontend", "npm test"):
            self.assertLess(commands.index(item), commands.index("force-recreate"))
        self.assertIn("--wait-timeout 180 frontend", commands)
        self.assertGreater(commands.index("https://dlgtw.ru/account/dashboard"), commands.index("force-recreate"))
        for forbidden in ("restart", "vpn-relay", "vpn-monitor", "alembic", "compose down", "build backend"):
            self.assertNotIn(forbidden, commands)

    def test_preflight_failures_never_replace_the_running_site(self):
        for failure in ("missing-frontend", "backup", "build", "tests"):
            self.env["FAIL_AT"] = failure
            result = self.run_installer()
            self.assertNotEqual(result.returncode, 0, failure)
            self.assertNotIn("force-recreate", (self.root / "commands").read_text())
            self.assertNotIn("Unified subscription import installed", result.stdout)

    def test_public_page_failure_is_not_reported_as_success(self):
        self.env["FAIL_AT"] = "postflight"
        result = self.run_installer()
        self.assertNotEqual(result.returncode, 0)
        self.assertNotIn("Unified subscription import installed", result.stdout)


if __name__ == "__main__":
    unittest.main()
