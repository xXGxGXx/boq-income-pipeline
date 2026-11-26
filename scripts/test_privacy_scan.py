#!/usr/bin/env python3
"""privacy_scan.py tests: payout folders fail closed, and scan() keeps returning a list.

Run: python3 scripts/test_privacy_scan.py
"""
import io, os, sys, tempfile, unittest
from contextlib import redirect_stdout, redirect_stderr
from pathlib import Path

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__))))
import privacy_scan as ps  # noqa: E402

# Built at runtime so this file's source has no BSB- or account-shaped literals.
FAKE_DETAILS = "BSB " + "0" * 3 + "-" + "0" * 3 + " / account " + "0" * 8 + "\n"
PAYOUT = "Payout & Receiving Details"


def run(*argv):
    out, err = io.StringIO(), io.StringIO()
    with redirect_stdout(out), redirect_stderr(err):
        code = ps.main(list(argv))
    return code, out.getvalue() + err.getvalue()


class PayoutFailsClosed(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        self.folder = self.root / "00 - Handover Protocol" / PAYOUT
        self.folder.mkdir(parents=True)
        self.file = self.folder / "RECEIVING-ACCOUNT.md"
        self.file.write_text(FAKE_DETAILS, encoding="utf-8")

    def tearDown(self):
        self.tmp.cleanup()

    def test_absolute_path_is_a_finding(self):
        code, out = run(str(self.folder))
        self.assertEqual(code, 1, out)
        self.assertIn("== payout (1)", out)
        self.assertIn(PAYOUT, out)

    def test_relative_path_is_a_finding(self):
        cwd = os.getcwd()
        os.chdir(self.root)
        try:
            code, out = run(os.path.join("00 - Handover Protocol", PAYOUT))
        finally:
            os.chdir(cwd)
        self.assertEqual(code, 1, out)
        self.assertIn("== payout", out)

    def test_folder_name_matches_anywhere_and_in_any_case(self):
        for name in ("Payout & Receiving Details/a.md", "x/y/payout & receiving details/z/a.txt",
                     "C:\\Drive\\PAYOUT & RECEIVING DETAILS\\a.md", "/abs/00 - Handover Protocol/Payout & Receiving Details/a.pdf"):
            self.assertTrue(ps.in_never_publish_dir(name), name)
        for name in ("docs/payout-notes.md", "Payout & Receiving Details.md", "research/receiving.md"):
            self.assertFalse(ps.in_never_publish_dir(name), name)

    def test_allow_glob_cannot_accept_it(self):
        code, out = run(str(self.folder), "--allow", "*", "--allow", "*.md")
        self.assertEqual(code, 1, out)
        self.assertIn("== payout", out)

    def test_ignore_file_header_cannot_accept_it(self):
        self.file.write_text("# privacy-scan: ignore-file\n" + FAKE_DETAILS, encoding="utf-8")
        code, out = run(str(self.folder))
        self.assertEqual(code, 1, out)
        self.assertIn("== payout", out)

    def test_baseline_cannot_accept_it(self):
        found = ps.scan([(str(self.file), self.file.read_bytes)])
        baseline = self.root / "baseline.txt"
        baseline.write_text("\n".join(ps.baseline_key(f) for f in found) + "\n", encoding="utf-8")
        code, out = run(str(self.folder), "--baseline", str(baseline))
        self.assertEqual(code, 1, out)
        self.assertIn("== payout", out)
        self.assertNotIn("== bank", out)  # the bank line was accepted; the payout file never is

    def test_write_baseline_refuses(self):
        baseline = self.root / "baseline.txt"
        code, out = run(str(self.folder), "--write-baseline", str(baseline))
        self.assertEqual(code, 2, out)
        self.assertFalse(baseline.exists())

    def test_same_details_elsewhere_are_still_a_bank_finding(self):
        other = self.root / "research"
        other.mkdir()
        (other / "notes.md").write_text(FAKE_DETAILS, encoding="utf-8")
        code, out = run(str(other))
        self.assertEqual(code, 1, out)
        self.assertIn("== bank", out)
        self.assertNotIn("== payout", out)


class ScanContract(unittest.TestCase):
    def test_scan_returns_a_list_of_four_tuples(self):
        # products/build_releases.py and the media-hub-master skill both rely on this shape.
        found = ps.scan([("notes/a.md", lambda: FAKE_DETAILS.encode())])
        self.assertIsInstance(found, list)
        self.assertTrue(found)
        self.assertTrue(all(len(f) == 4 for f in found))
        self.assertEqual(ps.scan([("notes/clean.md", lambda: b"nothing here\n")]), [])

    def test_skill_copy_is_identical(self):
        here = Path(__file__).resolve().parent
        skill = here.parent / ".claude" / "skills" / "media-hub-master" / "scripts" / "privacy_scan.py"
        self.assertEqual((here / "privacy_scan.py").read_bytes(), skill.read_bytes(),
                         "copy scripts/privacy_scan.py over the skill's copy (or the reverse) so both behave the same")


if __name__ == "__main__":
    unittest.main(verbosity=2)
