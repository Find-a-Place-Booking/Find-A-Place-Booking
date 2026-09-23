# Find A Place Booking — UI polish pass

This patch is based on the current `main` state reviewed on September 23, 2026.

It intentionally **does not modify any editable/CMS copy in Supabase**.

What it changes:
- Removes launch-style / placeholder fallback copy from non-CMS UI states.
- Replaces visible "Photo coming soon" / "Property photo" placeholders with branded visual fallbacks.
- Cleans up the no-inventory and checkout-unavailable states.
- Simplifies host onboarding wording that exposed implementation details.
- Removes the redundant onboarding right-side explainer.
- Cleans host photo/Stripe status messages.
- Removes host-facing TEST/LIVE implementation wording where it is not operationally useful.
- Replaces developer-oriented property/admin wording with normal product language.
- Fixes stale property-editor messaging from the earlier placeholder photo/calendar implementation.
- Replaces the disabled calendar button with a real link to the host Calendar workspace.
- Removes the internal property ID/old-URL details from the host-facing listing card.
- Removes Stripe-webhook jargon from the guest confirmation flow.
- Adds small CSS overrides so the simplified screens keep the current visual style and responsive behavior.

## Apply

From the root of the Find-A-Place-Booking repository:

```powershell
node .\apply-ui-polish.mjs
npm run typecheck
npm run build
git diff
```

If the diff looks good:

```powershell
git add app components
git commit -m "Polish production UI and host onboarding"
git push
```

## Revert before committing

```powershell
git restore app components
```

The script stops with an error if the expected current source text does not match, so it should not silently alter a newer/different implementation.
