import shutil
import unittest

import test_online_installer as installer_tests


@unittest.skipUnless(
    installer_tests.SHELL
    and (installer_tests.SCRIPTS / "install-online-clients.sh").exists()
    and (installer_tests.SCRIPTS / "install-client-center.sh").exists(),
    "Requires repository scripts and a POSIX shell",
)
class ClientCenterInstallerTests(installer_tests.OnlineInstallerTests):
    def setUp(self):
        super().setUp()
        # Run the same ordering/failure checks against the new installer body.
        shutil.copy2(
            installer_tests.SCRIPTS / "install-client-center.sh",
            self.root / "scripts/install-online-clients.sh",
        )


if __name__ == "__main__":
    unittest.main()
