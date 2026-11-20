"""Range / path-safety / header tests for tools/media_serve.py.  Run: python3 -m unittest tests/test_range.py -v"""
import http.client, os, sys, tempfile, threading, unittest
from pathlib import Path

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "tools"))
os.environ["MEDIA_SERVE_QUIET"] = "1"
import media_serve  # noqa: E402

DATA = bytes((i * 7 + 3) % 256 for i in range(3 * 1024 * 1024 + 123))     # crosses two 1 MiB chunk boundaries


class ServerCase(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.TemporaryDirectory(); root = Path(cls.tmp.name) / "site"; root.mkdir()
        (root / "index.html").write_text("<!doctype html><title>x</title>")
        (root / "media").mkdir(); (root / "media" / "clip.mp4").write_bytes(DATA); (root / "media" / "tiny.bin").write_bytes(b"0123456789")
        (root / ".secret").write_text("hidden"); (root / "tool.py").write_text("print(1)")
        outside = Path(cls.tmp.name) / "outside.txt"; outside.write_text("TOP SECRET")
        os.symlink(outside, root / "media" / "link.txt"); os.symlink(Path(cls.tmp.name), root / "linkdir")
        cls.srv = media_serve.make_server(root, "127.0.0.1", 0); cls.port = cls.srv.server_address[1]
        threading.Thread(target=cls.srv.serve_forever, daemon=True).start()

    @classmethod
    def tearDownClass(cls):
        cls.srv.shutdown(); cls.srv.server_close(); cls.tmp.cleanup()

    def req(self, method, path, headers=None, host=None):
        c = http.client.HTTPConnection("127.0.0.1", self.port, timeout=10)
        h = {"Host": host or "127.0.0.1:%d" % self.port}; h.update(headers or {})
        c.request(method, path, headers=h); r = c.getresponse(); body = r.read(); c.close(); return r, body


class TestRange(ServerCase):
    def test_full_file(self):
        r, b = self.req("GET", "/media/clip.mp4"); self.assertEqual(r.status, 200); self.assertEqual(b, DATA)
        self.assertEqual(r.getheader("Accept-Ranges"), "bytes"); self.assertEqual(r.getheader("Content-Type"), "video/mp4")

    def test_simple_range(self):
        r, b = self.req("GET", "/media/tiny.bin", {"Range": "bytes=2-5"})
        self.assertEqual((r.status, b), (206, b"2345")); self.assertEqual(r.getheader("Content-Range"), "bytes 2-5/10"); self.assertEqual(r.getheader("Content-Length"), "4")

    def test_open_ended(self):
        r, b = self.req("GET", "/media/tiny.bin", {"Range": "bytes=7-"}); self.assertEqual((r.status, b), (206, b"789")); self.assertEqual(r.getheader("Content-Range"), "bytes 7-9/10")

    def test_suffix(self):
        r, b = self.req("GET", "/media/tiny.bin", {"Range": "bytes=-4"}); self.assertEqual((r.status, b), (206, b"6789"))
        r, b = self.req("GET", "/media/tiny.bin", {"Range": "bytes=-99"}); self.assertEqual((r.status, b), (206, b"0123456789"))

    def test_end_past_eof_is_clamped(self):
        r, b = self.req("GET", "/media/tiny.bin", {"Range": "bytes=8-999"}); self.assertEqual((r.status, b), (206, b"89")); self.assertEqual(r.getheader("Content-Range"), "bytes 8-9/10")

    def test_unsatisfiable(self):
        for rng in ("bytes=10-", "bytes=50-60", "bytes=-0", "bytes=5-2"):
            r, b = self.req("GET", "/media/tiny.bin", {"Range": rng}); self.assertEqual(r.status, 416, rng); self.assertEqual(r.getheader("Content-Range"), "bytes */10"); self.assertEqual(b, b"")

    def test_multi_range_and_junk_are_ignored(self):
        for rng in ("bytes=0-1,4-5", "items=0-1", "bytes=", "bytes=a-b"):
            r, b = self.req("GET", "/media/tiny.bin", {"Range": rng}); self.assertEqual((r.status, b), (200, b"0123456789"), rng)

    def test_range_across_chunk_boundaries_is_byte_exact(self):
        a, z = 1024 * 1024 - 17, 2 * 1024 * 1024 + 4099
        r, b = self.req("GET", "/media/clip.mp4", {"Range": "bytes=%d-%d" % (a, z)}); self.assertEqual(r.status, 206); self.assertEqual(b, DATA[a:z + 1])

    def test_open_ended_from_middle_of_big_file(self):
        r, b = self.req("GET", "/media/clip.mp4", {"Range": "bytes=2500000-"}); self.assertEqual(b, DATA[2500000:])

    def test_head_has_headers_and_no_body(self):
        r, b = self.req("HEAD", "/media/clip.mp4"); self.assertEqual((r.status, b), (200, b"")); self.assertEqual(r.getheader("Content-Length"), str(len(DATA)))
        r, b = self.req("HEAD", "/media/tiny.bin", {"Range": "bytes=0-3"}); self.assertEqual((r.status, b), (206, b"")); self.assertEqual(r.getheader("Content-Length"), "4")

    def test_etag_and_conditional(self):
        r, _ = self.req("GET", "/media/tiny.bin"); et = r.getheader("ETag"); self.assertTrue(et)
        r, b = self.req("GET", "/media/tiny.bin", {"If-None-Match": et}); self.assertEqual((r.status, b), (304, b""))
        r, b = self.req("GET", "/media/tiny.bin", {"Range": "bytes=0-1", "If-Range": et}); self.assertEqual((r.status, b), (206, b"01"))
        r, b = self.req("GET", "/media/tiny.bin", {"Range": "bytes=0-1", "If-Range": '"stale"'}); self.assertEqual((r.status, b), (200, b"0123456789"))


class TestSafety(ServerCase):
    def test_root_serves_index_with_csp(self):
        r, b = self.req("GET", "/"); self.assertEqual(r.status, 200); self.assertIn("default-src 'self'", r.getheader("Content-Security-Policy"))
        self.assertEqual(r.getheader("X-Content-Type-Options"), "nosniff"); self.assertEqual(r.getheader("Referrer-Policy"), "no-referrer")

    def test_csp_has_only_valid_sources(self):
        r, _ = self.req("GET", "/"); csp = r.getheader("Content-Security-Policy"); self.assertNotIn("[::1]", csp); self.assertIn("object-src 'none'", csp); self.assertIn("base-uri 'none'", csp)

    def test_traversal_variants_are_refused(self):
        for p in ("/../outside.txt", "/%2e%2e/outside.txt", "/media/../../outside.txt", "/media/%2e%2e%2f%2e%2e%2foutside.txt", "/%2e%2e%2foutside.txt",
                  "//etc/passwd", "/media/..%5c..%5coutside.txt", "/media/\\..\\x", "/media/tiny.bin%00.png", "/%252e%252e/outside.txt", "/media/%c0%ae%c0%ae/x"):
            r, b = self.req("GET", p); self.assertIn(r.status, (400, 404), p); self.assertNotIn(b"TOP SECRET", b)

    def test_symlinks_are_refused(self):
        for p in ("/media/link.txt", "/linkdir/outside.txt", "/linkdir"): r, b = self.req("GET", p); self.assertEqual(r.status, 404, p); self.assertNotIn(b"TOP SECRET", b)

    def test_dotfiles_dirs_and_scripts_are_hidden(self):
        for p in ("/.secret", "/tool.py", "/media/", "/media", "/nope"): r, b = self.req("GET", p); self.assertEqual(r.status, 404, p)

    def test_methods(self):
        for m in ("POST", "PUT", "DELETE", "PATCH", "OPTIONS"): r, _ = self.req(m, "/"); self.assertEqual(r.status, 405, m); self.assertEqual(r.getheader("Allow"), "GET, HEAD")

    def test_host_header_is_checked(self):
        for h in ("evil.test", "evil.test:%d" % self.port, "127.0.0.1", "127.0.0.1.evil.test:%d" % self.port, "192.168.1.5:%d" % self.port):
            r, _ = self.req("GET", "/", host=h); self.assertEqual(r.status, 421, h)
        r, _ = self.req("GET", "/", host="localhost:%d" % self.port); self.assertEqual(r.status, 200)

    def test_origin_and_fetch_site(self):
        r, _ = self.req("GET", "/media/tiny.bin", {"Origin": "https://evil.test"}); self.assertEqual(r.status, 403)
        r, _ = self.req("GET", "/media/tiny.bin", {"Origin": "http://127.0.0.1:%d" % self.port}); self.assertEqual(r.status, 200)
        for site in ("cross-site", "same-site"): r, _ = self.req("GET", "/media/tiny.bin", {"Sec-Fetch-Site": site}); self.assertEqual(r.status, 403, site)
        for site in ("same-origin", "none"): r, _ = self.req("GET", "/media/tiny.bin", {"Sec-Fetch-Site": site}); self.assertEqual(r.status, 200, site)

    def test_refuses_non_loopback_bind(self):
        for h in ("0.0.0.0", "192.168.0.10", "example.com", ""):
            with self.assertRaises(SystemExit): media_serve.make_server(".", h, 0)


if __name__ == "__main__":
    unittest.main()
