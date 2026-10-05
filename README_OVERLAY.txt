Find A Place Booking — build fix overlay for commit a8d59c0

Drop/unzip this over the project root.

Files replaced:
- components/PropertyActions.tsx
- lib/public/stay-cards.ts

Fixes:
1. TS2774 in PropertyActions.tsx
   - Uses `typeof navigator.share === "function"` once and reuses the boolean.
   - Runtime share/copy behavior is unchanged.

2. TS2322 / TS2677 in lib/public/stay-cards.ts
   - Explicitly types buildCards() as Promise<Property[]>.
   - Explicitly types each mapped card as Property.
   - Prevents `instantBook: false` from being inferred as the literal `false`
     when later code expects the broader Property type.
   - The existing undefined filtering then narrows correctly.

No database, calendar, payment, checkout, or email behavior is changed.
