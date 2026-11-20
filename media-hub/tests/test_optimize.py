"""Tests for tools/optimize_media.py with synthetic clips. Run: python3 -m unittest tests/test_optimize.py -v"""
import hashlib, json, os, subprocess, sys, tempfile, unittest
from pathlib import Path

TOOL = Path(__file__).resolve().parent.parent / "tools" / "optimize_media.py"


def ff(*args): subprocess.run(["ffmpeg", "-v", "error", "-y", *args], check=True)
def sha(p): return hashlib.sha256(Path(p).read_bytes()).hexdigest()
def probe(p):
    j = json.loads(subprocess.run(["ffprobe", "-v", "error", "-print_format", "json", "-show_streams", str(p)], capture_output=True, text=True).stdout)
    v = next(s for s in j["streams"] if s["codec_type"] == "video"); a = next((s for s in j["streams"] if s["codec_type"] == "audio"), None)
    return v["codec_name"], (a or {}).get("codec_name"), v["width"], v["height"]


class Optimize(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.TemporaryDirectory(); d = cls.d = Path(cls.tmp.name); src = cls.src = d / "src"; src.mkdir()
        lav = ["-f", "lavfi", "-i", "testsrc2=size=640x360:rate=25:duration=2", "-f", "lavfi", "-i", "sine=frequency=330:duration=2"]
        ff(*lav, "-c:v", "libvpx-vp9", "-b:v", "200k", "-deadline", "realtime", "-cpu-used", "8", "-c:a", "libopus", "-shortest", str(src / "ok.webm"))
        ff(*lav, "-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", str(src / "phone.mov"))
        ff(*lav, "-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p", "-c:a", "pcm_s16le", "-shortest", str(src / "pcm.mkv"))
        ff(*lav, "-c:v", "mpeg4", "-q:v", "5", "-c:a", "mp3", "-shortest", str(src / "old.avi"))
        ff("-f", "lavfi", "-i", "testsrc2=size=161x91:rate=10:duration=1", str(src / "tiny.gif"))
        ff(*lav, "-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", "-movflags", "+faststart", str(src / "good.mp4"))
        cls.before = {p.name: sha(p) for p in src.iterdir()}
        cls.out = d / "playable"
        cls.r = subprocess.run([sys.executable, str(TOOL), str(src), "--out", str(cls.out), "--max-width", "320", "--thumbs"], capture_output=True, text=True)
        cls.rep = json.loads((cls.out / "playable-report.json").read_text())
        cls.by = {Path(e["source"]).name: e for e in cls.rep["files"]}

    @classmethod
    def tearDownClass(cls): cls.tmp.cleanup()

    def test_run_ok_and_report_lines(self):
        self.assertEqual(self.r.returncode, 0, self.r.stderr); self.assertIn("Original untouched? Yes", self.r.stdout); self.assertIn("Reusable later?", self.r.stdout)

    def test_originals_never_change(self):
        for p in self.src.iterdir(): self.assertEqual(sha(p), self.before[p.name], p.name)
        self.assertTrue(all(e["source_untouched"] for e in self.rep["files"]))
        self.assertEqual(sorted(p.name for p in self.src.iterdir()), sorted(self.before))       # nothing added next to the originals

    def test_already_playable_is_skipped(self):
        self.assertEqual(self.by["ok.webm"]["action"], "skip"); self.assertEqual(self.by["good.mp4"]["action"], "skip")
        self.assertFalse((self.out / "ok.mp4").exists()); self.assertFalse((self.out / "good.mp4").exists())

    def test_mov_is_remuxed_losslessly_with_faststart(self):
        e = self.by["phone.mov"]; self.assertEqual(e["action"], "remux"); o = self.out / "phone.mp4"
        self.assertEqual(probe(o)[:2], ("h264", "aac")); self.assertEqual(probe(o)[2:], (640, 360))                  # untouched size: copied, not scaled
        data = o.read_bytes(); self.assertLess(data.find(b"moov"), data.find(b"mdat"))                            # faststart

    def test_pcm_audio_only_reencoded(self):
        e = self.by["pcm.mkv"]; self.assertEqual(e["action"], "remux-audio"); self.assertEqual(probe(self.out / "pcm.mp4")[:2], ("h264", "aac"))

    def test_old_codec_encoded_and_capped(self):
        e = self.by["old.avi"]; self.assertEqual(e["action"], "encode"); v, a, w, h = probe(self.out / "old.mp4")
        self.assertEqual((v, a, w), ("h264", "aac", 320)); self.assertEqual(h % 2, 0)

    def test_gif_never_upscaled_even_dims(self):
        v, a, w, h = probe(self.out / "tiny.mp4"); self.assertEqual(v, "h264"); self.assertIsNone(a); self.assertEqual((w, h), (160, 90))

    def test_thumbs_are_separate_files(self):
        self.assertTrue((self.out / "thumbs" / "old.jpg").exists())

    def test_rerun_skips_existing_and_keeps_report(self):
        r = subprocess.run([sys.executable, str(TOOL), str(self.src), "--out", str(self.out)], capture_output=True, text=True)
        self.assertEqual(r.returncode, 0); self.assertIn("copy already exists", r.stdout)
        rep = json.loads((self.out / "playable-report.json").read_text()); self.assertGreaterEqual(len(rep["files"]), 6)

    def test_refuses_to_replace_an_original(self):
        d = self.d / "inplace"; d.mkdir(); ff("-f", "lavfi", "-i", "testsrc2=size=64x64:rate=10:duration=1", "-c:v", "mpeg4", str(d / "x.mp4")); h = sha(d / "x.mp4")
        r = subprocess.run([sys.executable, str(TOOL), str(d / "x.mp4"), "--out", str(d)], capture_output=True, text=True)
        self.assertIn("would replace the original", r.stdout); self.assertEqual(sha(d / "x.mp4"), h)

    def test_dry_run_writes_nothing(self):
        d = self.d / "dry"; r = subprocess.run([sys.executable, str(TOOL), str(self.src / "old.avi"), "--out", str(d), "--dry-run"], capture_output=True, text=True)
        self.assertIn("would encode", r.stdout); self.assertFalse((d / "old.mp4").exists()); self.assertFalse((d / "playable-report.json").exists())


if __name__ == "__main__":
    unittest.main()
