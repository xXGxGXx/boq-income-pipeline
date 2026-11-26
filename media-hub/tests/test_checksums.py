"""verify_checksums.py tests.   Run: python3 -m unittest tests/test_checksums.py -v"""
import hashlib, io, json, os, sys, tempfile, unittest
from contextlib import redirect_stdout, redirect_stderr
from pathlib import Path

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "tools"))
import verify_checksums as vc  # noqa: E402

H = lambda b: hashlib.sha256(b).hexdigest()


def run(*argv):
    out, err = io.StringIO(), io.StringIO()
    with redirect_stdout(out), redirect_stderr(err):
        code = vc.main(list(argv))
    return code, out.getvalue() + err.getvalue()


class Manifests(unittest.TestCase):
    def setUp(self):
        self.d = Path(tempfile.mkdtemp())
        (self.d / "Photos").mkdir(); (self.d / "Photos" / "a.jpg").write_bytes(b"AAA"); (self.d / "clip.mp4").write_bytes(b"BBBB")
        (self.d / "unlisted.png").write_bytes(b"x")

    def test_sha256sum_text_and_bsd(self):
        (self.d / "SHA256SUMS").write_text("%s  Photos/a.jpg\n%s *clip.mp4\n" % (H(b"AAA"), H(b"BBBB")))
        self.assertEqual(run(str(self.d / "SHA256SUMS"))[0], 0)
        (self.d / "bsd.txt").write_text("SHA256 (Photos/a.jpg) = %s\n" % H(b"AAA"))
        self.assertEqual(run(str(self.d / "bsd.txt"))[0], 0)

    def test_json_recovered_style_finds_by_name_and_checks_size(self):
        m = {"version": 6, "media": [{"name": "a.jpg", "size": 3, "sha256": H(b"AAA"), "relativePath": "Somewhere/Else/a.jpg"},
                                    {"name": "clip.mp4", "size": 4, "sha256": H(b"BBBB")}]}
        (self.d / "m.json").write_text(json.dumps(m))
        code, out = run(str(self.d / "m.json"), "--extra")
        self.assertEqual(code, 0, out); self.assertIn("EXTRA     unlisted.png", out)

    def test_media_hub_manifest(self):
        (self.d / "media-manifest.json").write_text(json.dumps({"files": [{"path": "Photos/a.jpg", "sha256": H(b"AAA"), "bytes": 3}]}))
        self.assertEqual(run(str(self.d / "media-manifest.json"))[0], 0)

    def test_missing_different_and_unsafe(self):
        (self.d / "S").write_text("%s  Photos/a.jpg\n%s  clip.mp4\n%s  gone.gif\n%s  ../../etc/passwd\n" % (H(b"zzz"), H(b"BBBB"), H(b"q"), H(b"q")))
        code, out = run(str(self.d / "S"), "--report", str(self.d / "r.json"))
        self.assertEqual(code, 1)
        for want in ("DIFFERENT Photos/a.jpg", "MISSING   gone.gif", "REFUSED   ../../etc/passwd"):
            self.assertIn(want, out)
        self.assertEqual(json.loads((self.d / "r.json").read_text())["counts"], {"ok": 1, "different": 1, "missing": 1, "refused": 1})

    def test_nothing_usable(self):
        (self.d / "empty.txt").write_text("hello\n")
        self.assertEqual(run(str(self.d / "empty.txt"))[0], 2)


class SplitArchives(unittest.TestCase):
    def setUp(self):
        self.d = Path(tempfile.mkdtemp())
        self.whole = bytes(range(256)) * 9000                       # ~2.2 MB, crosses the 1 MiB read size
        size = 250_000
        self.parts = [self.whole[i:i + size] for i in range(0, len(self.whole), size)]
        for n, p in enumerate(self.parts):
            (self.d / ("vault.zip.part%03d" % n)).write_bytes(p)
        self.glob = str(self.d / "vault.zip.part*")

    def test_check_only_writes_nothing(self):
        before = sorted(os.listdir(self.d))
        code, out = run("--join", self.glob, "--expect", H(self.whole))
        self.assertEqual(code, 0, out); self.assertIn("matches the original", out); self.assertIn("nothing written", out)
        self.assertEqual(sorted(os.listdir(self.d)), before)

    def test_numeric_order_not_text_order(self):
        os.rename(self.d / "vault.zip.part000", self.d / "vault.zip.part0")      # part0, part001 ... still numeric
        self.assertEqual(run("--join", self.glob, "--expect", H(self.whole))[0], 0)

    def test_rebuild_and_never_overwrite(self):
        out = self.d / "rebuilt" / "vault.zip"; out.parent.mkdir()
        code, msg = run("--join", self.glob, "--out", str(out), "--expect", H(self.whole))
        self.assertEqual(code, 0, msg); self.assertEqual(out.read_bytes(), self.whole)
        code, msg = run("--join", self.glob, "--out", str(out))
        self.assertEqual(code, 2); self.assertIn("never overwritten", msg)
        self.assertEqual(out.read_bytes(), self.whole)

    def test_wrong_expectation_keeps_nothing(self):
        out = self.d / "x.zip"
        code, msg = run("--join", self.glob, "--out", str(out), "--expect", H(b"other"))
        self.assertEqual(code, 1); self.assertFalse(out.exists()); self.assertFalse(any(".partial-" in f for f in os.listdir(self.d)))

    def test_gap_is_refused(self):
        os.unlink(self.d / "vault.zip.part004")
        code, msg = run("--join", self.glob); self.assertEqual(code, 2); self.assertIn("missing [4]", msg)

    def test_parts_manifest_names_the_bad_part(self):
        sums = "".join("%s  vault.zip.part%03d\n" % (H(p), n) for n, p in enumerate(self.parts))
        (self.d / "parts.sha256").write_text(sums.replace(H(self.parts[2]), H(b"tampered")))
        code, msg = run("--join", self.glob, "--parts-manifest", str(self.d / "parts.sha256"))
        self.assertEqual(code, 1); self.assertIn("vault.zip.part002", msg)


    def test_parts_manifest_must_cover_every_part(self):
        sums = "".join("%s  vault.zip.part%03d\n" % (H(p), n) for n, p in enumerate(self.parts[:-1]))
        manifest = self.d / "incomplete.sha256"
        manifest.write_text(sums)
        code, msg = run("--join", self.glob, "--parts-manifest", str(manifest))
        self.assertEqual(code, 2)
        self.assertIn("must list every input part", msg)
        self.assertIn("missing:", msg)

    def test_parts_manifest_rejects_unexpected_entries(self):
        sums = "".join("%s  vault.zip.part%03d\n" % (H(p), n) for n, p in enumerate(self.parts))
        sums += "%s  vault.zip.part999\n" % H(b"extra")
        manifest = self.d / "unexpected.sha256"
        manifest.write_text(sums)
        code, msg = run("--join", self.glob, "--parts-manifest", str(manifest))
        self.assertEqual(code, 2)
        self.assertIn("unexpected:", msg)

    def test_split_archive_refuses_symlink_parts(self):
        link = self.d / "vault.zip.part999"
        try:
            link.symlink_to(self.d / "vault.zip.part000")
        except (OSError, NotImplementedError):
            self.skipTest("symlinks are unavailable on this platform")
        code, msg = run("--join", self.glob)
        self.assertEqual(code, 2)
        self.assertIn("non-symlink", msg)


if __name__ == "__main__":
    unittest.main()
