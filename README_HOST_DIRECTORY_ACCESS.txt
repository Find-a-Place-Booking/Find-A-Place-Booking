Find A Place Booking — Guest Access to Public Host Profiles

Incremental overlay for the public-host-profile feature.

Adds:
- Guest-facing directory: /host-profiles
- "Meet the hosts" in public desktop/mobile navigation
- Directory cards linking to /hosts/[slug]
- Public photo, host name, bio preview, published stay count and verified review summary
- /host-profiles in sitemap

The earlier host-profile overlay already links the Hosted by section on each stay
directly to that host profile.

Why not /hosts for the directory:
- /hosts is already the host acquisition / list-your-property page.

Privacy:
- no phone
- no email
- no primary contact
- no business/street address
- no Stripe/payment information
- no private onboarding/account data

No database migration in this incremental overlay. It assumes the previous
public_host_slug migration is already applied.
