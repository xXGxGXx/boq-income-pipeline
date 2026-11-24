# privacy-scan: ignore-file   (plants fake private data on purpose)
"""Tests for the bundled scripts, with synthetic data only.   python3 -m unittest scripts/test_scripts.py -v"""
import hashlib, http.server, io, os, socketserver, sys, tempfile, threading, unittest
from contextlib import redirect_stdout, redirect_stderr
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import audit_server, privacy_scan, split_build, verify_checksums  # noqa: E402


def quiet(fn, *argv):
    out = io.StringIO()
    with redirect_stdout(out), redirect_stderr(out):
        code = fn(list(argv))
    return code, out.getvalue()


class Privacy(unittest.TestCase):
    def test_finds_each_kind_and_respects_markers(self):
        d = Path(tempfile.mkdtemp())
        (d / "a.jpg").write_bytes(b"\xff\xd8\xff" + b"x" * 50)
        (d / "catalog.json").write_text('{"items":[{"sha256":"x"}]}')
        (d / "n.md").write_text("https://drive.google.com/file/d/1AbCdEfGhIjKlMnOp/view\n/storage/emulated/0/DCIM/a.mp4\n"
                                "a.person@gmail.com and test@example.com\nghp_" + "a" * 36 + "\nmy Secret Shelf\n"
                                "https://drive.google.com/file/d/PLACEHOLDER_000001/view privacy-scan: ok\n")
        terms = d.parent / ("terms-%d.txt" % os.getpid()); terms.write_text("secret shelf\n")
        code, out = quiet(privacy_scan.main, str(d), "--terms", str(terms))
        self.assertEqual(code, 1)
        for cat in ("media", "catalog", "cloud", "device", "email", "secret", "term"):
            self.assertIn("== %s (1)" % cat, out, cat)
        self.assertNotIn("example.com", out); self.assertNotIn("PLACEHOLDER", out)

    def test_reserved_example_domains_are_not_emails(self):
        d = Path(tempfile.mkdtemp()); (d / "t.kt").write_text('url("https://user:pass@hooks.example.com/x") and ops@mail.example.org\n')
        self.assertEqual(quiet(privacy_scan.main, str(d))[0], 0)

    def test_bare_drive_ids(self):
        d = Path(tempfile.mkdtemp())
        (d / "plan.md").write_text("**Drive folders:** primary 1fd66zXGQpdgOjfjme1-XDYNZ_-0kYyHA, backup 1LZa-XlnsM5E5cfFaFKsGozMpoC4rYdVo\n"
                                   "sha256 1d26e8573e39089a126a25b26e62bf61116ab6e6931f9dacfacebea57dd79438 (a hash, not an id)\n"
                                   "build 1AbCdEfGhIjKlMnOpQrStUvWxYz0 with nothing else on this line\n")
        code, out = quiet(privacy_scan.main, str(d))
        self.assertEqual(code, 1); self.assertIn("== cloud (2)", out); self.assertIn("plan.md:1", out); self.assertNotIn("plan.md:2", out)

    def test_clean_folder(self):
        d = Path(tempfile.mkdtemp()); (d / "readme.md").write_text("Nothing here but https://example.com/page\n")
        self.assertEqual(quiet(privacy_scan.main, str(d))[0], 0)

    def test_baseline_accepts_reviewed_findings_only(self):
        d = Path(tempfile.mkdtemp()); (d / "icon.png").write_bytes(b"\x89PNG" + b"x" * 40)
        (d / "notes.md").write_text("intro\nDrive folder 1fd66zXGQpdgOjfjme1-XDYNZ_-0kYyHA\n")
        base = d.parent / ("baseline-%d.txt" % os.getpid())
        self.assertEqual(quiet(privacy_scan.main, str(d), "--write-baseline", str(base))[0], 0)
        self.assertNotIn("1fd66zXGQpdgOjfjme1", base.read_text())                     # stored masked
        code, out = quiet(privacy_scan.main, str(d), "--baseline", str(base))
        self.assertEqual(code, 0, out); self.assertIn("2 already reviewed", out)
        (d / "notes.md").write_text("new first line\nintro\nDrive folder 1fd66zXGQpdgOjfjme1-XDYNZ_-0kYyHA\n")  # moved line: still accepted
        self.assertEqual(quiet(privacy_scan.main, str(d), "--baseline", str(base))[0], 0)
        (d / "leak.md").write_text("ping a.person@gmail.com\n")                                        # anything new still fails
        code, out = quiet(privacy_scan.main, str(d), "--baseline", str(base))
        self.assertEqual(code, 1); self.assertIn("== email (1)", out); self.assertNotIn("== media", out)

    def test_bank_card_and_tax_numbers(self):
        d = Path(tempfile.mkdtemp())
        (d / "pay.md").write_text("Payouts to BoQ BSB 123-456 / Acc 12345678\n"          # all numbers here are made up
                                  "IBAN GB82 WEST 1234 5698 7654 32\ncard 4111 1111 1111 1111\nTFN: 123 456 782\n")
        code, out = quiet(privacy_scan.main, str(d))
        self.assertEqual(code, 1); self.assertIn("== bank (4)", out)
        self.assertNotIn("12345678", out); self.assertNotIn("4111", out)                  # reports never repeat the number
        self.assertIn("••78", out)

    def test_numbers_that_are_not_bank_details(self):
        d = Path(tempfile.mkdtemp())
        (d / "ok.md").write_text("sha 1d26e8573e39089a126a25b26e62bf61116ab6e6931f9dacfacebea57dd79438\n"
                                 "version 1.2.3 on 2026-11-24, run 45343803294, ts 1732400000000\n"
                                 "GitHub account settings; card 4111 1111 1111 1112 (fails Luhn)\n"
                                 "IBAN GB82 WEST 1234 5698 7654 33 (bad checksum); TFN 123 456 789 (bad checksum)\n")
        self.assertEqual(quiet(privacy_scan.main, str(d))[0], 0)

    def test_baseline_never_records_private_terms(self):
        d = Path(tempfile.mkdtemp()); (d / "a.md").write_text("my Secret Shelf\n")
        terms = d.parent / ("terms-b-%d.txt" % os.getpid()); terms.write_text("secret shelf\n")
        base = d.parent / ("baseline-t-%d.txt" % os.getpid())
        self.assertEqual(quiet(privacy_scan.main, str(d), "--terms", str(terms), "--write-baseline", str(base))[0], 2)
        self.assertFalse(base.exists())


