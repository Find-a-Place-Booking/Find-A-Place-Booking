# Find A Place Booking — Optional Insurance Resource Links

**Overlay ZIP**: Extract into the *root of the Next.js repository* and merge/replace the matching paths. Commit and push as usual. The ZIP is NOT a script and doesn't change Stripe, holds, checkout calculations, booking policies, or reservations.

## What guests see
- Low-key optional **Faye travel insurance** resource below checkout and on a successful reservation confirmation, plus the My Trip lookup page and public footer.
- It is a separate third-party site, not something a guest must select to pay or make a booking.

## What hosts see
- Low-key optional **Proper short-term rental insurance** resource on Host Help & FAQ, plus a public footer link under For hosts.
- No requirement to purchase or supply policy details.

## Click tracking
- Every insurance link goes first to a *strictly allowlisted* first-party route (`/go/insurance/faye` or `/go/insurance/proper`) and then redirects to the insurer's user-provided main site.
- Redirects do not prefetch. Logging runs **after** the redirect response and does not delay booking. The database table only contains `provider`, `placement`, `occurred_at` and a generated ID. No guests, host IDs, booking tokens, emails, IP addresses or user-agent strings.
- All links also emit the existing Vercel Web Analytics `insurance_resource_click` custom event with public `provider`, `audience`, and `placement` properties (where permitted by the site's private-page analytics filter and Vercel plan). The Supabase counter is the primary reliable source on private routes.
- The Supabase migration `20261014173500_insurance_resource_click_tracking.sql` has **already been applied to production** and is included here to keep the repository's schema history current; it is idempotent.

Read counts in Supabase:
```sql
select provider, placement, count(*) as clicks
from public.insurance_resource_clicks
group by provider, placement
order by provider, placement;
```

## Privacy, coverage and scope
- Insurance is optional, purchased externally if a guest/host chooses.
- No affiliation, partnership, referral compensation, guaranteed coverage, or claim benefit is asserted.
- Existing payment, checkout, and refund logic is unchanged.

## How to confirm after deployment
1. Open checkout, a confirmed booking page, My Trip, and Host Help/FAQ and verify the optional resource is readable but discreet.
2. Click one link to each provider. Each should open the insurer's official domain in a new tab.
3. Run the query above to see the click counts increase. Server-side log insertion is scheduled using Next.js `after()` and should not delay the redirect.
4. Confirm public footer links work on mobile and do not introduce any overlays or modal prompts.

Source basis: repository `Find-a-Place-Booking/Find-A-Place-Booking` default branch as reviewed 2026-10-14. All files are full path replacements (no installer). TypeScript/TSX syntax checks passed. A full build and live end-to-end click test must follow deployment.
