from __future__ import annotations
import importlib.util
from pathlib import Path
import unittest
p=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('pricing',p/'APPLY_IMMEDIATE_PRICES.py')
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)

class PricePatchTests(unittest.TestCase):
    def test_property_card_is_directly_after_rate(self):
        raw='''import { TrackedLink } from "@/components/TrackedLink";
        <div className="price-line">
          <strong>${property.price}</strong> / night
          <span>
            {property.reviews > 0
              ? `${property.reviews} reviews`
              : "Independent stay"}
          </span>
        </div>'''
        result=m.price_property_card(raw)
        self.assertLess(result.index('strong>${property.price}'),result.index('NightlySavingsPreview nightlyPriceUsd={property.price}'))
        self.assertEqual(m.price_property_card(result),result)

    def test_booking_card_is_next_to_quote_and_not_after_fees(self):
        raw='''import { AvailabilityDatePicker } from "@/components/AvailabilityDatePicker";
        <b>{testMode ? "Test booking" : "Book on Find A Place"}</b>
      </div>
          <span>Estimated trip total</span>
            ) : null}
          </div>

          {dateVerification === "checking" || dateVerification === "idle" ? (
          <div className="estimateRows">Fees / taxes</div>
      <button>Reserve</button>'''
        got=m.price_booking_card(raw)
        self.assertLess(got.index('NightlySavingsPreview nightlyPriceUsd={price}'),got.index('Estimated trip total'))
        self.assertLess(got.index('Estimated trip total'),got.index('className={styles.comparisonImmediate}'))
        self.assertLess(got.index('className={styles.comparisonImmediate}'),got.index('estimateRows'))
        self.assertEqual(got.count('<DirectBookingValue'),1)
        self.assertEqual(m.price_booking_card(got),got)

    def test_home_hero_preview(self):
        raw='''import { getPublishedMapStays, getPublishedProperties } from "@/lib/public/listings";
                <div className="hero-featured-meta">
                  <b>${featuredStay.price}</b>
                  <small>/ night</small>
                </div>'''
        after=m.price_home(raw)
        self.assertIn('NightlySavingsPreview nightlyPriceUsd={featuredStay.price}',after)
        self.assertEqual(m.price_home(after),after)

    def test_mobile_app_preview(self):
        raw='''import { StayMap } from "./StayMap";
              <h2 className="title">{detail.name}</h2>
              <p style={{ lineHeight: 1.6 }}>{detail.description}</p>
                        <b>From ${s.startingNightlyUsd}/night</b>
                      </div>'''
        after=m.price_guest_webapp(raw)
        self.assertIn('<NightlySavingsPreview nightlyPriceUsd={detail.startingNightlyUsd} />',after)
        self.assertIn('<NightlySavingsPreview nightlyPriceUsd={s.startingNightlyUsd} minimal />',after)
        self.assertEqual(m.price_guest_webapp(after),after)

    def test_blocks_unexpected_source_changes(self):
        with self.assertRaises(ValueError):
            m.price_booking_card('import {something} from "x";')

if __name__=='__main__': unittest.main(verbosity=2)
