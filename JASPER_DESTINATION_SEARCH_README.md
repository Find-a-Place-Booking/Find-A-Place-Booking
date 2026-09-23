# Jasper destination + destination search wiring

Built against GitHub commit:

`03ff78f2d7db9bb0d89e2f21020213dac4ef3ccc`

## Changes

- Adds **Jasper** as a sixth homepage destination.
- Adds a real Jasper, Arkansas image from Wikimedia Commons to match the
  existing destination-card image pattern.
- Because both the small **Popular** destination links and the large destination
  cards are generated from the same `destinations` array, Jasper is connected
  in both places automatically.
- Keeps every destination link going through the existing canonical route:
  `/stays?where=<destination>`.
- Hardens the actual stay-results matching so the destination links now resolve
  against public listing location/city/state/region data consistently.
- Regional cards also recognize useful nearby labels:
  - Lake Ouachita → Lake Ouachita / Mount Ida / Mountain Harbor
  - Caddo River → Caddo River / Caddo Gap / Glenwood
  - Jasper → Jasper / Buffalo National River / Buffalo River / Newton County
- Free-form searches such as `Jasper, AR` and `Hot Springs Arkansas` now tolerate
  punctuation differences instead of requiring one exact substring.

## Jasper image

Historic Downtown Jasper, Arkansas:
https://commons.wikimedia.org/wiki/File:Jasper,_Arkansas.jpg

The image is CC BY-SA 3.0. The code follows the site's existing Wikimedia
destination-image pattern.

## Files changed

- `app/page.tsx`
- `data/catalog.ts`
- `components/StayResults.tsx`

No database migration is required.
No Stripe/payment/webhook files are touched.

## Verify

```powershell
npm run typecheck
npm run build
```

Then verify these URLs after deploy:

- `/stays?where=Jasper`
- `/stays?where=Hot%20Springs`
- `/stays?where=Lake%20Ouachita`
- `/stays?where=Caddo%20River`
- `/stays?where=Eureka%20Springs`
- `/stays?where=Branson`

Also try typing `Jasper, AR` into the main search box.
