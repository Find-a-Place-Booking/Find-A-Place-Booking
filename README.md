# Find A Place Booking — Public header / For hosts dropdown repair

Prepared November 9, 2026, against the GitHub `main` versions of:

- `components/Header.tsx` (blob `cc587f358eee7a19483a0d5ae486dd18e77d2485`)
- `components/HostResourcesMenu.tsx` (blob `30bcb8192e690c601d9a9a63baaa954af4cd9103`)
- `components/HostResourcesMenu.module.css` (blob `db1855d0b7ae7c8d4c557a22789a3c2d8b60e14e`)

## Install — direct replacement, no installer

1. Open the `Find-A-Place-Booking` repository on your computer.
2. Extract this ZIP **into the repository root**, preserving the `components/` folder. Approve overwriting only the three existing component files. The fourth component file, `HeaderNavigationFix.module.css`, is new.
3. Verify these four files are part of the Git commit:
   - `components/Header.tsx`
   - `components/HeaderNavigationFix.module.css`
   - `components/HostResourcesMenu.tsx`
   - `components/HostResourcesMenu.module.css`
4. Run `npm run typecheck` and `npm run build`, and push to GitHub only after they succeed. Verify the new deployment is READY. Make sure your local branch wasn't changed in the meantime.
5. Hard-refresh the homepage and test the dropdown on the homepage, the About page, the For Hosts page, `/stays`, at desktop width and with the hamburger menu on a tablet/phone.

## Exact bugs addressed

- The header is beige but `.header-light` left non-anchor nav labels inheriting **white**. Set an explicit dark color for standard public headers, retaining white only on the dark host-marketing hero.
- The dropdown was inside `home-hero`/`aboutHero` or other overflow/stacking contexts. The dropdown now renders through a React portal into `document.body`, at the button's measured viewport position, with a clear high z-index. It closes on outside click, Escape, page scroll, link click, and resize.
- The social button's negative margins, mixed anchor heights, nav gaps and inline styles produced uneven nav vertical alignment. The new CSS module sets common control heights and measured gaps.
- On laptop widths the desktop header tried to show a long brand, six nav links and four account actions. It now switches to the existing hamburger menu at widths **1550px and under**. The same value is used in JavaScript and responsive styles, and the portaled menu works at the extended widths.

## Safety

Presentation and navigation only. No Stripe, fee, guest checkout, Supabase, calendar, host data, admin, tax or reservation code is modified. No package dependencies or migrations. Original links and mobile options are retained.

## Verification status

Syntax and CSS parsing pass in isolation, with automated source tests. A full Next.js production build and live-browser click tests are still required in your repository; they cannot be verified from this ZIP alone. Not deployed by ChatGPT.
