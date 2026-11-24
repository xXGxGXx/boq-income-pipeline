# privacy-scan: ignore-file   (plants a fake key on purpose to prove the build refuses it)
"""Tests for build_releases.py.   python3 products/test_build_releases.py"""
import io, os, subprocess, sys, tempfile, unittest, zipfile
from contextlib import redirect_stderr, redirect_stdout
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import build_releases as br  # noqa: E402


def quiet(*argv):
    out = io.StringIO()
    with redirect_stdout(out), redirect_stderr(out):
        code = br.main(list(argv))
    return code, out.getvalue()


class Releases(unittest.TestCase):
    def test_every_product_builds_reproducibly(self):
        a, b = tempfile.mkdtemp(), tempfile.mkdtemp()
        self.assertEqual(quiet("--out", a)[0], 0)
        self.assertEqual(quiet("--out", b)[0], 0)
        for name in os.listdir(a):
            self.assertEqual(Path(a, name).read_bytes(), Path(b, name).read_bytes(), name)
        self.assertEqual(len([n for n in os.listdir(a) if n.endswith(".zip")]), len(br.PRODUCTS))

    def test_toolkit_zip_is_complete_and_its_tests_pass(self):
        out = tempfile.mkdtemp()
        self.assertEqual(quiet("--out", out, "privacy-integrity-toolkit")[0], 0)
        version = br.PRODUCTS["privacy-integrity-toolkit"]["version"]
        zpath = Path(out, "privacy-integrity-toolkit-%s.zip" % version)
        with zipfile.ZipFile(zpath) as z:
            names = z.namelist()
            folder = "privacy-integrity-toolkit-%s/" % version
            self.assertTrue(all(n.startswith(folder) for n in names))
            for f in ("privacy_scan.py", "check_repo.py", "verify_checksums.py", "audit_server.py", "split_build.py",
                      "README.md", "LICENSE.txt", "SHA256SUMS", "examples/pre-commit"):
                self.assertIn(folder + f, names)
            self.assertEqual((z.getinfo(folder + "examples/pre-commit").external_attr >> 16) & 0o777, 0o755)
            z.extractall(out)
        root = Path(out, folder)
        for test in ("test_scripts.py", "test_check_repo.py"):
            r = subprocess.run([sys.executable, test], cwd=root, capture_output=True, text=True, timeout=300)
            self.assertEqual(r.returncode, 0, r.stderr[-2000:])

    def test_private_material_stops_the_build(self):
        src = tempfile.NamedTemporaryFile("w", suffix=".md", delete=False, dir=br.ROOT)
        src.write("token ghp_" + "a" * 36 + "\n"); src.close()
        try:
            product = {"version": "0.0.1", "date": (2026, 1, 1),
                       "files": [(os.path.relpath(src.name, br.ROOT), "notes.md")]}
            with self.assertRaises(ValueError) as cm:
                br.build_zip("leaky", product)
            self.assertIn("secret", str(cm.exception))
            self.assertNotIn("a" * 36, str(cm.exception))                      # the report stays masked
        finally:
            os.unlink(src.name)

    def test_unknown_product_is_a_usage_error(self):
        with self.assertRaises(SystemExit):
            quiet("--out", tempfile.mkdtemp(), "no-such-product")


if __name__ == "__main__":
    unittest.main(verbosity=1)
