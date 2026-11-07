import os
from pathlib import Path
import shutil
import subprocess
from tempfile import TemporaryDirectory
import unittest


SCRIPTS = Path(__file__).resolve().parents[2] / "scripts"
SHELL = os.environ.get("DLGTW_TEST_SHELL") or shutil.which("sh")


@unittest.skipUnless(SHELL and (SCRIPTS / "install-relay-domain.sh").exists(), "Requires repository scripts and a POSIX shell")
class RelayDomainInstallerTests(unittest.TestCase):
    def setUp(self):
        self.temporary = TemporaryDirectory()
        self.root = Path(self.temporary.name)
        (self.root / "scripts").mkdir()
        (self.root / "bin").mkdir()
        (self.root / "relay").mkdir()
        (self.root / "relay/routes.json").write_text('{"public_host":"139.100.235.247"}')
        (self.root / "relay/haproxy.cfg").write_text("defaults\n    mode tcp\n")
        shutil.copy2(SCRIPTS / "install-relay-domain.sh", self.root / "scripts")
        (self.root / "scripts/wait-panel-health.sh").write_text('#!/bin/sh\nprintf "health\\n" >> "$CASE_DIR/commands"\n', encoding="utf-8", newline="\n")
        self.environment = {
            **os.environ,
            "PATH": os.pathsep.join([str(self.root / "bin"), str(Path(SHELL).parent), os.environ.get("PATH", "")]),
            "HOME": (self.root / "home").as_posix(),
            "CASE_DIR": self.root.as_posix(),
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
    *"--check") if [ "$FAIL_AT" = "dns" ]; then exit 1; fi ;;
    *"force-recreate"*) if [ "$FAIL_AT" = "backend" ]; then exit 1; fi ;;
esac
''', encoding="utf-8", newline="\n")
        docker.chmod(0o755)

    def tearDown(self):
        self.temporary.cleanup()

    def run_installer(self):
        return subprocess.run([SHELL, (self.root / "scripts/install-relay-domain.sh").as_posix(), "vpn.dlgtw.ru", "139.100.235.247"], cwd=self.root, env=self.environment, capture_output=True, text=True, timeout=15)

    def test_checks_dns_before_restarting_backend_and_publishes_only_after_health(self):
        result = self.run_installer()
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        commands = (self.root / "commands").read_text()
        self.assertLess(commands.index("pg_dump"), commands.index("compose build"))
        self.assertLess(commands.index("--check"), commands.index("force-recreate"))
        self.assertLess(commands.index("health"), commands.index("compose exec -T backend python -m app.scripts.set_relay_public_host"))
        self.assertNotIn("vpn-relay", commands)
        self.assertNotIn("frontend", commands)
        self.assertNotIn("alembic", commands)

    def test_dns_mismatch_never_restarts_or_publishes_configuration(self):
        self.environment["FAIL_AT"] = "dns"
        self.assertNotEqual(self.run_installer().returncode, 0)
        commands = (self.root / "commands").read_text()
        self.assertNotIn("force-recreate", commands)
        self.assertNotIn("compose exec -T backend", commands)

    def test_backup_failure_stops_before_build(self):
        self.environment["FAIL_AT"] = "backup"
        self.assertNotEqual(self.run_installer().returncode, 0)
        self.assertNotIn("compose build", (self.root / "commands").read_text())

    def test_backend_restart_failure_never_publishes_hostname(self):
        self.environment["FAIL_AT"] = "backend"
        self.assertNotEqual(self.run_installer().returncode, 0)
        self.assertNotIn("compose exec -T backend", (self.root / "commands").read_text())


if __name__ == "__main__":
    unittest.main()
