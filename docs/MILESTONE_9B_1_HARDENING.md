# Milestone 9B.1 — Calendar Safety, Privacy & Performance Hardening

Baseline: `841d98c` (`Calander Initial Commit`).

## Purpose

9B.1 closes the issues found in the post-9B consistency review without changing the canonical calendar architecture.

### Fail-closed synchronization

The parser distinguishes normal omissions (cancelled/transparent events and duplicate keys) from events that cannot be safely normalized. Unsupported recurrence masters, missing stable IDs, invalid dates and truncated calendar documents stop the sync before `apply_ical_sync` runs. Existing imported blocks therefore remain active instead of being removed by a partial/unsafe feed interpretation.

### Bounded external feed fetching

External iCal fetching retains the 2 MB feed cap and private-network/redirect checks, but now also bounds DNS resolution and streams the response body under the active request timeout. A server cannot bypass the memory limit simply by omitting `Content-Length`, and a fast header response cannot keep an unlimited body stream open after the timeout is cleared.

### Private calendar configuration

`calendar_connections.feed_url` and `calendar_export_tokens.token` are bearer/private configuration. Direct RLS reads are now limited to organization OWNER/MANAGER users plus active admins. Ordinary organization staff may still read canonical `availability_blocks` through the existing unit-access policy.

### Bounded calendar queries

The host Calendar screen now obtains current/future source block totals through `calendar_connection_active_block_counts` rather than downloading every active imported block for that unit.

Admin -> Calendars now uses `admin_calendar_health_bundle`, which performs ownership joins and block aggregation in PostgreSQL and returns only the rows needed by the screen. Private feed URLs are not included.

### iCalendar output

Outbound `.ics` data is folded at the RFC 5545 75-octet physical line limit, including UTF-8 text. Export payloads include current/future unavailability plus 30 days of recent history instead of retaining unlimited old blocks in every subscription response.

### Storage/image request reduction

The whole-site speed review found repeated private Storage signing calls on public listing grids, host property lists/editors and Admin property detail. A shared bounded `createSignedUrls` helper now batches those requests. Public listing cards sign only their actual cover image; detail pages batch the gallery in one or a few bounded requests.

## Still intentionally out of scope

- scheduled/background calendar polling;
- RRULE expansion / timezone-aware recurrence engine;
- direct PMS APIs/webhooks;
- live reservations and checkout holds;
- taxes;
- Stripe/Square and payouts.

Recurring feeds currently fail safely and surface an actionable sync error. A richer provider adapter can add recurrence expansion later without weakening canonical availability safety.
