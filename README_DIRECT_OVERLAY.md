# Find A Place Booking — Cross-chat closeout overlay

Prepared November 22, 2026 CT. Source basis: GitHub `main` commit `12a64bbf580ef048ca92ece4e17d610bb1b9e4e6` (November 18).

**This is a direct-file overlay, NOT a patch script.** The ZIP has normal repository files in their final paths; copy its contents into the repository root and commit/push. Do not run an installer or shell script.

## Changes

1. `app/stays/page.tsx` — Fixes main Find a Stay sort order. Actual VERIFIED hosts appear ahead of standard inventory, including verified partners that are not in the homepage featured band. Cabins/homes remain ahead of campsites/RVs **within** each verification group. Homepage featured-priority/weekly rotation remains the stable ordering baseline. Results filters, nightly pricing, search radius, and guest count remain unchanged. The new metadata lookup has a fallback to the previous order if the lookup fails.
2. `supabase/migrations/20261116235231_fix_intro_promo_case_insensitive_match_blocks_property_add.sql` — Source-history copy of the already-applied case-insensitive promo lookup correction that unblocked Melissa's Add Property button.
3. `supabase/migrations/20261123052422_restrict_anonymous_host_property_mutation_rpcs_20261122.sql` — Source-history copy of the already-applied security migration, which removes anonymous EXECUTE on three private host-property mutation RPCs. Authenticated/service-role access retained.

**Both SQL migrations are ALREADY APPLIED in the live FAP Supabase project. No SQL should be run manually.** Their files are included for Git history and future environments. The only pending application change is the Find a Stay page and it is not live until your GitHub push and Vercel deployment.

## Manual acceptance checks after deployment

- `/stays`: verified partners first, standard hosts afterward. Inside each group, cabins/homes before camping/RV properties. Test unfiltered and destination searches, including Buffalo National River and under $150.
- Verify the checkout pages still show real prices and tax totals for a cabin, an RV site, and a Treehouse. The new source does not edit pricing functions.
- Reopen Renea's property editor and save one non-financial description change; verify no other property changes.
- Melissa can add a new DRAFT property on mobile. Her current Creek's Edge draft needs rates and calendar setup before publication.
- Vercel request/firewall logs still need to be inspected for intermittent availability 403 failures; access was not available through the current connection.

## Safety

No existing booking, payment, refund, Stripe account, host tax certification, calendar block or video record was modified during this closeout. The migrations changed function EXECUTE permissions and a promotion lookup (the latter was applied previously). No repo push or Vercel release was made by the overlay creator.
