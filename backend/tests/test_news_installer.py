import os
from pathlib import Path
import shutil
import subprocess
from tempfile import TemporaryDirectory
import unittest


SCRIPTS = Path(__file__).resolve().parents[2] / "scripts"
SHELL = os.environ.get("DLGTW_TEST_SHELL") or shutil.which("sh")


@unittest.skipUnless(SHELL and (SCRIPTS / "install-news-account-links.sh").exists(), "Requires repository shell scripts and a POSIX shell")
class NewsInstallerTests(unittest.TestCase):
    def setUp(self):
        self.temporary = TemporaryDirectory()
        self.root = Path(self.temporary.name)
        (self.root / "scripts").mkdir()
        (self.root / "bin").mkdir()
        shutil.copy2(SCRIPTS / "install-news-account-links.sh", self.root / "scripts")
        (self.root / "scripts/wait-panel-health.sh").write_text("#!/bin/sh\nexit 0\n", encoding="utf-8", newline="\n")
        self.environment = {
            **os.environ,
            "PATH": os.pathsep.join([str(self.root / "bin"), str(Path(SHELL).parent), os.environ.get("PATH", "")]),
            "CASE_DIR": self.root.as_posix(),
            "HOME": (self.root / "home").as_posix(),
            "FAIL_AT": "none",
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
    *"alembic upgrade head"*) if [ "$FAIL_AT" = "migration" ]; then exit 1; fi ;;
esac
''', encoding="utf-8", newline="\n")
        docker.chmod(0o755)

    def tearDown(self):
        self.temporary.cleanup()

    def run_installer(self):
        return subprocess.run([SHELL, (self.root / "scripts/install-news-account-links.sh").as_posix()], cwd=self.root, env=self.environment, text=True, capture_output=True, timeout=15)

    def test_backup_and_migration_precede_recreation_and_do_not_touch_relay(self):
        result = self.run_installer()
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        commands = (self.root / "commands").read_text()
        self.assertLess(commands.index("pg_dump"), commands.index("compose build"))
        self.assertLess(commands.index("pg_restore --list"), commands.index("compose build"))
        self.assertLess(commands.index("alembic upgrade head"), commands.index("force-recreate"))
        self.assertNotIn("vpn-relay", commands)
        self.assertNotIn("down", commands)
        self.assertTrue(list((self.root / "home").rglob("database.dump")))

    def test_backup_failure_stops_before_build_and_migration(self):
        self.environment["FAIL_AT"] = "backup"
        result = self.run_installer()
        self.assertNotEqual(result.returncode, 0)
        commands = (self.root / "commands").read_text()
        self.assertNotIn("compose build", commands)
        self.assertNotIn("alembic", commands)
        self.assertNotIn("force-recreate", commands)

    def test_migration_failure_stops_before_app_restart(self):
        self.environment["FAIL_AT"] = "migration"
        result = self.run_installer()
        self.assertNotEqual(result.returncode, 0)
        commands = (self.root / "commands").read_text()
        self.assertNotIn("force-recreate", commands)
        self.assertNotIn("restart caddy", commands)
        self.assertIn("Database backup", result.stderr)


if __name__ == "__main__":
    unittest.main()
