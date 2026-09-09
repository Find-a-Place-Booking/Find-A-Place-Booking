-- Find A Place Booking
-- Milestone 8A: add the returned-for-changes listing status.
-- Run this migration first and let it commit before Milestone 8B uses the value.

alter type public.property_status
  add value if not exists 'CHANGES_REQUESTED' after 'PENDING_REVIEW';
