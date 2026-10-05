Find A Place Booking — Guest Nearby Experiences Discovery

FULL REPLACEMENT / NEW FILES
- data/catalog.ts
- lib/public/listings.ts
- components/PropertyCard.tsx
- components/NearbyExperiencesPeek.tsx
- components/NearbyExperiencesPeek.module.css
- components/PublicNearbyExperiences.tsx
- components/PublicNearbyExperiences.module.css
- app/stays/[slug]/page.tsx

NO DATABASE MIGRATION.

HOME PAGE
- Only home-page PropertyCard surfaces show the new nearby-experiences bubble.
- If a host has no ACTIVE nearby experiences, nothing extra is rendered.
- The bubble is intentionally compact and overlays the lower-left edge of the
  property photo without changing the card/photo dimensions.
- Desktop: hover or keyboard focus previews the top three host-picked places.
- Touch/mobile: tap toggles the preview; tapping elsewhere or Escape closes it.
- The preview includes a link directly to the nearby-experiences section on the
  property page.
- Public listing loading performs one batched nearby-experience query for the
  returned properties, not one query per card.
- Search-result cards receive the data but do not show the bubble; this keeps
  the requested treatment focused on the home page and avoids extra clutter.

PROPERTY PAGE
- Nearby Experiences now appears immediately after the property gallery and
  before the rest of the listing details.
- Up to four host-picked experiences are shown immediately in a compact row/grid.
- If the host has more than four, the rest stay behind one clean
  "See all X nearby experiences" disclosure.
- Active experiences only are shown.
- Existing host ordering is preserved.
- Existing descriptions, distance/drive time and external information links
  are preserved.

IMAGE / LAYOUT SAFETY
- No property-gallery image dimensions were changed.
- No property-card image dimensions were changed.
- No upload/storage behavior was changed.
- Nearby experience image transforms remain display-only signed URL transforms.
