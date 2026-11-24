"""Tests for orchestrator.py with fake providers: no API keys, no network, no real Claude Code.

    python3 -m unittest orchestrator/test_orchestrator.py -v      (needs: pip install httpx)
"""
import asyncio, json, os, stat, sys, tempfile, textwrap, unittest
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


if __name__ == "__main__":
    unittest.main()
