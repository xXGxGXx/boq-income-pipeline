#!/usr/bin/env python3
"""make_covers.py - render each Gumroad listing's cover (1280x720) and thumbnail (600x600) from HTML, following the
cover briefs in gumroad/*.md. Images are rendered at 2x for sharp display (2560x1440 and 1200x1200).

    python3 products/make_covers.py --out release-out/covers
    python3 products/make_covers.py --out release-out/covers --media-hub-shots DIR   # DIR holds 1-library-desktop.png
                                                                                       # and 4-library-phone.png
Needs Python Playwright with Chromium. Uses the Inter and JetBrains Mono fonts when installed, else system fonts.
Screenshots must come from the synthetic demo library only (tools/make_demo.py), never from real media.
"""
import argparse, base64, os, sys
from pathlib import Path

PRICES = {"toolkit": "A$19", "ndis": "A$37", "bundle": "A$49", "micro": "A$5", "mediahub": "A$24"}
BASE_CSS = """
*{box-sizing:border-box;margin:0;padding:0}
html,body{width:100%;height:100%}
body{font-family:Inter,'Helvetica Neue',Arial,sans-serif;-webkit-font-smoothing:antialiased;overflow:hidden}
.mono{font-family:'JetBrains Mono','DejaVu Sans Mono',monospace}
"""


def page(body_css, body_html):
    return "<!doctype html><html><head><meta charset='utf-8'><style>%s%s</style></head><body>%s</body></html>" % (BASE_CSS, body_css, body_html)


def toolkit(thumb):
    files = ["privacy_scan.py", "check_repo.py", "verify_checksums.py", "audit_server.py", "split_build.py"]
    if thumb:
        return page("""body{background:#17191c;color:#e8eaed;display:flex;flex-direction:column;justify-content:center;padding:64px}
        .f{font-size:30px;color:#9fd3a8;line-height:1.6}.t{font-size:44px;font-weight:700;margin-top:36px;line-height:1.15}
        .s{font-size:26px;color:#a7adb5;margin-top:14px}""",
                    "<div class='mono f'>%s</div><div class='t'>Privacy and Integrity Toolkit</div><div class='s'>Stdlib only. No install.</div>"
                    % "<br>".join("$ " + f for f in files[:3]))
    return page("""body{background:#17191c;color:#e8eaed;display:grid;grid-template-columns:1.05fr 1fr;align-items:center;padding:0 88px;gap:56px}
    .files{border-left:3px solid #6fbf7d;padding:10px 0 10px 32px}
    .f{font-size:31px;line-height:1.75;color:#cfe9d3}.f span{color:#6fbf7d}
    .big{font-size:58px;font-weight:700;line-height:1.08;letter-spacing:-.01em}
    .sub{font-size:25px;color:#a7adb5;margin-top:22px;line-height:1.4}
    .foot{position:absolute;left:88px;right:88px;bottom:48px;display:flex;justify-content:space-between;font-size:24px;color:#e8eaed}
    .price{color:#6fbf7d;font-weight:700}""",
                """<div class='files mono'>%s</div>
    <div><div class='big'>Stdlib only.<br>No install.</div>
    <div class='sub'>Find keys, bank details and private links before you publish. Catch broken and placeholder files.</div></div>
    <div class='foot'><span>Privacy and Integrity Toolkit</span><span class='price'>%s</span></div>"""
                % ("".join("<div class='f'><span>$</span> %s</div>" % f for f in files), PRICES["toolkit"]))


