"""Routing and safety tests for orchestrator.py (no network).   python3 -m unittest artifacts/test_orchestrator.py"""
import importlib.util, os, sys, unittest
from pathlib import Path

_spec = importlib.util.spec_from_file_location("artifacts_orchestrator", Path(__file__).resolve().with_name("orchestrator.py"))
orch = importlib.util.module_from_spec(_spec); sys.modules["artifacts_orchestrator"] = orch; _spec.loader.exec_module(orch)
route = lambda prompt: orch.classify_task(orch.Task(task_id="t", prompt=prompt))


class Routing(unittest.TestCase):
    def test_keywords_inside_other_words_no_longer_count(self):
        self.assertNotEqual(route("Summarize my credit card statement"), "muse")       # "edit" inside "credit"
        self.assertNotEqual(route("What's next in my text notes"), "grok_plus")        # "x" inside "next", "text"

    def test_real_keywords_still_route(self):
        self.assertEqual(route("Post on X about our launch and check what's trending"), "grok_plus")
        self.assertEqual(route("Design a poster and a logo for the festival"), "muse")
        self.assertEqual(route("Debug the failing unit test in this repo"), "claude_code")
        self.assertEqual(route("Fix the docker build in CI"), "claude_code")

    def test_explicit_type_wins(self):
        self.assertEqual(orch.classify_task(orch.Task(task_id="t", prompt="anything", task_type="creative")), "muse")


class Muse(unittest.TestCase):
    def test_no_guessed_endpoint(self):
        self.assertEqual(orch.MUSE_API_URL, os.getenv("MUSE_API_URL", ""))
        if not os.getenv("MUSE_API_URL"):
            orch.MUSE_API_KEY = "k"
            with self.assertRaises(orch.ProviderError) as cm:
                orch.call_muse(orch.Task(task_id="t", prompt="p"))
            self.assertIn("MUSE_API_URL", str(cm.exception))


if __name__ == "__main__":
    unittest.main()
