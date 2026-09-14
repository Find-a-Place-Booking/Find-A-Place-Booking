# Milestone 9B.1 — Performance & Integrity Review

Baseline reviewed: `841d98c` (`Calander Initial Commit`)

This report records the static, synthetic and architecture checks run during the 9B.1 hardening pass. It does not claim a live browser/Supabase benchmark: this isolated review environment does not contain the project's npm dependencies or the user's Supabase credentials. Real `npm run typecheck`, `npm run build`, database execution and browser/network timings remain local/staging acceptance gates.

## Whole-code integrity results

- TypeScript/TSX syntax parse: **85 files, 0 errors**.
- Local import resolution: **86 TS/TSX files, 0 missing local imports**.
- Routes/internal literal links: **36 routes, 74 references, 0 unmatched**.
- CSS-module references: **0 missing classes**.
- Debug/TODO scan: **0 `console.log`, `debugger`, TODO/FIXME/HACK hits** in application source.
- Broad `.select("*")` scan: **0 hits**.
- Async-map database/storage N+1 pattern scan: **0 hits** after image-signing cleanup.

## Supabase migration review

- Migration chain: **15 ordered migrations** through `20260914001500_calendar_hardening_performance.sql`.
- Application tables created by migrations: **27**.
- RLS enabled on all **27/27** application tables.
- SQL function names in the final migration corpus: **64**.
- `SECURITY DEFINER` search-path hardening scan: **0 issues**.
- Transaction / dollar-quote structural scan: **0 issues**. Migration 009 remains the intentional enum-extension exception to the normal explicit transaction wrapper.
- Sequential table/FK/trigger-function dependency scan: **0 issues**.
- Application Supabase RPC calls: **36 direct calls / 32 unique RPC names**.
- Missing RPC definitions: **0**.
- Literal RPC argument/signature mismatches: **0**.

These checks validate repository consistency and migration ordering, but are not a substitute for executing migration 015 against the actual Supabase project.

## Calendar safety tests

Synthetic tests passed for:

- discrete all-day VEVENT parsing;
- checkout-exclusive date preservation;
- duplicate event-key de-duplication;
- cancelled and transparent event omission;
- unsafe recurrence detection;
- malformed/truncated calendar rejection;
- fail-closed sync ordering: unsafe events are detected before `apply_ical_sync` is called;
- RFC-style UTF-8 iCalendar line folding at a maximum of 75 octets per physical line;
- bounded response streaming and immediate rejection after the feed-size limit;
- HTTP/private-IP/localhost/embedded-credential URL rejection;
- `webcal://` normalization to HTTPS;
- signed-URL batch chunking.

## Calendar microbenchmark

Node 22 synthetic CPU benchmark in the review container:

| VEVENT count | Parse | Serialize folded ICS | Output size |
|---:|---:|---:|---:|
| 1,000 | ~6.3 ms | ~9.5 ms | ~174 KB |
| 5,000 | ~21.5 ms | ~39.8 ms | ~873 KB |
| 10,000 | ~53.8 ms | ~65.8 ms | ~1.75 MB |

The production feed limit remains 2 MB / 10,000 events. Network latency and Supabase write time will dominate these pure parser/serializer CPU costs in real use.

## Database/query tightening

### Host calendar

Before hardening, the Calendar page downloaded every active external-block `connection_id` row for the selected unit just to count blocks by source. It now calls `calendar_connection_active_block_counts`, returning one aggregated row per connection and only counting current/future blocks.

### Admin calendar

Before hardening, Admin -> Calendars downloaded every active availability block platform-wide and then performed dependent unit -> property -> organization lookup queries. It now uses one admin-only `admin_calendar_health_bundle` RPC that joins ownership and aggregates current/future counts inside PostgreSQL. Private source feed URLs are never returned by that bundle.

Two additional partial indexes support current/future source and block-type health scans as historical calendar data grows.

## Storage/image request tightening

The whole-site scan found a more important non-calendar latency issue: private property images were being signed one object at a time in several server paths.

9B.1 now uses a shared bounded batch-signing helper:

- public listing cards sign **only the cover image they actually render**;
- the homepage asks the listing helper for only its three displayed featured cards before signing covers;
- `/stays` signs listing covers in chunks of up to 100 paths;
- public property galleries batch up to 12 paths;
- Host -> Properties batches cover signing;
- host property editor loads stored image URLs in batches;
- Admin property detail loads image URLs in batches.

Synthetic helper test: **225 paths -> 3 signing batches (100 + 100 + 25), 225 mapped URLs**.

For the expected early catalog of roughly 50–75 properties, the public listing grid goes from potentially dozens/hundreds of individual signing requests to one bounded bulk signing request for covers at that scale.

## Remaining performance boundaries

No critical local-code hotspot remains that should block the next milestone. The following should be measured/expanded later rather than prematurely optimized now:

- `public_listing_index()` is still an all-published catalog source; server-side location/date/guest filtering and pagination naturally belongs with real availability/search integration.
- Admin property detail intentionally makes several parallel operational reads; it is internal and not a guest hot path.
- automatic iCal polling is not part of 9B/9B.1; manual sync remains the local acceptance boundary.
- browser Web Vitals, TTFB, image transfer sizes and real Supabase query timings require the later Vercel staging pass.
- `npm run typecheck` and `npm run build` must still be run locally after the overlay because npm packages are unavailable in this isolated review runtime.