def ndis(thumb):
    if thumb:
        return page("""body{background:linear-gradient(160deg,#0b2a4a,#0e4d5c);color:#fff;display:flex;flex-direction:column;justify-content:center;padding:64px}
        .t{font-size:56px;font-weight:700;line-height:1.08}.s{font-size:26px;color:#cfe3ea;margin-top:20px;line-height:1.35}
        .p{position:absolute;right:56px;top:52px;font-size:30px;font-weight:700;color:#9be3e0}""",
                    "<div class='p'>%s</div><div class='t'>NDIS SIL Compliance Starter Pack</div><div class='s'>Module 5A workflow, prompts and Word templates</div>" % PRICES["ndis"])
    return page("""body{background:linear-gradient(150deg,#0b2a4a 0%,#0d3f5a 55%,#0e5560 100%);color:#fff;padding:84px 96px}
    .k{font-size:22px;letter-spacing:.14em;text-transform:uppercase;color:#9be3e0;font-weight:600}
    .t{font-size:66px;font-weight:700;line-height:1.06;margin-top:22px;max-width:930px;letter-spacing:-.01em}
    .s{font-size:30px;color:#d6e8ee;margin-top:26px}
    .list{display:flex;gap:14px;margin-top:40px;flex-wrap:wrap}.list span{border:1.5px solid rgba(255,255,255,.35);border-radius:999px;padding:9px 20px;font-size:21px;color:#eaf4f7}
    .p{position:absolute;right:96px;top:84px;font-size:40px;font-weight:700;color:#9be3e0}
    .foot{position:absolute;left:96px;bottom:46px;font-size:19px;color:#a9c6cf}""",
                """<div class='k'>For Australian SIL providers · Registration group 0138</div>
    <div class='t'>NDIS SIL Compliance Starter Pack</div>
    <div class='s'>Module 5A workflow, prompts and Word templates</div>
    <div class='list'><span>Supported decision-making</span><span>Safeguarding</span><span>Practice governance</span><span>Tenancy, housing &amp; support agreements</span></div>
    <div class='p'>%s</div>
    <div class='foot'>Not legal advice. Verify current NDIS Quality and Safeguards Commission requirements.</div>""" % PRICES["ndis"])


def bundle(thumb):
    if thumb:
        return page("""body{background:#0e0f12;color:#f2f2f2;display:flex;flex-direction:column;justify-content:center;padding:64px}
        .a{font-size:34px;color:#ff8a65}.t{font-size:50px;font-weight:700;margin-top:26px;line-height:1.1}.s{font-size:26px;color:#a9a9b3;margin-top:16px}""",
                    "<div class='mono a'>&gt; automation silent</div><div class='t'>You'd know in seconds.</div><div class='s'>AI Governance Bundle · %s</div>" % PRICES["bundle"])
    return page("""body{background:#0e0f12;color:#f2f2f2;display:flex;flex-direction:column;justify-content:center;padding:0 110px}
    .a{font-size:46px;color:#ff8a65}.a b{color:#f2f2f2;font-weight:400}
    .t{font-size:74px;font-weight:700;margin-top:30px;letter-spacing:-.015em}
    .foot{position:absolute;left:110px;right:110px;bottom:52px;display:flex;justify-content:space-between;font-size:24px;color:#a9a9b3;white-space:nowrap}""",
                """<div class='mono a'><b>&gt;</b> Your automation didn't fire.</div>
    <div class='t'>You'd know in seconds.</div>
    <div class='foot'><span>AI Governance Bundle</span><span>%s to try the hook · %s for the system</span></div>"""
                % (PRICES["micro"], PRICES["bundle"]))


def micro(thumb):
    if thumb:
        return page("""body{background:#0e0f12;color:#f2f2f2;display:flex;flex-direction:column;justify-content:center;padding:64px}
        .a{font-size:38px;color:#7ec8ff}.t{font-size:46px;font-weight:700;margin-top:26px}.s{font-size:26px;color:#a9a9b3;margin-top:14px}""",
                    "<div class='mono a'>emit one line<br>on failure.</div><div class='t'>%s to try the hook.</div><div class='s'>AI Governance Micro-Pack</div>" % PRICES["micro"])
    return page("""body{background:#0e0f12;color:#f2f2f2;display:flex;flex-direction:column;justify-content:center;padding:0 110px}
    .a{font-size:56px;color:#7ec8ff}.t{font-size:62px;font-weight:700;margin-top:30px}
    .foot{position:absolute;left:110px;right:110px;bottom:52px;display:flex;justify-content:space-between;font-size:24px;color:#a9a9b3}""",
                """<div class='mono a'>emit one line on failure.</div><div class='t'>%s to try the hook.</div>
    <div class='foot'><span>AI Governance Micro-Pack</span><span>Upgrade to the %s bundle when it works.</span></div>"""
                % (PRICES["micro"], PRICES["bundle"]))


