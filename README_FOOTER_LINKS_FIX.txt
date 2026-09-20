Find A Place footer link fix

Fixes the two non-functional footer items:
- Property policies -> /property-policies
- Help & support -> /help

Adds functional informational pages using the existing Find A Place header/footer
and legal-page styling. No booking, payment, tax, calendar, database, or Stripe
logic is changed.

Apply over the repository root, then:
npm run typecheck
npm run build