class Checksums(unittest.TestCase):
    def test_join_check_only_and_gap(self):
        d = Path(tempfile.mkdtemp()); whole = os.urandom(300_000)
        for n in range(3):
            (d / ("v.zip.part%03d" % n)).write_bytes(whole[n * 100_000:(n + 1) * 100_000])
        self.assertEqual(quiet(verify_checksums.main, "--join", str(d / "v.zip.part*"), "--expect", hashlib.sha256(whole).hexdigest())[0], 0)
        self.assertEqual(sorted(os.listdir(d)), ["v.zip.part000", "v.zip.part001", "v.zip.part002"])        # check only: nothing written
        os.unlink(d / "v.zip.part001")
        self.assertEqual(quiet(verify_checksums.main, "--join", str(d / "v.zip.part*"))[0], 2)


class SplitBuild(unittest.TestCase):
    def test_round_trip(self):
        d = Path(tempfile.mkdtemp()); old = d / "old"; old.mkdir()
        (old / "a.js").write_text("/* A */\nvar a = 1;\n"); (old / "b.js").write_text("/* B */\nvar b = 2;\n")
        js = "/* A */\nvar a = 1;\nvar a2 = 3;\n" + "\n" + "/* B */\nvar b = 2;\n"
        (d / "built.html").write_text("<html><style>\nbody{}\n</style><script type=\"application/json\" id=\"catalog\">{}</script><script>\n" + js + "\n</script></html>")
        code, out = quiet(split_build.main, str(d / "built.html"), "--like", str(old), "--out", str(d / "new"), "--order", "a.js,b.js")
        self.assertEqual(code, 0, out)
        self.assertEqual((d / "new" / "a.js").read_text(), "/* A */\nvar a = 1;\nvar a2 = 3;\n")
        self.assertEqual(quiet(split_build.main, str(d / "built.html"), "--check", str(d / "new"), "--order", "a.js,b.js")[0], 0)
        self.assertEqual(quiet(split_build.main, str(d / "built.html"), "--check", str(old), "--order", "a.js,b.js")[0], 1)


class Audit(unittest.TestCase):
    """An over-trusting server (answers any Host, lists folders) must fail; the audit itself only reads."""
    @classmethod
    def setUpClass(cls):
        cls.dir = tempfile.mkdtemp(); Path(cls.dir, "clip.mp4").write_bytes(os.urandom(3000)); Path(cls.dir, ".env").write_text("password=x\n")
        handler = lambda *a, **k: http.server.SimpleHTTPRequestHandler(*a, directory=cls.dir, **k)
        http.server.SimpleHTTPRequestHandler.log_message = lambda *a: None
        cls.srv = socketserver.TCPServer(("127.0.0.1", 0), handler); cls.port = cls.srv.server_address[1]
        threading.Thread(target=cls.srv.serve_forever, daemon=True).start()

    @classmethod
    def tearDownClass(cls):
        cls.srv.shutdown(); cls.srv.server_close()

    def test_unsafe_server_fails(self):
        code, out = quiet(audit_server.main, "http://127.0.0.1:%d/" % self.port, "--file", "/clip.mp4")
        self.assertEqual(code, 1)
        self.assertIn("FAIL  host", out); self.assertIn("FAIL  traversal", out); self.assertIn("FAIL  range", out)

    def test_unreachable(self):
        with socketserver.TCPServer(("127.0.0.1", 0), http.server.BaseHTTPRequestHandler) as s:
            port = s.server_address[1]
        self.assertEqual(quiet(audit_server.main, "http://127.0.0.1:%d/" % port)[0], 2)


if __name__ == "__main__":
    unittest.main()
