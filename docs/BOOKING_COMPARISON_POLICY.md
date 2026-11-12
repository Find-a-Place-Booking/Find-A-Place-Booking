# Find A Place Booking — Guest Price Comparison Rules

Review date: 2026-11-11

## Product behavior

1. **Direct/same-stay quote (only when external listing connected and exact quote verified)**
   - Same property listing ID, dates, guest count, currency and pre-tax total; source is `HOST_AUTHORIZED_FEED` or expressly authorized `DIRECT_PUBLIC_PAGE`.
   - Freshness guard: 2 hours. Never treat an iCal feed or inferred nightly price as an actual same-stay guest quote.
   - Front-end: `Another booking platform`, `Checked price`, exact timestamp in details, no competing logo or name.
   - Display positive price difference as *could save*, not a guaranteed savings promise.

2. **Estimate (only with no active connected external listing)**
   - Comparison model uses equal host proceeds and a hypothetical 15.5% host-side fee. This is a **specific illustrative scenario**, not an observed competitor price, not a rate forecast, and not a market average.
   - Front-end: `Other booking platforms`, `Illustrative estimate`, and visible pre-tax disclosure.
   - Display positive difference as *could save about*, not guaranteed savings.

3. **Connected listing, but no verified price**
   - Present `Exact comparison price unavailable` without a competitor dollar value or fabricated savings.
   - Clear explanation; no background retries in the browser, no alternative estimate presented as verified.

4. **All comparisons**
   - Never affect booked price, payment, calendar blocks, deposits, fees, taxes, refunds or Stripe.
   - Keep real Find A Place trip estimate visible first. Comparison is supplemental.
   - Ensure dates/party match and that both displayed amounts include all mandatory charges known at the quote stage, except disclosed government taxes. Only compare like-for-like before-tax amounts.
   - Avoid implying endorsement, partnership or affiliation with external platforms.

## Compliance context

- FTC policy explicitly permits truthful, clear competitor comparisons, including naming, but deception is prohibited: https://www.ftc.gov/legal-library/browse/statement-policy-regarding-comparative-advertising
- FTC small business guidance: advertising claims must be truthful, non-deceptive and supported: https://www.ftc.gov/business-guidance/resources/advertising-faqs-guide-small-business
- FTC Rule on Unfair or Deceptive Fees applies to short-term lodging; mandatory fees must be included in upfront total price: https://www.ftc.gov/business-guidance/resources/rule-unfair-or-deceptive-fees-frequently-asked-questions
- Provider platform rules prohibit automated scraping: https://www.airbnb.com/help/article/2857

These references summarize general US requirements and are not a substitute for a legal review before large-scale advertising campaigns.

## Engineering note

`AIRBNB_PUBLIC_PAGE_LOOKUP` is now **disabled by default**, and must only be set to `true` if appropriate authorization exists. The preferred source is a valid host-authorized price feed configured server-side via `AIRBNB_PRICE_FEED_URL` and `AIRBNB_PRICE_FEED_TOKEN`. A connected iCal feed alone cannot provide a verified external booking total.
