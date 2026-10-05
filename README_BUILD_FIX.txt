Build fix for Find A Place host FAQ overlay.

Base failing commit:
22e060474035d880f53c89e2e454e369b1f534ed

Fix:
- Removes unsupported <details defaultOpen={...}> prop.
- Opens the linked FAQ topic once on mount using HTMLDetailsElement.open.
- Keeps normal native <details> open/close behavior afterward.

Replace:
components/HostHelpCenter.tsx

No backend, database, booking, calendar, Stripe, tax, or onboarding logic changes.
