from __future__ import annotations
import ast
import importlib.util
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location("patcher", ROOT / "APPLY_DIRECT_COMPARISON.py")
patcher = importlib.util.module_from_spec(spec)
assert spec.loader
spec.loader.exec_module(patcher)
source = (ROOT / "APPLY_DIRECT_COMPARISON.py").read_text(encoding="utf-8")
syntax_tree = ast.parse(source)


def anchors(function_name: str) -> list[str]:
    fn = next(node for node in syntax_tree.body if isinstance(node, ast.FunctionDef) and node.name == function_name)
    values = []
    for node in ast.walk(fn):
        if isinstance(node, ast.Call) and isinstance(node.func, ast.Name) and node.func.id == "substitute":
            values.append(ast.literal_eval(node.args[1]))
    return values


class ComparisonTests(unittest.TestCase):
    def test_patch_is_idempotent(self):
        original = "\n\n".join(anchors("change"))
        updated = patcher.change(original)
        self.assertEqual(patcher.change(updated), updated)
        self.assertIn('comparisonType: "DIRECT_UNAVAILABLE"', updated)
        self.assertIn('comparisonType: "VERIFIED"', updated)
        self.assertIn('comparisonType: "ESTIMATED"', updated)
        self.assertIn('source === "HOST_AUTHORIZED_FEED"', updated)
        self.assertIn('if (!quote) return directUnavailable();', updated)
        self.assertIn('AIRBNB_PRICE_FEED_URL?.trim()', updated)

    def test_collector_is_off_by_default_and_idempotent(self):
        original = "\n".join(anchors("update_external_collector"))
        modified = patcher.update_external_collector(original)
        self.assertIn('AIRBNB_PUBLIC_PAGE_LOOKUP !== "true"', modified)
        self.assertEqual(patcher.update_external_collector(modified), modified)

    def test_missing_anchor_aborts_without_writes(self):
        with self.assertRaises(RuntimeError):
            patcher.change('const a = 1;')

    def test_ui_copy_avoids_competitor_brand_and_unsupported_claims(self):
        s = (ROOT / 'components' / 'DirectBookingValue.tsx').read_text(encoding='utf-8')
        # These provider-specific field names are internal API compatibility;
        # only rendered guest-visible text matters.
        self.assertNotIn('>Airbnb<', s)
        self.assertNotIn('Airbnb-style', s)
        self.assertNotIn('View the same property on Airbnb', s)
        self.assertIn('comparisonType === "DIRECT_UNAVAILABLE"', s)
        self.assertIn('Could save about ${money(difference)}', s)
        self.assertIn('You could save ${money(difference)}', s)
        self.assertIn('not a live price elsewhere', s)
        self.assertIn('before taxes', s)
        self.assertIn('Illustrative estimate', s)
        self.assertIn('Another booking platform', s)

    def test_no_savings_claim_for_zero_or_negative_difference(self):
        s = (ROOT / 'components' / 'DirectBookingValue.tsx').read_text(encoding='utf-8')
        self.assertIn('difference > 0', s)
        self.assertIn('difference === 0', s)
        self.assertIn('Another booking platform currently has a lower price', s)


if __name__ == '__main__':
    unittest.main(verbosity=2)
