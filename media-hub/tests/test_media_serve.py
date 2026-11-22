"""Server tests from the Perplexity draft, ported to media_serve.py's real interface.

    python3 -m pytest tests/test_media_serve.py -v

Differences from the draft (the server's public API is unchanged):
  * the server is started as a subprocess from tools/ with --dir (the app folder) and --library (a shared folder);
  * a shared folder is mounted at /library/<folder name>/..., so the sample is /library/library/sample.jpg;
  * there is no /health route: readiness is a TCP connect, and GET / (the app page) stands in for it;
  * fixtures live in a temporary folder (the draft wrote them into the repository) and the port is picked free.
"""
import socket
import subprocess
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

import pytest

SERVER = Path(__file__).resolve().parents[1] / "tools" / "media_serve.py"
SAMPLE = b"\xff\xd8\xff\xe0" + b"A" * 2048            # 2052 bytes, starts like a JPEG


def free_port():
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


@pytest.fixture(scope="module")
def base(tmp_path_factory):
    tmp = tmp_path_factory.mktemp("serve")
    site = tmp / "site"; site.mkdir(); (site / "index.html").write_text("<!doctype html><title>Media Hub</title>")
    (site / "media_serve.py").write_text("print('server source must never be served')\n")
    lib = tmp / "library"; lib.mkdir()
    (lib / "sample.jpg").write_bytes(SAMPLE)
    (lib / "script.py").write_text("print('no')\n")
    (lib / ".hidden").write_text("secret")
    port = free_port()
    proc = subprocess.Popen([sys.executable, str(SERVER), "--dir", str(site), "--library", str(lib), "--port", str(port)],
                            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, env={"MEDIA_SERVE_QUIET": "1", "PATH": "/usr/bin:/bin"})
    for _ in range(100):
        try:
            socket.create_connection(("127.0.0.1", port), timeout=0.2).close(); break
        except OSError:
            time.sleep(0.05)
    else:
        proc.terminate(); raise RuntimeError("server did not start")
    yield "http://127.0.0.1:%d" % port
    proc.terminate(); proc.wait(timeout=5)


def get(base, path, headers=None, method="GET", data=None):
    req = urllib.request.Request(base + path, headers=headers or {}, method=method, data=data)
    try:
        with urllib.request.urlopen(req, timeout=3) as r:
            return r.status, dict(r.headers), r.read()
    except urllib.error.HTTPError as e:
        return e.code, dict(e.headers), e.read()


def test_app_page_answers(base):                      # stands in for the draft's /health
    status, headers, body = get(base, "/")
    assert status == 200 and b"Media Hub" in body
    assert headers["X-Content-Type-Options"] == "nosniff"
    assert "default-src 'self'" in headers["Content-Security-Policy"]


def test_media_file(base):
    status, headers, body = get(base, "/library/library/sample.jpg")
    assert status == 200
    assert headers["Accept-Ranges"] == "bytes"
    assert body == SAMPLE


def test_range_request(base):
    status, headers, body = get(base, "/library/library/sample.jpg", {"Range": "bytes=0-99"})
    assert status == 206
    assert headers["Content-Range"] == "bytes 0-99/2052"
    assert body == SAMPLE[:100]


def test_open_ended_range(base):
    status, headers, body = get(base, "/library/library/sample.jpg", {"Range": "bytes=2000-"})
    assert status == 206
    assert headers["Content-Range"] == "bytes 2000-2051/2052"
    assert body == SAMPLE[2000:]


def test_suffix_range(base):
    status, headers, body = get(base, "/library/library/sample.jpg", {"Range": "bytes=-100"})
    assert status == 206
    assert headers["Content-Range"] == "bytes 1952-2051/2052"
    assert body == SAMPLE[-100:]


def test_unsatisfiable_range(base):
    status, headers, _ = get(base, "/library/library/sample.jpg", {"Range": "bytes=999999-"})
    assert status == 416
    assert headers["Content-Range"] == "bytes */2052"


def test_multi_range_is_ignored(base):
    status, _, body = get(base, "/library/library/sample.jpg", {"Range": "bytes=0-1,10-20"})
    assert status == 200
    assert body == SAMPLE


@pytest.mark.parametrize("path", [
    "/library/library/../../media_serve.py",
    "/library/%2e%2e/media_serve.py",
    "/library/library/%2e%2e/%2e%2e/media_serve.py",
    "/library/..%2fmedia_serve.py",
    "/library/%252e%252e/media_serve.py",              # double-encoded
    "/library/library/..\\..\\media_serve.py",
    "/library/library/.hidden",
    "/library/library/sample.jpg/../../media_serve.py",
    "/media_serve.py",                                 # the app folder holds it, but .py is never served
])
def test_traversal_and_source_blocked(base, path):
    status, _, body = get(base, path)
    assert status in (403, 404)
    assert b"never be served" not in body and b"secret" not in body


def test_non_media_file_in_library_blocked(base):
    status, _, body = get(base, "/library/library/script.py")
    assert status in (403, 404)
    assert b"print" not in body


@pytest.mark.parametrize("method", ["POST", "PUT", "DELETE"])
def test_writes_rejected(base, method):
    status, headers, _ = get(base, "/library/library/sample.jpg", method=method, data=b"x")
    assert status == 405
    assert headers["Allow"] == "GET, HEAD"


def test_foreign_host_rejected(base):                # DNS-rebinding defence
    status, _, _ = get(base, "/", {"Host": "evil.example"})
    assert status in (400, 403, 421)
