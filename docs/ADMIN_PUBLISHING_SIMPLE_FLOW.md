# Find A Place — Simple Admin Publishing (V2)

Date: November 5, 2026. Replaces the first, crowded admin publishing UI.

## What changed for the team

- Open **Admin → Publish stays**. The queue starts with listings that are ready, then those requiring help, then paused stays.
- The three counts at top filter the queue: Ready to publish, Need help, Paused. Search works by property or host name.
- Each row shows only the status and **the first actionable problem**, not the entire list of system issues.
- **See what to fix** opens a property-specific page. At the top is the listing's current readiness and, when truly ready, a single Publish button and internal approval note.
- Each outstanding issue has plain-English wording, a responsible party (admin, host or operations), and a direct link to the appropriate form or resource.
- Only editing sections with blockers open automatically. Property details, address, pricing, photos, calendar, checkout can still be opened manually to edit other facts.
- Hosts without a created property are inside a single collapsed section at the bottom of the queue; their assist page uses three small editing sections rather than a long form.
- Live calendar sync health and errors stay in **Admin → Calendars**. Routine automated calendar logs remain hidden from the readable admin Activity Log but intact in backend Supabase logs.
- Host advertising and discounted-stay interest remain in the separate Host Marketing area; they are not involved in deciding whether a property can publish.

## Safety boundaries (unchanged)

- Existing `admin_property_publication_issues` RPC supplies the authoritative blockers. No front-end "ready" guess overrides it.
- The existing `admin_finish_and_publish_listing` RPC re-checks blockers and runs publication triggers in one transaction.
- Host must personally accept Host Agreement, confirm listing authority and complete Stripe/tax setup.
- Admin can save ordinary listing facts and upload host-authorized photos; each change requires an audit reason.
- Failed external calendar connections cannot be bypassed by switching to manual while feeds are active.
- Archived properties are never included; paused listings are separately labeled and require explicit review before republishing.
- **No booking, tax, calendar-sync, email, Stripe, or published-property editing code was changed.**

## Applying

This is a **full replacement overlay** for the prior `find-a-place-admin-speedrun-and-ical-log-cleanup-overlay-2026-11-05.zip`. Use this newest ZIP only. Extract it over your GitHub repository root and push, then verify Vercel deployment and test with an authorized Operations/Super Admin login.

The Supabase migration files are included so source control records the functions and policies already installed. The production database functions and admin iCal/PMS log filter were **previously applied**. **Do not execute them again manually.** Check the Supabase migration history before running CLI migration commands.

## Release acceptance checks

1. Open `/admin/publishing`; ready, needs help and paused filters count and sort correctly; search works.
2. Select a ready non-paused draft. Confirm **Publish listing** is visible; submit with a real approval note; it must either publish or give a safe database error. Do not publish a random live host without approval.
3. Select an incomplete draft. Confirm it lists each blocker with appropriate 'Fix this', 'View host', 'Review taxes', or 'Check connection' links; only needed form sections are initially expanded.
4. Edit a harmless factual field and save; status shows success, the issue count updates when applicable, and audit log records the action.
5. Choose a host without a property. Assist flow must not create a property until it has a name, and creation yields an unpublished DRAFT.
6. Confirm no publishing button appears if the readiness RPC errors; blocked Stripe/tax/calendar cases remain blocked.
7. Check mobile-sized display for queue and detail, and ensure no horizontal overflow.
8. Check Admin Activity Log hides only the two automatic calendar sync action types; other audit entries still show. Calendar health views and actual iCal imports still function.
9. Run full Next.js build and preview smoke tests before merging to production.

## Rollback

To undo just the UI change, revert this overlay commit in GitHub. The already applied backend RPCs are additive and don't need to be dropped. No additional database migration is required for this V2 UI change.
10. Confirm a previously **REJECTED** property does not display the quick publish action; review its earlier decision in the full property record first.
11. Confirm saving a single field does **not** resubmit unchanged prefilled fields. Unchanged fields must remain untouched; the audit should record only actual changed keys.
