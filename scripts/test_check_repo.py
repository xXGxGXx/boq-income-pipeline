"""Tests for check_repo.py, each in a throwaway git repository.   python3 scripts/test_check_repo.py"""
import io, os, subprocess, sys, tempfile, unittest
from contextlib import redirect_stderr, redirect_stdout
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import check_repo  # noqa: E402

GOOD = {
    "MASTER-ORCHESTRATOR-REFERENCE.md": "# Master Orchestrator\n\n" + "A real section of the design.\n" * 600,
    "README.md": "# Project\n\n" + "What this is and how to use it.\n" * 20,
    "LICENSE": "MIT License\n\n" + "Permission is hereby granted, free of charge.\n" * 20,
    "AGENTS.md": "# Rules for AI assistants\n\n" + "Verify before you claim.\n" * 40,
    "tool.py": "print('ok')\n",
    "data.json": '{"a": 1}\n',
    "run.sh": "#!/usr/bin/env bash\necho \"$(date)\"\n",                      # a real substitution inside a script is fine
    "guide.md": "Example:\n\n```bash\n$(cat notes.md)\n```\n",               # and so is one inside a code block
    "sw.template.js": "const SHELL = {{SHELL}};\n",                          # templates are not plain JavaScript
    ".check-repo.json": '{"min_bytes": {"MASTER-ORCHESTRATOR-REFERENCE.md": 10000, "README.md": 300, '
                        '"LICENSE": 500, "AGENTS.md": 500}}\n',
}


class CheckRepo(unittest.TestCase):
    def setUp(self):
        self.dir = tempfile.mkdtemp()
        self.old = os.getcwd()
        os.chdir(self.dir)
        subprocess.run(["git", "init", "-q"], check=True)
        subprocess.run(["git", "config", "user.email", "test@example.com"], check=True)
        subprocess.run(["git", "config", "user.name", "Test"], check=True)

    def tearDown(self):
        os.chdir(self.old)

    def write(self, files):
        for name, text in files.items():
            p = Path(name); p.parent.mkdir(parents=True, exist_ok=True)
            p.write_bytes(text if isinstance(text, bytes) else text.encode("utf-8"))
        subprocess.run(["git", "add", "-A"], check=True)

    def run_check(self, *argv):
        out = io.StringIO()
        with redirect_stdout(out), redirect_stderr(out):
            code = check_repo.main(list(argv))
        return code, out.getvalue()

    def test_clean_repo_passes(self):
        self.write(GOOD)
        code, out = self.run_check()
        self.assertEqual(code, 0, out)

    def test_the_real_breakage_is_caught(self):                       # what main's design doc became, three times
        self.write(dict(GOOD, **{"MASTER-ORCHESTRATOR-REFERENCE.md": "$(cat /tmp/master-current.md)"}))
        code, out = self.run_check()
        self.assertEqual(code, 1)
        self.assertIn("== placeholder (1)", out)
        self.assertIn("29 bytes", out)

    def test_command_line_in_prose_is_caught(self):
        self.write(dict(GOOD, **{"notes.md": "# Notes\n\n$(cat /tmp/part2.md)\n\nmore\n"}))
        code, out = self.run_check()
        self.assertEqual(code, 1); self.assertIn("notes.md:3", out)

    def test_conflict_markers(self):
        self.write(dict(GOOD, **{"a.md": "top\n<<<<<<< HEAD\nmine\n=======\ntheirs\n>>>>>>> main\n"}))
        code, out = self.run_check()
        self.assertEqual(code, 1); self.assertIn("== conflict (2)", out)

    def test_hidden_characters(self):
        self.write(dict(GOOD, **{"page.js": b"\x0cunction go() {}\n", "x.py": "ok = 1  # \u202e evil\n"}))
        code, out = self.run_check()
        self.assertEqual(code, 1)
        self.assertIn("form feed", out); self.assertIn("bidirectional control", out)

    def test_bom_only_allowed_as_first_byte(self):
        self.write(dict(GOOD, **{"ok.txt": "\ufeffhello\n", "bad.txt": "hello\n\ufeffagain\n"}))
        code, out = self.run_check()
        self.assertEqual(code, 1); self.assertIn("bad.txt:2", out); self.assertNotIn("ok.txt", out)

    def test_broken_python_and_json(self):
        self.write(dict(GOOD, **{"bad.py": "def f(:\n", "bad.json": "{oops}"}))
        code, out = self.run_check()
        self.assertEqual(code, 1); self.assertIn("== python (1)", out); self.assertIn("== json (1)", out)

    def test_missing_key_file(self):
        files = dict(GOOD); del files["AGENTS.md"]
        self.write(files)
        code, out = self.run_check()
        self.assertEqual(code, 1); self.assertIn("AGENTS.md  missing", out)

    def test_no_config_means_no_key_files(self):                      # a buyer's repository with none of these documents
        self.write({"app.py": "print('hi')\n", "README.md": "short\n"})
        code, out = self.run_check()
        self.assertEqual(code, 0, out)

    def test_bad_config_is_a_usage_error(self):
        self.write(dict(GOOD, **{".check-repo.json": '{"min_bytes": {"README.md": "lots"}}'}))
        self.assertEqual(self.run_check()[0], 2)

    def test_never_commit_files_are_caught_without_a_gitignore(self):   # e.g. a PR that deletes the release-out/ rule
        self.write(dict(GOOD, **{"release-out/Toolkit-1.0.zip": b"PK\x03\x04 zip", "app/release.jks": b"\x00key",
                                 "automation-forge/app-debug.apk": b"PK", ".env": "KEY=x\n", "local.properties": "sdk.dir=/x\n"}))
        code, out = self.run_check()
        self.assertEqual(code, 1, out)
        self.assertIn("== generated (5)", out)
        self.assertIn("release-out/Toolkit-1.0.zip  buyer zip", out)
        self.assertIn("signing keystore", out)

    def test_lookalikes_are_not_generated_files(self):
        self.write(dict(GOOD, **{".env.example": "KEY=\n", "build.gradle.kts": "plugins {}\n", "docs/release-out.md": "notes\n",
                                 "automation-forge/app/build.gradle.kts": "android {}\n"}))
        code, out = self.run_check()
        self.assertEqual(code, 0, out)

    def test_checks_a_commit_without_checking_it_out(self):
        self.write(dict(GOOD, **{"MASTER-ORCHESTRATOR-REFERENCE.md": "$(cat /tmp/m.md)"}))
        subprocess.run(["git", "commit", "-qm", "broken"], check=True)
        self.write(GOOD)                                               # the working tree is fixed, the commit is not
        self.assertEqual(self.run_check()[0], 0)
        code, out = self.run_check("--rev", "HEAD")
        self.assertEqual(code, 1); self.assertIn("placeholder", out)


if __name__ == "__main__":
    unittest.main(verbosity=1)
