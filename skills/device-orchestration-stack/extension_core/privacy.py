# privacy-scan: ignore-file   (this file holds detection patterns, not private data)
"""Privacy router: decides where a search may go, before anything leaves the device.

personal -> local index and the owner's connectors only; never a web search API
public   -> web allowed (query still scrubbed)
mixed    -> local + connectors first; the web gets a scrubbed query, or nothing

The scrubber reuses scripts/privacy_scan.py's patterns when the repository is
present, so one set of rules guards both commits and web queries. On a phone
install without the repository, a smaller built-in set is used.

This rule-based classifier is the floor. An on-device model can make it
stricter, never looser: a query the rules call personal stays personal.
"""
from __future__ import annotations

import importlib.util
import re
from dataclasses import dataclass, field
from pathlib import Path

FIRST_PERSON = ("my", "mine", "our", "ours", "i", "me", "myself", "i've", "i'm", "i'd")

PERSONAL_NOUNS = (
    "photo", "photos", "picture", "pictures", "pic", "pics", "video", "videos", "clip", "clips",
    "file", "files", "document", "documents", "doc", "docs", "download", "downloads",
    "screenshot", "screenshots", "message", "messages", "text", "texts", "sms", "chat", "chats",
    "email", "emails", "inbox", "mail", "contact", "contacts", "calendar", "appointment", "appointments",
    "note", "notes", "folder", "folders", "drive", "library", "vault", "recording", "recordings",
    "voice memo", "voice memos", "playlist", "notifications", "history", "bookmarks", "receipt",
    "receipts", "invoice", "invoices", "account", "accounts", "password", "passwords", "medical",
    "health", "payslip", "tax return", "bank", "statement", "statements", "media", "gallery",
)

PUBLIC_INTENT = (
    "latest", "news", "price", "prices", "cost", "how to", "how do", "how does", "what is", "what are",
    "who is", "who was", "when is", "when was", "when does", "why", "review", "reviews", "compare",
    "comparison", "vs", "versus", "release", "released", "update", "weather", "define", "definition",
    "meaning", "tutorial", "guide", "best", "top", "recipe", "cve", "specs", "documentation", "docs for",
    "alternative", "alternatives", "official",
)

