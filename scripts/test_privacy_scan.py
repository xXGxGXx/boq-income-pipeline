#!/usr/bin/env python3
"""privacy_scan.py tests. Run: python3 -m unittest scripts.test_privacy_scan -v"""
import os, sys, tempfile, unittest
from contextlib import redirect_stdout, redirect_stderr
from pathlib import Path

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__))))
import privacy_scan as ps  # noqa: E402


class PayoutExclusion(unittest.TestCase):
    def test_payout_path_reports_known_positive_not_finding(self):
        d = Path(tempfile.mkdtemp())
        payout = d / "00 - Handover Protocol" / "Payout & Receiving Details"
        payout.mkdir(parents=True)
        (payout / "RECEIVING-ACCOUNT.md").write_text(
            "BSB 000-000 / account 00000000\n", encoding="utf-8")
        code, out = run(str(payout))
        self.assertEqual(code, 0, out)
        self.assertIn("KNOWN_POSITIVE", out)
        self.assertIn("Payout & Receiving Details", out)
        self.assertNotIn("== bank", out)

    def test_same_details_outside_payout_path_is_a_finding(self):
        d = Path(tempfile.mkdtemp())
        other = d / "research"
        other.mkdir()
        (other / "notes.md").write_text(
            "BSB 000-000 / account 00000000\n", encoding="utf-8")
        code, out = run(str(other))
        self.assertEqual(code, 1, out)
        self.assertIn("== bank", out)
        self.assertNotIn("KNOWN_POSITIVE", out)

    def test_exclusion_constant_matches_patch_doc(self):
        self.assertTrue(any("Payout & Receiving Details" in p for p in ps.PAYOUT_EXCLUSION_PATHS))


def run(*argv):
    out, err = io.StringIO(), io.StringIO()
    with redirect_stdout(out), redirect_stderr(err):
        code = ps.main(list(argv))
    out.seek(0); err.seek(0)
    return code, out.read() + err.read()


if __name__ == "__main__":
    import io
    unittest.main(verbosity=2)
