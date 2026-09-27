# Find A Place Booking — Mobile Hero Video Fix

This overlay changes only:

`components/DeferredBackgroundVideo.tsx`

## Cause

The Sep 24 "Mobile cleanup and Tax Fixes" change added an explicit mobile cutoff:

- detect `(max-width: 700px)`
- return before rendering the `<video>`

That made every hero using `DeferredBackgroundVideo` show only its poster on phones.

Affected hero videos:
- Homepage: `/media/find-a-place-hero-loop.mp4`
- About: `/media/find-a-place-about-fall-remix.mp4`
- Hosts: `/media/find-a-place-host-fall-loop.mp4`

## Fix

The mobile viewport block is removed.

Muted inline autoplay remains configured with:
- `autoPlay`
- `muted`
- `loop`
- `playsInline`

The poster fallback is still respected when the visitor explicitly uses:
- reduced-motion accessibility settings
- browser/device data-saver mode

No hero CSS, payment code, booking code, Supabase code, or onboarding code is changed.