_FALLBACK_PATTERNS = [
    ("email", re.compile(r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b")),
    ("device", re.compile(r"/storage/emulated/\d+/\S*|content://\S+|/sdcard/\S+|/data/data/com\.termux/\S*|"
                          r"[A-Za-z]:\\Users\\\S+|/Users/[\w.-]+/\S*|/home/[\w.-]+/\S*")),
    ("cloud", re.compile(r"https?://(?:drive|docs|photos)\.google\.com/\S+|https?://(?:www\.)?dropbox\.com/\S+|"
                         r"https?://1drv\.ms/\S+|https?://mega\.nz/\S+", re.I)),
    ("secret", re.compile(r"sk-ant-[\w-]{20,}|sk-(?:proj-)?[\w-]{32,}|xai-[A-Za-z0-9]{20,}|gh[pousr]_[A-Za-z0-9]{30,}|"
                          r"AKIA[0-9A-Z]{16}|AIza[\w-]{35}|[Bb]earer\s+[\w.~+/-]{30,}=*")),
]
_PHONE = re.compile(r"(?<!\w)(?:\+?61|0)[2-478](?:[ -]?\d){8}(?!\w)|(?<!\w)\+\d{1,3}(?:[ -]?\d){7,12}(?!\w)")
_LONG_DIGITS = re.compile(r"(?<![\w.])\d(?:[ -]?\d){7,}(?![\w.])")   # card, account, ID-like runs


def _load_scanner():
    """Import scripts/privacy_scan.py from the repository, if this file sits inside it."""
    for parent in Path(__file__).resolve().parents:
        cand = parent / "scripts" / "privacy_scan.py"
        if cand.exists():
            spec = importlib.util.spec_from_file_location("_privacy_scan", cand)
            mod = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(mod)
            return mod
    return None


_SCANNER = _load_scanner()


def _patterns():
    if _SCANNER is not None:
        return list(_SCANNER.PATTERNS)
    return _FALLBACK_PATTERNS


def _words(text: str) -> list[str]:
    return re.findall(r"[a-z0-9']+", text.lower())


def _has_phrase(text: str, phrase: str) -> bool:
    return re.search(r"(?<![\w'])" + re.escape(phrase) + r"(?![\w'])", text.lower()) is not None


def sensitive_findings(text: str, terms: tuple[str, ...] = ()) -> list[str]:
    """Categories of private material found in `text` (empty = none)."""
    found = []
    for cat, rx in _patterns():
        for m in rx.finditer(text):
            if cat == "email" and _SCANNER is not None and _SCANNER.EMAIL_OK.search(m.group(0)):
                continue
            found.append(cat)
    if _SCANNER is not None and _SCANNER.bank_findings(text):
        found.append("bank")
    if _PHONE.search(text):
        found.append("phone")
    if _LONG_DIGITS.search(text) and "bank" not in found:
        found.append("number")
    for t in terms:
        if t and _has_phrase(text, t.lower()):
            found.append("term")
    return sorted(set(found))


def classify(query: str, terms: tuple[str, ...] = ()) -> str:
    """'personal', 'public' or 'mixed'."""
    words = _words(query)
    low = query.lower()
    personal = False
    # first person within a few words of a personal noun, either side:
    # "my tax photos", "photos i took", "the files we shared" (we/us aren't in FIRST_PERSON on purpose)
    for i, w in enumerate(words):
        if w in FIRST_PERSON:
            window = " ".join(words[max(0, i - 3):i] + words[i + 1:i + 5])
            if any(_has_phrase(window, n) for n in PERSONAL_NOUNS):
                personal = True
                break
    if any(_has_phrase(low, t.lower()) for t in terms if t):
        personal = True
    if sensitive_findings(query):
        personal = True
    public = any(_has_phrase(low, p) for p in PUBLIC_INTENT)
    if personal and public:
        return "mixed"
    return "personal" if personal else "public"


@dataclass
class RoutePlan:
    kind: str                         # personal | public | mixed
    use_local: bool = True
    use_connectors: bool = True
    use_web: bool = False
    web_query: str | None = None
    removed: list[str] = field(default_factory=list)
    reason: str = ""


def scrub_for_web(query: str, terms: tuple[str, ...] = ()) -> tuple[str, list[str]]:
    """Remove private material and first-person framing from a query bound for the web."""
    removed = []
    out = query
    for cat, rx in _patterns():
        if rx.search(out):
            removed.append(cat)
            out = rx.sub(" ", out)
    for rx, cat in ((_PHONE, "phone"), (_LONG_DIGITS, "number")):
        if rx.search(out):
            removed.append(cat)
            out = rx.sub(" ", out)
    for t in terms:
        if t and _has_phrase(out, t.lower()):
            removed.append("term")
            out = re.sub(r"(?i)(?<![\w'])" + re.escape(t) + r"(?![\w'])", " ", out)
    # "my <noun>" phrases name the owner's own things: drop them.
    nouns = "|".join(re.escape(n) for n in sorted(PERSONAL_NOUNS, key=len, reverse=True))
    out2 = re.sub(r"(?i)\b(?:my|our|mine)\s+(?:\w+\s+){0,2}?(?:%s)\b" % nouns, " ", out)
    if out2 != out:
        removed.append("own-items")
        out = out2
    out = re.sub(r"(?i)(?<![\w'])(?:%s)(?![\w'])" % "|".join(re.escape(w) for w in FIRST_PERSON), " ", out)
    out = re.sub(r"\s+", " ", out).strip(" ,.?!")
    return out, sorted(set(removed))


def route(query: str, terms: tuple[str, ...] = ()) -> RoutePlan:
    kind = classify(query, terms)
    if kind == "personal":
        return RoutePlan(kind, use_web=False, reason="personal query: local index and connectors only")
    hard = {"bank", "secret", "term"} & set(sensitive_findings(query, terms))
    if hard:
        return RoutePlan(kind, use_web=False, removed=sorted(hard),
                         reason="contains %s: never sent to the web" % ", ".join(sorted(hard)))
    clean, removed = scrub_for_web(query, terms)
    if len(_words(clean)) < 2:
        return RoutePlan(kind, use_web=False, removed=removed,
                         reason="nothing public left to search after removing private parts")
    if kind == "public":
        return RoutePlan(kind, use_local=True, use_connectors=False, use_web=True,
                         web_query=clean, removed=removed, reason="public query")
    return RoutePlan(kind, use_web=True, web_query=clean, removed=removed,
                     reason="mixed: private parts searched locally, the rest on the web")
