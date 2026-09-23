Find A Place Booking — About Featured Card Overlay

Drop the contents of this ZIP over the project root.

Changes:
- Removes the visible "Arkansas first" label from the About-page featured card.
- Keeps the featured image fixed in code.
- Makes the featured card heading and paragraph editable in:
  Admin -> Site Copy & Policies -> About -> Featured card
- Adds an idempotent Supabase migration for the new managed content block.

Files:
- app/about/page.tsx
- supabase/migrations/20260923055000_about_featured_card_content.sql
