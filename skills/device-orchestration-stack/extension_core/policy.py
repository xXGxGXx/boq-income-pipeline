"""Risk tiers T0-T4 and the gate every action passes before it runs.

T0 read · T1 reversible write · T2 external send · T3 irreversible or privileged ·
T4 financial or identity (never executed: the assistant drafts, the owner acts).

The gate is deterministic code, not a model, so a prompt injection can't talk
its way past it. See AI-USER-EXTENSION-PLAN.md section 9.
"""
from __future__ import annotations

import hashlib
import json
import re
from dataclasses import dataclass, field
from enum import IntEnum
from pathlib import Path


class Tier(IntEnum):
    T0 = 0   # read
    T1 = 1   # reversible write
    T2 = 2   # external send / publish
    T3 = 3   # irreversible or privileged
    T4 = 4   # financial or identity


# Base tier for every action the system knows. An action missing from this table
# is treated as T3, so a new tool is never more trusted than it has been made.
ACTION_TIERS: dict[str, Tier] = {
    "control.stop": Tier.T0,
    "search.query": Tier.T0, "search.research": Tier.T0,
    "screen.read": Tier.T0, "screen.scroll": Tier.T0, "screen.back": Tier.T0,
    "screen.home": Tier.T0, "screen.open_menu": Tier.T0,
    "app.open": Tier.T0, "file.open": Tier.T0, "browser.tab.open": Tier.T0,
    "screen.tap": Tier.T1, "screen.type": Tier.T1, "screen.select": Tier.T1,
    "app.close": Tier.T1, "browser.tab.close": Tier.T1,
    "memory.write": Tier.T1, "file.write": Tier.T1, "file.move": Tier.T1, "draft.create": Tier.T1,
    "message.send": Tier.T2, "email.send": Tier.T2, "post.publish": Tier.T2,
    "link.share": Tier.T2, "form.submit": Tier.T2, "git.push_main": Tier.T2, "web.call_unknown": Tier.T2,
    "file.delete": Tier.T3, "memory.forget": Tier.T3, "git.force_push": Tier.T3,
    "app.uninstall": Tier.T3, "settings.change": Tier.T3, "permission.grant": Tier.T3,
    "package.install": Tier.T3, "tool.install": Tier.T3,
    "money.pay": Tier.T4, "money.transfer": Tier.T4, "credential.change": Tier.T4,
    "otp.read": Tier.T4, "bank.details": Tier.T4,
}

# Words in a tap target or typed text that raise the tier: tapping "Pay now" is
# not a T1 tap. Checked as whole words, lowercase.
ESCALATION_WORDS: list[tuple[Tier, tuple[str, ...]]] = [
    (Tier.T4, ("pay", "pay now", "buy", "buy now", "purchase", "checkout", "place order", "transfer",
               "send money", "withdraw", "password", "passcode", "2fa", "one-time code", "otp", "bsb")),
    (Tier.T3, ("delete", "remove", "erase", "trash", "uninstall", "reset", "format", "wipe",
               "force push", "merge", "squash and merge", "revoke", "factory")),
    (Tier.T2, ("send", "post", "publish", "share", "submit", "reply", "tweet", "upload", "invite")),
]

# Apps that Hands may never read or touch. Patterns match Android package names.
DENIED_PACKAGE_PATTERNS = (
    r"bank", r"banking", r"wallet", r"paypal", r"venmo", r"revolut", r"\bwise\b", r"\.wise\.",
    r"commbank", r"westpac", r"\banz\b", r"\.anz", r"\bnab\b", r"\.nab\.", r"stgeorge", r"suncorp",
    r"bendigo", r"macquarie", r"ing\.", r"afterpay", r"zip\.co", r"binance", r"coinbase", r"crypto",
    r"authenticator", r"\.authy", r"1password", r"bitwarden", r"lastpass", r"keepass",
    r"google\.android\.apps\.walletnfcrel",
)

HANDS_PREFIXES = ("screen.", "app.", "browser.")

# Actions whose slots name the thing being pressed, so escalation words apply.
# Value = highest tier escalation may reach (None = no cap). Typing a risky word
# into a box is not doing the risky thing, so typing tops out at a confirmation.
ESCALATING_ACTIONS: dict[str, Tier | None] = {
    "screen.tap": None, "screen.select": None, "screen.type": Tier.T2,
}


