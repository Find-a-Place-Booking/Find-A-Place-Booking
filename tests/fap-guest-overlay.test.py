from __future__ import annotations
import importlib.util
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[1]
sp = importlib.util.spec_from_file_location("guest_overlay", ROOT / "APPLY_GUEST_UPDATES.py")
module = importlib.util.module_from_spec(sp)
assert sp.loader
sp.loader.exec_module(module)

class GuestOverlayTests(unittest.TestCase):
    def test_eight_guards(self):
        self.assertEqual(len(module.EXPECTED), 8)
        self.assertTrue(all(len(v)==40 for v in module.EXPECTED.values()))

    def test_discovery_and_feature_rules(self):
        helper=(ROOT / "lib/public/featured-launch-cabins.ts").read_text()
        for x in ['.eq("status", "PUBLISHED")', '.eq("homepage_feature_priority", 1)', '.eq("property_type", "Cabin")', '.eq("partner_status", "VERIFIED")']:
            self.assertIn(x, helper)
        self.assertIn('return [];', helper)
        patcher=(ROOT / "APPLY_GUEST_UPDATES.py").read_text()
        self.assertIn('getPublishedProperties(100)',patcher)
        self.assertIn('"Unique stays"',patcher)
        self.assertIn('"Budget Friendly"',patcher)
        self.assertIn('property.price < 150',patcher)

    def test_mobile_gallery(self):
        t=(ROOT / "components/StayPhotoStrip.tsx").read_text()
        css=(ROOT / "components/StayPhotoStrip.module.css").read_text()
        for value in ['onScroll={handleScroll}', 'Previous photo', 'Next photo','aria-roledescription="carousel"']:
            self.assertIn(value,t)
        self.assertIn('scroll-snap-type: x mandatory',css)
        self.assertIn('overflow-x: auto',css)

    def test_comparison_fallback_transformation(self):
        original='''    if (connectionError || quoteError) return unavailable();
    if (!connected) {
      // A model for a comparable booking cost; not an Airbnb listing quote.
      const fakeEstimate = 1200;
      if (!fakeEstimate) return unavailable();
      return NextResponse.json({ available: true, comparisonType: "ESTIMATED" });
    }

    // A connected Airbnb calendar identifies the same listing, but includes no prices.
    if (!listingId) return unavailable();
    if (cacheError) return unavailable();
    if (claimError || claimed !== true) return unavailable();
    if (!quote) return unavailable();
    if (saveError) return unavailable();
'''
        result=module.patch_comparison_route(original)
        self.assertIn('const estimatedFallback = async () =>',result)
        self.assertIn('if (connectionError || !connected) return estimatedFallback();',result)
        for value in ['!listingId','cacheError','claimError || claimed !== true','!quote','saveError']:
            self.assertIn(f'if ({value}) return estimatedFallback();',result)
        self.assertNotIn('if (!connected) {',result)

    def test_no_other_core_systems(self):
        for name in module.PATCHES:
            self.assertNotIn('resnexus',name.lower())
            self.assertNotIn('stripe',name.lower())
            self.assertNotIn('calendar',name.lower())
            self.assertNotIn('reservation',name.lower())

if __name__ == '__main__':
    unittest.main(verbosity=2)
