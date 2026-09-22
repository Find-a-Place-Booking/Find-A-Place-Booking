# Mobile navigation / UI overlay

This overlay is intentionally presentation-focused. It does not change booking,
payment, tax, cancellation, calendar-sync or database logic.

Fixes included:

- Public mobile menu is rendered at the viewport/body level so hero
  `overflow:hidden` cannot clip it.
- Public tablet/mobile header no longer shows desktop action links next to the
  hamburger.
- Menu gets a backdrop, close button, Escape-key support and scroll locking.
- Host/admin mobile navigation has larger touch targets, sane scrolling and a
  visible active state.
- Sign out and marketplace links are available inside the host/admin mobile
  menus.
- Mobile host/admin topbars no longer cram duplicate actions into the header.
- Host reservation cards show Dates and Status on phones; the old CSS hid them.
- Cancelled reservations get a visually distinct mobile card.
- Calendar keeps usable seven-day cells using horizontal scrolling rather than
  crushing them into a narrow screen.
- Mobile form controls use 16px text to prevent unwanted iOS input zoom.

After copying over the project root:

```powershell
npm run typecheck
npm run build
```

Then check at roughly 390px, 430px, 768px and 1024px widths.