def mediahub(thumb, shots):
    def img(name):
        p = Path(shots or "", name)
        return "data:image/png;base64," + base64.b64encode(p.read_bytes()).decode() if shots and p.is_file() else ""
    desk, phone = img("1-library-desktop.png"), img("4-library-phone.png")
    if thumb:
        return page("""body{background:radial-gradient(circle at 50% 0%,#1d3a6b,#0a1222 75%);color:#fff;text-align:center}
        .t{font-size:62px;font-weight:700;margin-top:52px}.s{font-size:25px;color:#c8d6ee;margin-top:10px}
        .ph{position:absolute;left:50%;transform:translateX(-50%);top:200px;width:300px;border-radius:30px;border:6px solid #26324a;box-shadow:0 20px 60px rgba(0,0,0,.6)}""",
                    "<div class='t'>Media Hub</div><div class='s'>Your media. Your device. No cloud.</div>%s"
                    % ("<img class='ph' src='%s'>" % phone if phone else ""))
    return page("""body{background:radial-gradient(circle at 25% 15%,#1d3a6b,#0a1222 72%);color:#fff}
    .lap{position:absolute;left:64px;top:96px;width:700px;border-radius:14px;border:8px solid #26324a;box-shadow:0 30px 80px rgba(0,0,0,.55)}
    .ph{position:absolute;left:600px;top:250px;width:210px;border-radius:26px;border:6px solid #26324a;box-shadow:0 30px 80px rgba(0,0,0,.6)}
    .txt{position:absolute;left:860px;right:70px;top:190px}
    .t{font-size:72px;font-weight:700;letter-spacing:-.015em}.s{font-size:31px;color:#c8d6ee;margin-top:20px;line-height:1.35}
    .foot{position:absolute;left:860px;bottom:70px;font-size:22px;color:#93a6c6}""",
                """%s%s<div class='txt'><div class='t'>Media Hub</div><div class='s'>Your photos and videos.<br>Your device. No cloud.</div></div>
    <div class='foot'>One file · Offline · No account</div>"""
                % ("<img class='lap' src='%s'>" % desk if desk else "", "<img class='ph' src='%s'>" % phone if phone else ""))


COVERS = {"privacy-integrity-toolkit": toolkit, "ndis-sil-compliance-pack": ndis, "ai-governance-bundle": bundle,
          "ai-governance-micro-pack": micro, "media-hub": mediahub}


def main(argv=None):
    ap = argparse.ArgumentParser(description="Render Gumroad covers and thumbnails.")
    ap.add_argument("--out", required=True)
    ap.add_argument("--media-hub-shots", help="folder with Media Hub screenshots from the synthetic demo")
    a = ap.parse_args(argv)
    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        print("needs Python Playwright: pip install playwright && python3 -m playwright install chromium", file=sys.stderr)
        return 2
    os.makedirs(a.out, exist_ok=True)
    with sync_playwright() as pw:
        browser = pw.chromium.launch()
        for name, fn in COVERS.items():
            for kind, (w, h) in (("cover", (1280, 720)), ("thumbnail", (600, 600))):
                html = fn(kind == "thumbnail", a.media_hub_shots) if fn is mediahub else fn(kind == "thumbnail")
                p = browser.new_page(viewport={"width": w, "height": h}, device_scale_factor=2)
                p.set_content(html)
                p.wait_for_timeout(150)
                path = os.path.join(a.out, "%s-%s.png" % (name, kind))
                p.screenshot(path=path)
                p.close()
                print(path)
        browser.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
