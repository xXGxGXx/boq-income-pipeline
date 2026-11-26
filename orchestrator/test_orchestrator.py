"""Tests for orchestrator.py with fake providers: no API keys, no network, no real Claude Code.

    python3 -m unittest orchestrator/test_orchestrator.py -v      (needs: pip install httpx)
"""
import asyncio, hashlib, io, json, os, stat, sys, tempfile, textwrap, unittest
from contextlib import redirect_stdout
from email.utils import format_datetime
from datetime import datetime, timedelta, timezone
from pathlib import Path

import importlib.util

for p in ("GROK", "MUSE", "CLAUDE"):
    os.environ[f"{p}_RETRY_BASE_DELAY"] = "0"; os.environ[f"{p}_RPS"] = "1000"; os.environ[f"{p}_BURST"] = "1000"
import httpx  # noqa: E402

# load orchestrator.py by path: from the repo root, "import orchestrator" would find this folder instead
_spec = importlib.util.spec_from_file_location("mm_orchestrator", Path(__file__).resolve().with_name("orchestrator.py"))
orch = importlib.util.module_from_spec(_spec); sys.modules["mm_orchestrator"] = orch; _spec.loader.exec_module(orch)


def mock_client(handler):
    return httpx.AsyncClient(transport=httpx.MockTransport(handler))


def ok_chat(text="answer", model="grok-test"):
    return httpx.Response(200, json={"model": model, "choices": [{"message": {"content": " " + text + " "}}], "usage": {"prompt_tokens": 7, "completion_tokens": 3}})


def fake_claude(body: str) -> str:
    """Write a stand-in `claude` executable and return its path."""
    d = tempfile.mkdtemp(); p = Path(d) / "claude"
    p.write_text("#!" + sys.executable + "\n" + textwrap.dedent(body)); p.chmod(p.stat().st_mode | stat.S_IEXEC)
    return str(p)


class Loading(unittest.TestCase):
    def write(self, data):
        f = Path(tempfile.mkdtemp()) / "tasks.json"; f.write_text(json.dumps(data)); return f

    def test_example_file_loads_and_routes(self):
        tasks = orch.load_tasks(Path(__file__).with_name("tasks.example.json"))
        self.assertEqual([t.resolved_provider() for t in tasks], ["claude", "grok", "muse"])

    def test_explicit_provider_wins_and_list_form_works(self):
        t = orch.load_tasks(self.write([{"prompt": "fix the failing test in the repo", "provider": "muse"}]))[0]
        self.assertEqual((t.id, t.resolved_provider()), ("task-001", "muse"))

    def test_keyword_routing(self):
        r = lambda p: orch.Task(id="x", prompt=p).resolved_provider()
        self.assertEqual(r("debug the failing unit tests in this repo"), "claude")
        self.assertEqual(r("what is trending on reddit and in the news today"), "grok")
        self.assertEqual(r("storyboard and visual design for a campaign"), "muse")
        self.assertEqual(r("hello"), "grok")
        self.assertEqual(orch.Task(id="x", prompt="research", task_type="openai").resolved_provider(), "openai")

    def test_bad_files_are_refused_clearly(self):
        for data, msg in (([{"id": "a"}], "prompt"), ([{"prompt": "p", "provider": "gpt"}], "provider"),
                          ([{"id": "a", "prompt": "p"}, {"id": "a", "prompt": "q"}], "duplicate"), ({"tasks": "nope"}, "list")):
            with self.assertRaises(ValueError) as cm:
                orch.load_tasks(self.write(data))
            self.assertIn(msg, str(cm.exception))


class RetryAfter(unittest.TestCase):
    def test_seconds_dates_junk_and_cap(self):
        f = orch.retry_after_seconds
        self.assertEqual(f("0"), 0.0)                       # "wait 0" means 0, not "use the backoff"
        self.assertEqual(f("7"), 7.0)
        self.assertEqual(f(format_datetime(datetime.now(timezone.utc) - timedelta(seconds=9), usegmt=True)), 0.0)
        self.assertAlmostEqual(f(format_datetime(datetime.now(timezone.utc) + timedelta(seconds=30), usegmt=True)), 30, delta=2)
        self.assertEqual(f("99999"), orch.MAX_RETRY_AFTER)
        for junk in (None, "", "soon", "-"):
            self.assertIsNone(f(junk))