@dataclass
class Decision:
    verdict: str                     # "allow" | "confirm" | "deny"
    tier: Tier
    requires: list[str] = field(default_factory=list)   # confirm, biometric, dry_run, cooldown, owner_acts
    reasons: list[str] = field(default_factory=list)

    @property
    def allowed_now(self) -> bool:
        return self.verdict == "allow"


def _has_word(text: str, word: str) -> bool:
    return re.search(r"(?<![\w-])" + re.escape(word) + r"(?![\w-])", text.lower()) is not None


def escalate(base: Tier, *texts: str) -> tuple[Tier, list[str]]:
    """Raise a tier when the target or text names a riskier action."""
    tier, why = base, []
    joined = " ".join(t for t in texts if t)
    for level, words in ESCALATION_WORDS:
        if level <= tier:
            continue
        hit = next((w for w in words if _has_word(joined, w)), None)
        if hit:
            tier = level
            why.append(f"'{hit}' raises this to {level.name}")
            break
    return tier, why


def is_denied_package(package: str | None) -> bool:
    if not package:
        return False
    low = package.lower()
    return any(re.search(p, low) for p in DENIED_PACKAGE_PATTERNS)


def decide(action: str, slots: dict | None = None, *, tainted: bool = False,
           target_package: str | None = None, leaves_device: bool = False,
           unattended: bool = False) -> Decision:
    """The gate.

    tainted        any slot value came from untrusted content (a web page, email, screen text)
    target_package the foreground app a Hands action would touch
    leaves_device  the result will be sent off the device (raises a read to T2)
    unattended     no owner is present to confirm (scheduled job or trusted skill)
    """
    slots = slots or {}
    reasons: list[str] = []
    base = ACTION_TIERS.get(action)
    if base is None:
        base = Tier.T3
        reasons.append(f"unknown action '{action}' is treated as T3")
    tier = base
    if action in ESCALATING_ACTIONS:
        tier, why = escalate(base, *(str(v) for v in slots.values()))
        cap = ESCALATING_ACTIONS[action]
        if cap is not None and tier > cap:
            tier = cap
        reasons += why
    if leaves_device and tier < Tier.T2:
        tier = Tier.T2
        reasons.append("data would leave the device")

    if action.startswith(HANDS_PREFIXES) and is_denied_package(target_package):
        return Decision("deny", max(tier, Tier.T4), ["owner_acts"],
                        reasons + [f"{target_package} is on the denied-apps list (banking, payments, passwords)"])

    if tier == Tier.T4:
        return Decision("deny", tier, ["owner_acts"],
                        reasons + ["financial and identity actions are never executed; a draft is the most the assistant does"])

    requires: list[str] = []
    if tier == Tier.T2:
        requires = ["confirm"]
    elif tier == Tier.T3:
        requires = ["confirm", "biometric", "dry_run", "cooldown"]
    if tainted and tier >= Tier.T2:
        reasons.append("plan contains untrusted content: fresh confirmation needed")
        if "confirm" not in requires:
            requires.insert(0, "confirm")

    if not requires:
        return Decision("allow", tier, [], reasons)
    if unattended:
        return Decision("deny", tier, requires, reasons + ["needs the owner, who is not present"])
    return Decision("confirm", tier, requires, reasons)


# --------------------------------------------------------- tool pins

def canonical(obj) -> bytes:
    return json.dumps(obj, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode("utf-8")


def definition_hash(definition: dict) -> str:
    return hashlib.sha256(canonical(definition)).hexdigest()


class ToolPins:
    """Pin each MCP tool's definition when the owner approves it.

    A tool whose name, description or schema later changes is blocked until it
    is approved again. This stops "rug pulls" (a server changing a tool after approval)
    and tool-description poisoning slipping in through an update.
    """

    def __init__(self, path: Path | str):
        self.path = Path(path)
        self.pins: dict[str, str] = {}
        if self.path.exists():
            self.pins = json.loads(self.path.read_text(encoding="utf-8"))

    def approve(self, server: str, tool: dict) -> str:
        h = definition_hash(tool)
        self.pins[f"{server}/{tool['name']}"] = h
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.path.write_text(json.dumps(self.pins, indent=1, sort_keys=True), encoding="utf-8")
        return h

    def check(self, server: str, tool: dict) -> tuple[bool, str]:
        key = f"{server}/{tool['name']}"
        if key not in self.pins:
            return False, "not approved yet"
        if self.pins[key] != definition_hash(tool):
            return False, "definition changed since approval: re-approve before use"
        return True, "pinned"
