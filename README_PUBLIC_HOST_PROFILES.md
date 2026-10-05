# Find A Place — Public Host Profiles

This overlay adds public host profiles without creating a second host-profile engine.

## Source of truth

The public profile reads the same existing host account data already used by onboarding/settings:

- `organizations.public_host_name`
- `organizations.public_host_bio`
- the owner/manager `profiles.avatar_storage_path`
- published properties belonging to the organization
- published verified `reservation_reviews`

The new onboarding card edits those same existing fields. Settings can still edit the same fields later; it is not a duplicate profile record.

## Public URL

Migration adds a stable `organizations.public_host_slug`.

Example:
`/hosts/fancy-hill-cabins`

The slug is generated when a real public host name is first saved and remains stable if the display name changes.

Existing hosts are backfilled from:
1. existing `public_host_name`
2. saved onboarding `hostName`
3. organization name

Existing public bios are preserved. No bio is invented from private data.

## Privacy

The public host route intentionally does NOT expose:

- primary contact name
- host email
- host phone
- business location/address
- property street address
- Stripe/payment details
- legal/account details

The public page shows only the public display name, public bio, profile image,
published stays and published verified reviews.

The secure My Trip page can continue using booking contact information after a
guest has a real reservation. That is separate from the public host profile.

## Public message host action

A guest can send a pre-booking question from the host profile without seeing
the host's private contact information.

These inquiries:
- are stored in `host_profile_inquiries`
- appear under Host Dashboard -> Inquiries
- can optionally be attached to one of the host's published stays
- notify the host by email when a private notification/operations/contact email exists
- let the host reply from the dashboard
- email the reply from Find A Place rather than exposing the host's private account email
- include a same-origin check, honeypot, field validation and per-email/hour throttling

Reservation messages remain reservation-specific. The inquiry table deliberately
does not create fake reservations just so a traveler can ask a question.

## Deployment order

1. Apply `supabase/migrations/20261005223000_public_host_profiles_and_inquiries.sql`
2. Deploy the code files.

No booking, payment, calendar, tax or availability logic is changed by this overlay.