class Http(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        orch.GROK_API_KEY, orch.MUSE_API_KEY, orch.MUSE_API_URL = "test-key", "test-key", "https://muse.invalid/v1"

    async def run_one(self, handler, provider="grok", **task):
        o = orch.Orchestrator(client=mock_client(handler))
        try:
            return (await o.run([orch.Task(id="t", prompt="news today", provider=provider, **task)]))[0]
        finally:
            await o.client.aclose()

    async def test_success_with_usage_and_auth_header(self):
        seen = {}
        def h(req): seen["auth"] = req.headers["authorization"]; seen["body"] = json.loads(req.content); return ok_chat()
        r = await self.run_one(h)
        self.assertEqual((r.status, r.output, r.input_tokens, r.output_tokens, r.attempts), ("success", "answer", 7, 3, 1))
        self.assertEqual(seen["auth"], "Bearer test-key"); self.assertEqual(seen["body"]["model"], orch.GROK_MODEL)

    async def test_429_then_success_honours_retry_after_seconds_and_dates(self):
        for retry_after in ("0", format_datetime(datetime.now(timezone.utc) - timedelta(seconds=5), usegmt=True), "soon"):
            calls = []
            def h(req): calls.append(1); return httpx.Response(429, headers={"Retry-After": retry_after}) if len(calls) == 1 else ok_chat()
            r = await self.run_one(h)
            self.assertEqual((r.status, r.attempts, r.retries, r.rate_limited, r.error), ("success", 2, 1, True, None), retry_after)

    async def test_rate_limited_to_the_end_is_reported(self):
        r = await self.run_one(lambda req: httpx.Response(429, headers={"Retry-After": "0"}))
        self.assertEqual((r.status, r.attempts), ("failed", 4)); self.assertIn("Rate limited", r.error)

    async def test_retryable_server_errors_and_network_errors(self):
        calls = []
        def h(req):
            calls.append(1)
            if len(calls) == 1: raise httpx.ConnectError("boom", request=req)
            return httpx.Response(503, text="busy") if len(calls) == 2 else ok_chat()
        r = await self.run_one(h)
        self.assertEqual((r.status, r.attempts), ("success", 3))

    async def test_client_error_is_not_retried(self):
        calls = []
        def h(req): calls.append(1); return httpx.Response(400, text="bad request")
        r = await self.run_one(h)
        self.assertEqual((r.status, len(calls)), ("failed", 1)); self.assertIn("HTTP 400", r.error)

    async def test_malformed_reply_is_a_clear_failure(self):
        for resp in (httpx.Response(200, text="<html>not json"), httpx.Response(200, json={"choices": []})):
            r = await self.run_one(lambda req, resp=resp: resp)
            self.assertEqual(r.status, "failed"); self.assertIn("Unexpected grok response", r.error)

    async def test_muse_shapes(self):
        r = await self.run_one(lambda req: httpx.Response(200, json={"content": {"slides": 3}}), provider="muse")
        self.assertEqual((r.status, json.loads(r.output)), ("success", {"slides": 3}))

    async def test_missing_keys(self):
        orch.GROK_API_KEY = ""
        r = await self.run_one(lambda req: ok_chat())
        self.assertEqual(r.status, "failed"); self.assertIn("XAI_API_KEY", r.error)


class Claude(unittest.IsolatedAsyncioTestCase):
    async def run_one(self, body, timeout=30):
        orch.CLAUDE_BIN = fake_claude(body) if body is not None else "/nonexistent/claude"
        o = orch.Orchestrator(client=mock_client(lambda r: ok_chat()))
        try:
            return (await o.run([orch.Task(id="c", prompt="refactor the code", provider="claude", timeout=timeout)]))[0]
        finally:
            await o.client.aclose()

    async def test_success_passes_read_only_tools_and_no_stdin(self):
        r = await self.run_one("""
            import json, sys
            tools = sys.argv[sys.argv.index('--allowedTools') + 1]
            print(json.dumps({"result": "done with " + tools + " stdin=" + repr(sys.stdin.read()), "is_error": False, "session_id": "s1", "usage": {"input_tokens": 11, "output_tokens": 5}}))
        """)
        self.assertEqual(r.status, "success"); self.assertEqual(r.output, "done with Read,Grep,Glob stdin=''")
        self.assertEqual((r.input_tokens, r.output_tokens, r.metadata["session_id"]), (11, 5, "s1"))

    async def test_is_error_counts_as_failure(self):
        r = await self.run_one("""
            import json; print(json.dumps({"result": "max turns reached", "is_error": True, "subtype": "error_max_turns"}))
        """)
        self.assertEqual((r.status, r.error), ("failed", "max turns reached"))

    async def test_non_zero_exit_timeout_and_missing_binary(self):
        r = await self.run_one("import sys; sys.stderr.write('auth needed'); sys.exit(3)")
        self.assertEqual((r.status, r.error, r.metadata["returncode"]), ("failed", "auth needed", 3))
        r = await self.run_one("import time; time.sleep(30)", timeout=1)
        self.assertEqual(r.status, "timeout")
        r = await self.run_one(None)
        self.assertEqual(r.status, "failed"); self.assertIn("not found", r.error)


class RunAndReport(unittest.IsolatedAsyncioTestCase):
    async def test_priority_order_reports_and_exit_code(self):
        orch.GROK_API_KEY = "k"; order = []
        def h(req): order.append(json.loads(req.content)["messages"][1]["content"].split("\n")[0]); return ok_chat()
        o = orch.Orchestrator(concurrency=1, client=mock_client(h))
        tasks = [orch.Task(id="late", prompt="news later", provider="grok", priority=9),
                 orch.Task(id="first", prompt="news first", provider="grok", priority=1)]
        try:
            results = await o.run(tasks)
        finally:
            await o.client.aclose()
        self.assertEqual(order, ["news first", "news later"])                  # lower priority number starts first
        self.assertEqual([r.task_id for r in results], ["late", "first"])        # report keeps file order
        out = Path(tempfile.mkdtemp())
        j, m = orch.write_reports(results + [orch.TaskResult(task_id="x", provider="muse", status="failed", error="```\nbreakout")], out)
        rep = json.loads(j.read_text()); md = m.read_text()
        self.assertEqual((rep["metrics"]["total"], rep["metrics"]["success"], rep["metrics"]["failed"]), (3, 2, 1))
        self.assertIn("| grok | 2 | 2 |", md); self.assertIn("````text\n```\nbreakout\n````", md)

    async def test_cli_exit_codes(self):
        d = Path(tempfile.mkdtemp()); bad = d / "bad.json"; bad.write_text("{not json")
        self.assertEqual(await orch.async_main([str(bad), "--output-dir", str(d)]), 2)


class OpenAIResponses(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        orch.OPENAI_API_KEY = "test-openai-key"
        orch.OPENAI_MODEL = "test-responses-model"

    async def asyncTearDown(self):
        orch.OPENAI_API_KEY = ""
        orch.OPENAI_MODEL = ""


    async def run_one(self, handler, provider="openai", **task):
        o = orch.Orchestrator(client=mock_client(handler))
        try:
            return (await o.run([orch.Task(id="openai-test", prompt="research current sources", provider=provider, **task)]))[0]
        finally:
            await o.client.aclose()

    async def test_responses_api_uses_store_false_and_opt_in_web_search(self):
        seen = {}
        response = {
            "id": "resp_test",
            "model": "test-responses-model",
            "output": [{
                "type": "message",
                "role": "assistant",
                "content": [{
                    "type": "output_text",
                    "text": "A sourced answer.",
                    "annotations": [{
                        "type": "url_citation",
                        "url": "https://example.org/source",
                        "title": "Example source"
                    }]
                }]
            }],
            "usage": {"input_tokens": 12, "output_tokens": 7}
        }

        def handler(req):
            seen["url"] = str(req.url)
            seen["auth"] = req.headers.get("authorization")
            seen["payload"] = json.loads(req.content)
            return httpx.Response(200, json=response)

        r = await self.run_one(handler, provider="openai", context={"web_search": True, "reasoning_effort": "high"})
        self.assertEqual(r.status, "success")
        self.assertEqual(r.output, "A sourced answer.")
        self.assertEqual((r.input_tokens, r.output_tokens), (12, 7))
        self.assertEqual(seen["url"], orch.OPENAI_API_URL)
        self.assertEqual(seen["auth"], "Bearer test-openai-key")
        self.assertIs(seen["payload"]["store"], False)
        self.assertEqual(seen["payload"]["tools"], [{"type": "web_search"}])
        self.assertEqual(seen["payload"]["reasoning"], {"effort": "high"})
        self.assertEqual(r.metadata["response_id"], "resp_test")
        self.assertEqual(r.metadata["citations"], [{"url": "https://example.org/source", "title": "Example source"}])

    async def test_web_search_is_not_enabled_by_default(self):
        seen = {}
        response = {"id": "resp_text", "model": "test-responses-model",
                    "output": [{"type": "message", "content": [{"type": "output_text", "text": "Plain answer."}]}]}
        def handler(req):
            seen["payload"] = json.loads(req.content)
            return httpx.Response(200, json=response)
        r = await self.run_one(handler, provider="openai")
        self.assertEqual(r.status, "success")
        self.assertNotIn("tools", seen["payload"])
        self.assertIs(seen["payload"]["store"], False)

    async def test_missing_key_or_model_fails_without_request(self):
        orch.OPENAI_API_KEY = ""
        r = await self.run_one(lambda req: self.fail("network must not be called"), provider="openai")
        self.assertEqual(r.status, "failed")
        self.assertIn("OPENAI_API_KEY", r.error)
        orch.OPENAI_API_KEY = "key"
        orch.OPENAI_MODEL = ""
        r = await self.run_one(lambda req: self.fail("network must not be called"), provider="openai")
        self.assertEqual(r.status, "failed")
        self.assertIn("OPENAI_MODEL", r.error)

    async def test_restricted_classification_is_blocked_before_any_provider(self):
        def forbidden(req):
            raise AssertionError("no external provider request should be made")
        r = await self.run_one(forbidden, provider="openai", context={"data_classification": "financial"})
        self.assertEqual(r.status, "failed")
        self.assertIn("explicit allow_external_processing=true", r.error)

    async def test_explicit_external_processing_override_is_recordable(self):
        response = {"id": "resp_override", "model": "test-responses-model",
                    "output": [{"type": "message", "content": [{"type": "output_text", "text": "Approved."}]}]}
        r = await self.run_one(lambda req: httpx.Response(200, json=response), provider="openai",
                               context={"data_classification": "financial", "allow_external_processing": True})
        self.assertEqual(r.status, "success")


# ------------------------------------------------------------------ gates

def marker_claude(marker: Path) -> str:
    """A fake `claude` that proves it ran by creating `marker`."""
    return fake_claude(f"""
        import json, pathlib
        pathlib.Path({str(marker)!r}).write_text("ran")
        print(json.dumps({{"result": "edited", "is_error": False}}))
    """)


class Preflight(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        orch.GROK_API_KEY = "k"
        self.tools = orch.CLAUDE_ALLOWED_TOOLS

    def tearDown(self):
        orch.CLAUDE_ALLOWED_TOOLS = self.tools

    async def run_tasks(self, tasks, handler=lambda req: ok_chat(), **kw):
        o = orch.Orchestrator(client=mock_client(handler), **kw)
        try:
            return await o.run(tasks)
        finally:
            await o.client.aclose()

    async def test_allowed_task_records_every_check(self):
        r = (await self.run_tasks([orch.Task(id="a", prompt="news", provider="grok")]))[0]
        self.assertEqual(r.status, "success")
        self.assertEqual(r.metadata["preflight"], {"decision": "ALLOW", "checks": {"data_classification": "ALLOW", "call_budget": "ALLOW"}})
        self.assertEqual(len(r.metadata["task_sha256"]), 64)

    async def test_blocked_task_records_the_gate_and_calls_nothing(self):
        r = (await self.run_tasks([orch.Task(id="b", prompt="p", provider="grok", context={"data_classification": "health"})],
                                  handler=lambda req: self.fail("no request after a preflight block")))[0]
        self.assertEqual((r.status, r.metadata["preflight"]["decision"], r.metadata["gates"]), ("failed", "BLOCK", ["data_classification"]))

    async def test_write_tools_need_an_explicit_per_task_allow(self):
        orch.CLAUDE_ALLOWED_TOOLS = "Read,Edit,Bash(git:*)"
        marker = Path(tempfile.mkdtemp()) / "ran"
        orch.CLAUDE_BIN = marker_claude(marker)
        r = (await self.run_tasks([orch.Task(id="w", prompt="refactor the code", provider="claude")]))[0]
        self.assertEqual((r.status, r.metadata["gates"]), ("failed", ["write_tools"]))
        self.assertIn("Edit, Bash(git:*)", r.error); self.assertIn("allow_write_tools", r.error)
        self.assertFalse(marker.exists(), "Claude Code must not start when the risk gate blocks")
        r = (await self.run_tasks([orch.Task(id="w", prompt="refactor the code", provider="claude", context={"allow_write_tools": True})]))[0]
        self.assertEqual((r.status, r.metadata["preflight"]["checks"]["write_tools"]), ("success", "ALLOW"))
        self.assertTrue(marker.exists())

    async def test_read_only_claude_passes_the_risk_gate(self):
        orch.CLAUDE_ALLOWED_TOOLS = "Read,Grep,Glob"
        orch.CLAUDE_BIN = marker_claude(Path(tempfile.mkdtemp()) / "ran")
        r = (await self.run_tasks([orch.Task(id="r", prompt="read the code", provider="claude")]))[0]
        self.assertEqual((r.status, r.metadata["preflight"]["checks"]["write_tools"]), ("success", "ALLOW"))


class Budgets(Preflight):
    async def test_call_budget_blocks_later_tasks_without_requests(self):
        calls = []
        def h(req): calls.append(1); return ok_chat()
        first, second = orch.Task(id="one", prompt="news", provider="grok", priority=1), orch.Task(id="two", prompt="news", provider="grok", priority=2)
        a, b = await self.run_tasks([first, second], handler=h, concurrency=1, max_calls=1)
        self.assertEqual((a.status, b.status, len(calls)), ("success", "failed", 1))
        self.assertIn("call budget (1 provider calls)", b.error); self.assertEqual(b.metadata["gates"], ["call_budget"])

    async def test_call_budget_also_stops_retries(self):
        r = (await self.run_tasks([orch.Task(id="t", prompt="news", provider="grok")], handler=lambda req: httpx.Response(503, text="busy"), max_calls=2))[0]
        self.assertEqual((r.status, r.attempts), ("failed", 2)); self.assertIn("call budget", r.error)
        self.assertIn("call_budget", r.metadata["gates"])

    async def test_max_attempts_caps_retries_per_task(self):
        r = (await self.run_tasks([orch.Task(id="t", prompt="news", provider="grok", context={"max_attempts": 2})],
                                  handler=lambda req: httpx.Response(429, headers={"Retry-After": "0"})))[0]
        self.assertEqual((r.status, r.attempts), ("failed", 2))

    async def test_a_wait_that_would_pass_the_budget_is_not_slept(self):
        started = asyncio.get_running_loop().time()
        r = (await self.run_tasks([orch.Task(id="t", prompt="news", provider="grok", context={"budget_seconds": 5})],
                                  handler=lambda req: httpx.Response(429, headers={"Retry-After": "100"})))[0]
        self.assertLess(asyncio.get_running_loop().time() - started, 3)
        self.assertEqual((r.status, r.attempts), ("failed", 1))
        self.assertIn("time budget", r.error); self.assertIn("time_budget", r.metadata["gates"])

    async def test_time_budget_stops_a_slow_task(self):
        orch.CLAUDE_ALLOWED_TOOLS = "Read,Grep,Glob"
        orch.CLAUDE_BIN = fake_claude("import time; time.sleep(30)")
        started = asyncio.get_running_loop().time()
        r = (await self.run_tasks([orch.Task(id="slow", prompt="read the code", provider="claude", context={"budget_seconds": 1})]))[0]
        self.assertLess(asyncio.get_running_loop().time() - started, 10)
        self.assertEqual(r.status, "timeout"); self.assertIn("Budget gate", r.error)
        self.assertEqual((r.metadata["gates"], r.metadata["preflight"]["decision"]), (["time_budget"], "ALLOW"))

    def test_budget_for_takes_the_smaller_limit(self):
        o = orch.Orchestrator(client=mock_client(lambda r: ok_chat()), task_budget=60)
        self.assertEqual(o.budget_for(orch.Task(id="a", prompt="p")), 60)
        self.assertEqual(o.budget_for(orch.Task(id="a", prompt="p", context={"budget_seconds": 5})), 5)
        self.assertEqual(o.budget_for(orch.Task(id="a", prompt="p", context={"budget_seconds": 600})), 60)
        self.assertIsNone(orch.Orchestrator(client=o.client).budget_for(orch.Task(id="a", prompt="p", context={"budget_seconds": True})))


# --------------------------------------------------------------- evidence

def independent_sha256(record):
    """The documented scheme, re-implemented here without calling the orchestrator's helpers."""
    body = {k: v for k, v in record.items() if k not in ("sha256", "hmac")}
    return hashlib.sha256(json.dumps(body, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode("utf-8")).hexdigest()


def rehash(report):
    """What someone without the key could do after editing: recompute every hash and the chain."""
    prev = ""
    for rec in report["evidence"]["records"]:
        rec.pop("hmac", None); rec["prev_sha256"] = prev; rec["sha256"] = independent_sha256(rec); prev = rec["sha256"]
    report["evidence"]["head_sha256"] = prev; report["evidence"]["signed"] = False


class Evidence(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        os.environ.pop(orch.EVIDENCE_KEY_ENV, None)
        orch.GROK_API_KEY = "k"
        o = orch.Orchestrator(client=mock_client(lambda req: ok_chat("the answer")))
        try:
            self.results = await o.run([orch.Task(id="ok", prompt="news", provider="grok"),
                                        orch.Task(id="blocked", prompt="p", provider="grok", context={"data_classification": "financial"}),
                                        orch.Task(id="ünïcode", prompt="news", provider="grok")])
        finally:
            await o.client.aclose()

    def report(self, key=None):
        j, m = orch.write_reports(self.results, Path(tempfile.mkdtemp()), key=key)
        return json.loads(j.read_text(encoding="utf-8")), m.read_text(encoding="utf-8")

    def test_records_chain_and_anyone_can_recompute_the_hashes(self):
        rep, _ = self.report()
        ev, prev = rep["evidence"], ""
        self.assertEqual([r["preflight"] for r in ev["records"]], ["ALLOW", "BLOCK", "ALLOW"])
        for rec, res in zip(ev["records"], rep["results"]):
            self.assertEqual(rec["sha256"], independent_sha256(rec))
            self.assertEqual(rec["prev_sha256"], prev); prev = rec["sha256"]
            self.assertEqual(rec["output_sha256"], hashlib.sha256(res["output"].encode()).hexdigest())
            self.assertNotIn("prompt", rec)                              # the prompt stays out; only its hash is kept
        self.assertEqual(ev["head_sha256"], prev); self.assertFalse(ev["signed"])
        self.assertEqual(orch.verify_report(rep), [])
        self.assertEqual(rep["metrics"]["blocked"], 1)

    def test_every_kind_of_tampering_is_named(self):
        base, _ = self.report()
        head = base["evidence"]["head_sha256"]
        def check(edit, *expected, expect_head=None):
            rep = json.loads(json.dumps(base)); edit(rep)
            problems = " | ".join(orch.verify_report(rep, expect_head=expect_head))
            for e in expected:
                self.assertIn(e, problems)
        check(lambda r: r["results"][0].update(output="a nicer answer"), "result ok: output changed")
        check(lambda r: r["results"][1].update(error="nothing to see"), "result blocked: error text changed")
        check(lambda r: r["evidence"]["records"][1].update(status="success"), "record #2 (blocked): changed after it was written")
        def drop_first(r): del r["evidence"]["records"][0]; del r["results"][0]
        check(drop_first, "chain broken", "seq 2")
        def swap(r): rs = r["evidence"]["records"]; rs[0], rs[1] = rs[1], rs[0]
        check(swap, "chain broken", "is where the evidence expects")
        def cut_end(r):
            del r["evidence"]["records"][-1]; del r["results"][-1]
            r["evidence"]["head_sha256"] = r["evidence"]["records"][-1]["sha256"]
        self.assertEqual(orch.verify_report((lambda r: (cut_end(r), r)[1])(json.loads(json.dumps(base)))), [])   # consistent with itself...
        check(cut_end, "isn't the head you saved", expect_head=head)                                           # ...caught by the saved head
        def forge(r): r["results"][0]["output"] = "forged"; r["evidence"]["records"][0]["output_sha256"] = hashlib.sha256(b"forged").hexdigest(); rehash(r)
        check(forge, "isn't the head you saved", expect_head=head)                    # unsigned + re-hashed: only the saved head catches it

    def test_signed_reports_resist_rehashing(self):
        key = b"test-evidence-key"
        rep, md = self.report(key=key)
        self.assertTrue(rep["evidence"]["signed"]); self.assertTrue(all(len(r["hmac"]) == 64 for r in rep["evidence"]["records"]))
        self.assertIn("Signed: **yes", md)
        self.assertEqual(orch.verify_report(rep, key=key), [])
        self.assertIn("signature missing or wrong", " ".join(orch.verify_report(rep, key=b"another-key")))
        self.assertIn("the report is signed", " ".join(orch.verify_report(rep)))
        forged = json.loads(json.dumps(rep)); forged["results"][0]["output"] = "forged"
        forged["evidence"]["records"][0]["output_sha256"] = hashlib.sha256(b"forged").hexdigest(); rehash(forged)
        self.assertEqual(orch.verify_report(forged), [])                                  # self-consistent without the key...
        self.assertIn("signature missing or wrong", " ".join(orch.verify_report(forged, key=key)))   # ...but not with it

    def test_markdown_explains_how_to_verify(self):
        rep, md = self.report()
        self.assertIn("## Evidence", md); self.assertIn(rep["evidence"]["head_sha256"], md)
        self.assertIn("--verify", md); self.assertIn("Preflight: `BLOCK` | Gates tripped: `data_classification`", md)

    async def test_cli_runs_then_verifies_with_exit_codes(self):
        d = Path(tempfile.mkdtemp()); tasks = d / "tasks.json"
        tasks.write_text(json.dumps([{"id": "private-one", "prompt": "summarise", "provider": "grok",
                                      "context": {"data_classification": "private"}}]))   # blocked: no network needed
        out = d / "reports"
        quiet = lambda argv: asyncio.ensure_future(orch.async_main(argv))
        with redirect_stdout(io.StringIO()):
            self.assertEqual(await quiet([str(tasks), "--output-dir", str(out)]), 1)       # the task was blocked, so not all succeeded
            report = next(out.glob("*.json")); rep = json.loads(report.read_text())
            self.assertEqual(await quiet(["--verify", str(report), "--expect-head", rep["evidence"]["head_sha256"]]), 0)
            self.assertEqual(await quiet(["--verify", str(report), "--expect-head", "0" * 64]), 1)
            rep["results"][0]["error"] = "edited"; report.write_text(json.dumps(rep))
            self.assertEqual(await quiet(["--verify", str(report)]), 1)
            report.write_text("{not json"); self.assertEqual(await quiet(["--verify", str(report)]), 2)
            report.write_text(json.dumps({"results": []})); self.assertEqual(await quiet(["--verify", str(report)]), 2)


if __name__ == "__main__":
    unittest.main()
