# FAP mobile image fit repair

Overlay this ZIP at the repository root.

Changed:
- `app/photo-gallery-fixes.css`
- `components/PropertyGallery.module.css`

Mobile behavior after this patch:
- image boxes stay filled;
- photos keep their natural proportions and do not stretch;
- listing cards, search cards, destination cards and the featured stay use centered `object-fit: cover`;
- mobile/touch hover zoom is disabled so tapped images do not remain enlarged;
- the property detail preview fills its 4:3 frame, while the full-screen gallery still uses `contain` so the entire photo is visible when opened;
- the story/brand artwork stays on `contain` because it is artwork rather than a normal listing photo;
- desktop behavior is left alone.

No booking, Stripe, calendar, Supabase, or payment logic is changed.
