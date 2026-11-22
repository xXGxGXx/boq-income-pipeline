"""Phone-folder mount (--library) and master-folder tests.  Run: python3 -m unittest tests/test_library.py -v"""
import http.client, json, os, sys, tempfile, threading, unittest
from pathlib import Path

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "tools"))
os.environ["MEDIA_SERVE_QUIET"] = "1"
import media_serve  # noqa: E402
import make_master_folder  # noqa: E402

CLIP = bytes((i * 13 + 1) % 256 for i in range(2 * 1024 * 1024 + 77))


class LibraryCase(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.TemporaryDirectory(); t = Path(cls.tmp.name)
        site = t / "site"; site.mkdir(); (site / "index.html").write_text("<!doctype html><title>x</title>")
        cam = t / "DCIM"; (cam / "Camera").mkdir(parents=True); (cam / "Camera" / "IMG 1.jpg").write_bytes(b"\xff\xd8\xff" + b"x" * 100)
        (cam / "Camera" / "clip.mp4").write_bytes(CLIP); (cam / "notes.txt").write_text("not media"); (cam / "script.sh").write_text("echo hi")
        (cam / ".hidden").mkdir(); (cam / ".hidden" / "secret.jpg").write_bytes(b"\xff\xd8\xffsecret"); (cam / ".dot.jpg").write_bytes(b"\xff\xd8\xffdot")
        (cam / "AI" / "Generated").mkdir(parents=True); (cam / "AI" / "Generated" / "dream.png").write_bytes(b"\x89PNG....")
        (cam / "song.mp3").write_bytes(b"ID3" + b"\x00" * 50)
        outside = t / "outside.jpg"; outside.write_bytes(b"\xff\xd8\xffOUTSIDE")
        os.symlink(outside, cam / "link.jpg"); os.symlink(t, cam / "linkdir")
        music = t / "Music"; music.mkdir(); (music / "a.flac").write_bytes(b"fLaC" + b"\x00" * 10)
        dup = t / "x" / "Music"; dup.mkdir(parents=True); (dup / "b.ogg").write_bytes(b"OggS" + b"\x00" * 10)
        cls.srv = media_serve.make_server(site, "127.0.0.1", 0, [str(cam), str(music), str(dup)]); cls.port = cls.srv.server_address[1]
        threading.Thread(target=cls.srv.serve_forever, daemon=True).start()

    @classmethod
    def tearDownClass(cls):
        cls.srv.shutdown(); cls.srv.server_close(); cls.tmp.cleanup()

    def req(self, method, path, headers=None):
        c = http.client.HTTPConnection("127.0.0.1", self.port, timeout=10)
        h = {"Host": "127.0.0.1:%d" % self.port}; h.update(headers or {})
        c.request(method, path, headers=h); r = c.getresponse(); body = r.read(); c.close(); return r, body


class TestLibraryIndex(LibraryCase):
    def index(self):
        r, b = self.req("GET", "/library/index.json"); self.assertEqual(r.status, 200); self.assertEqual(r.getheader("Content-Type"), "application/json"); return json.loads(b)

    def test_roots_unique_names(self):
        names = [x["name"] for x in self.index()["roots"]]
        self.assertEqual(names, ["DCIM", "Music", "Music-2"])

    def test_media_only_no_dot_no_symlink(self):
        paths = {(f["r"], f["p"]) for f in self.index()["files"]}
        self.assertIn(("DCIM", "Camera/IMG 1.jpg"), paths); self.assertIn(("DCIM", "Camera/clip.mp4"), paths); self.assertIn(("DCIM", "AI/Generated/dream.png"), paths)
        self.assertIn(("DCIM", "song.mp3"), paths); self.assertIn(("Music", "a.flac"), paths); self.assertIn(("Music-2", "b.ogg"), paths)
        joined = json.dumps(sorted(paths))
        for bad in ("notes.txt", "script.sh", "secret.jpg", ".dot.jpg", "link.jpg", "linkdir", "outside"):
            self.assertNotIn(bad, joined)

    def test_kinds_and_sizes(self):
        f = {x["p"]: x for x in self.index()["files"] if x["r"] == "DCIM"}
        self.assertEqual(f["Camera/clip.mp4"]["k"], "video"); self.assertEqual(f["Camera/clip.mp4"]["s"], len(CLIP)); self.assertEqual(f["song.mp3"]["k"], "audio"); self.assertEqual(f["Camera/IMG 1.jpg"]["k"], "image")


class TestLibraryFiles(LibraryCase):
    def test_serves_with_range(self):
        r, b = self.req("GET", "/library/DCIM/Camera/clip.mp4"); self.assertEqual(r.status, 200); self.assertEqual(b, CLIP)
        r, b = self.req("GET", "/library/DCIM/Camera/clip.mp4", {"Range": "bytes=1048570-1048590"}); self.assertEqual(r.status, 206); self.assertEqual(b, CLIP[1048570:1048591])
        self.assertEqual(r.getheader("Content-Range"), "bytes 1048570-1048590/%d" % len(CLIP))

    def test_encoded_names(self):
        r, b = self.req("GET", "/library/DCIM/Camera/IMG%201.jpg"); self.assertEqual(r.status, 200); self.assertTrue(b.startswith(b"\xff\xd8\xff"))
        r, _ = self.req("GET", "/library/Music-2/b.ogg"); self.assertEqual(r.status, 200); self.assertEqual(r.getheader("Content-Type"), "audio/ogg")

    def test_refuses_non_media_and_escapes(self):
        for p in ("/library/DCIM/notes.txt", "/library/DCIM/script.sh", "/library/DCIM/.dot.jpg", "/library/DCIM/.hidden/secret.jpg", "/library/DCIM/link.jpg",
                  "/library/DCIM/linkdir/outside.jpg", "/library/DCIM/../outside.jpg", "/library/DCIM/%2e%2e/outside.jpg", "/library/DCIM/%252e%252e/outside.jpg",
                  "/library/DCIM/Camera%5c..%5c..%5coutside.jpg", "/library/DCIM/Camera/clip.mp4%00.jpg", "/library/DCIM/", "/library/DCIM", "/library/Nope/a.jpg",
                  "/library/%2e%2e/site/index.html", "/library/"):
            r, b = self.req("GET", p); self.assertEqual(r.status, 404, p); self.assertNotIn(b"OUTSIDE", b)

    def test_guards_still_apply(self):
        r, _ = self.req("GET", "/library/index.json", {"Origin": "http://evil.example"}); self.assertEqual(r.status, 403)
        r, _ = self.req("GET", "/library/DCIM/Camera/clip.mp4", {"Sec-Fetch-Site": "cross-site"}); self.assertEqual(r.status, 403)
        c = http.client.HTTPConnection("127.0.0.1", self.port, timeout=10); c.request("GET", "/library/index.json", headers={"Host": "evil.example"}); r = c.getresponse(); r.read(); c.close(); self.assertEqual(r.status, 421)

    def test_app_still_served(self):
        r, b = self.req("GET", "/"); self.assertEqual(r.status, 200); self.assertIn(b"<title>x</title>", b)


class TestNoLibrary(unittest.TestCase):
    def test_index_empty_without_library(self):
        with tempfile.TemporaryDirectory() as d:
            srv = media_serve.make_server(d, "127.0.0.1", 0); threading.Thread(target=srv.serve_forever, daemon=True).start()
            try:
                c = http.client.HTTPConnection("127.0.0.1", srv.server_address[1], timeout=10); c.request("GET", "/library/index.json", headers={"Host": "127.0.0.1:%d" % srv.server_address[1]})
                r = c.getresponse(); body = json.loads(r.read()); c.close(); self.assertEqual(r.status, 200); self.assertEqual(body["roots"], []); self.assertEqual(body["files"], [])
                c = http.client.HTTPConnection("127.0.0.1", srv.server_address[1], timeout=10); c.request("GET", "/library/x/a.jpg", headers={"Host": "127.0.0.1:%d" % srv.server_address[1]})
                r = c.getresponse(); r.read(); c.close(); self.assertEqual(r.status, 404)
            finally:
                srv.shutdown(); srv.server_close()


class TestMasterFolder(unittest.TestCase):
    def test_creates_tree_and_keeps_existing(self):
        with tempfile.TemporaryDirectory() as d:
            (Path(d) / "Media Hub Library" / "Photos").mkdir(parents=True); keep = Path(d) / "Media Hub Library" / "Photos" / "mine.jpg"; keep.write_bytes(b"orig")
            root, made = make_master_folder.make(d)
            for rel in ("Inbox", "AI/Generated", "AI/Sourced", "AI/Provided", "Sources/Camera", "My folders"):
                self.assertTrue((Path(root) / rel).is_dir(), rel)
            self.assertNotIn("Photos", made); self.assertEqual(keep.read_bytes(), b"orig"); self.assertTrue((Path(root) / "README.txt").is_file())
            _, again = make_master_folder.make(d); self.assertEqual(again, [])


if __name__ == "__main__":
    unittest.main()
