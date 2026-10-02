# ResNexus v5 root recovery fix

This overlay contains only:

- `resnexus-worker/src/snapshot-recovery.mjs`
- `supabase/migrations/20261002193950_resnexus_scoped_quarantine_last_good_freshness.sql`

The production migration was already applied directly to Supabase before this ZIP
was created. Keep the migration file in the repo so migration history/source stays
aligned. Do not run the same SQL manually a second time.

What changed:

1. A bad ResNexus detail-page "correction" can no longer replace a plausible
   reservation-list stay when either boundary moves by more than 2 days.
   The current bad examples were Lil' Rustic changing Nov 19 -> Sep 28 and
   Whitetail changing Oct 10 -> Sep 15.

2. Overlap conflicts no longer abort the whole Fancy Hill account sync.
   The original short stay window is quarantined instead.

3. Unproven short reservation windows are quarantined only on the mapped
   ResNexus resource/site. They no longer make every cabin/site unavailable.

4. Implausible unverified spans longer than 62 nights are rejected rather than
   quarantined. This protects against the bogus Lil' Rustic Aug 21 -> Jan 3 row.

5. A transient ResNexus sync error no longer immediately closes a listing if a
   recent last-known-good sync exists. The normal freshness limit still applies,
   so genuinely stale calendars still fail closed.

After deploying the worker file, force one Fancy Hill ResNexus retry. A successful
run should restore HEALTHY status and replace/cancel stale exact blocks while
keeping only resource-scoped unresolved windows where needed.
