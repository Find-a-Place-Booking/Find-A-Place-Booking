# ResNexus quarantine recovery overlay

This fixes the failure mode where one unresolved ResNexus reservation puts the
entire mapped account into ERROR and the public booking calendar consequently
appears unavailable for the whole requested range.

Changed files:
- `resnexus-worker/src/index.mjs`
- `resnexus-worker/src/snapshot-recovery.mjs` (new)

No Supabase migration is included. The live database already has the current
`resnexus_unresolved_windows` quarantine table and trigger/function behavior.

Behavior:
- fully verified reservation blocks continue normally;
- detail-proof failures with a plausible stay range (1-62 nights) are converted
  to `ambiguous_reservation_safety_block` rows;
- the existing database trigger captures those rows as account unresolved date
  windows and skips inserting them as exact per-unit availability blocks;
- unverified absurd spans longer than 62 nights are rejected instead of closing
  months of inventory (this specifically prevents the bad Lil' Rustic
  2026-08-21 -> 2027-01-03 parse from poisoning availability);
- the account sync can complete, allowing healthy mappings to stay bookable;
- checkout still blocks any date that overlaps an unresolved ResNexus window.

Expected Railway health mode after deploy:
`resnexus-account-mapping-v4-quarantine-recovery`
