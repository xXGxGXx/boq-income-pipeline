import json
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "tools"))
import recall_vault_check as checker
import create_blueprint


class CatalogRules(unittest.TestCase):
    def test_valid_compound_parent_uses_only_last_segment(self):
        report = checker.check_catalog({"items": [
            {"code": "AI-M2001", "role": "loop"},
            {"code": "AI-M2001-poster", "role": "poster"},
            {"code": "AI-M2001-playable", "role": "playable"},
        ]})
        self.assertTrue(report["ok"], report)
        self.assertEqual(report["errors"], 0)

    def test_poster_alone_does_not_cover_original(self):
        report = checker.check_catalog({"items": [{"code": "M1001-poster", "role": "poster"}]})
        self.assertFalse(report["ok"])
        self.assertEqual([f["issue"] for f in report["findings"]], ["missing_parent"])
        self.assertIn("M1001", report["findings"][0]["detail"])

    def test_wrong_first_segment_parent_is_rejected(self):
        report = checker.check_catalog({"items": [
            {"code": "AI", "role": "original"},
            {"code": "AI-M2001-poster", "role": "poster", "parent": "AI"},
        ]})
        self.assertFalse(report["ok"])
        self.assertEqual(report["findings"][0]["issue"], "parent_mismatch")

    def test_child_suffix_must_match_role(self):
        report = checker.check_catalog({"items": [
            {"code": "M1001-playable", "role": "poster"},
            {"code": "M1001", "role": "original"},
        ]})
        self.assertEqual(report["findings"][0]["issue"], "invalid_child_suffix")

    def test_duplicate_code_is_an_error(self):
        report = checker.check_catalog({"items": [
            {"code": "M1001", "role": "plate"},
            {"code": "M1001", "role": "loop"},
        ]})
        self.assertIn("duplicate_code", [f["issue"] for f in report["findings"]])

    def test_missing_client_link_warns_unless_strict(self):
        data = {"items": [{"code": "CLIENT-001", "role": "client", "link": None}]}
        normal = checker.check_catalog(data)
        strict = checker.check_catalog(data, strict_links=True)
        self.assertEqual((normal["errors"], normal["warnings"]), (0, 1))
        self.assertEqual((strict["errors"], strict["warnings"]), (1, 0))

    def test_catalog_shape_is_fail_closed(self):
        for data in ({"records": []}, {"items": []}, {"items": ["not-an-object"]}):
            with self.subTest(data=data), self.assertRaises(ValueError):
                checker.check_catalog(data)

    def test_report_is_new_file_and_catalog_is_unchanged(self):
        with tempfile.TemporaryDirectory() as temp:
            catalog = Path(temp) / "catalog.json"
            report = Path(temp) / "report.json"
            original = json.dumps({"version": 1, "items": [{"code": "M1001", "role": "plate"}]})
            catalog.write_text(original, encoding="utf-8")
            self.assertEqual(checker.main([str(catalog), "--report", str(report)]), 0)
            self.assertEqual(catalog.read_text(encoding="utf-8"), original)
            self.assertTrue(report.is_file())
            self.assertEqual(checker.main([str(catalog), "--report", str(report)]), 2)


class Blueprint(unittest.TestCase):
    def test_dry_run_creates_nothing(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp) / "RecallVault"
            self.assertTrue(create_blueprint.plan(root))
            self.assertFalse(root.exists())

    def test_create_is_directories_only_and_idempotent(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp) / "RecallVault"
            self.assertTrue(create_blueprint.create(root))
            self.assertTrue(all(p.is_dir() for p in create_blueprint.plan(root)))
            self.assertFalse(any(p.is_file() for p in root.rglob("*")))
            self.assertEqual(create_blueprint.create(root), [])

    def test_existing_file_is_never_overwritten(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp) / "RecallVault"
            target = root / "Shelf"
            target.parent.mkdir(parents=True)
            target.write_text("keep me", encoding="utf-8")
            with self.assertRaises(ValueError):
                create_blueprint.create(root)
            self.assertEqual(target.read_text(encoding="utf-8"), "keep me")


if __name__ == "__main__":
    unittest.main()
