# Calendar sync monitoring — backend-only audit history

The `/admin/audit` activity log intentionally hides high-volume automatic iCal and PMS sync messages. Other admin events, including a host connecting/disabling a calendar and manual availability edits, remain visible. Nothing was removed from the database, and no sync worker, connection, host interface, calendar import/export, booking block, or availability safety check was changed.

In the **private Supabase SQL Editor**, use the read-only examples below. Do not place these queries in a public route or expose service-role keys in a browser.

```sql
-- Last 50 automatic iCal sync audit events, including failures/metadata
select created_at, action, entity_type, entity_id, reason, metadata
from public.audit_logs
where action = 'calendar.ical.auto_synced'
order by created_at desc
limit 50;
```

```sql
-- Current active calendar connection health and last success, no secret URLs
select c.id, c.provider, c.connection_kind, c.sync_status,
       c.last_success_at, c.last_sync_attempt_at, c.last_error,
       u.slug as unit_slug, p.name as property_name
from public.calendar_connections c
join public.property_units u on u.id = c.unit_id
join public.properties p on p.id = u.property_id
where c.is_active = true
order by c.last_success_at nulls first, p.name
limit 200;
```

```sql
-- High-level sync history, independent of the admin activity timeline
select status, count(*) as runs, max(completed_at) as latest_completed
from public.calendar_sync_runs
where started_at > now() - interval '24 hours'
group by status
order by runs desc;
```

The activity-log read-policy is intentionally different from backend privileges: normal authenticated administrators only see operational activity rather than repetitive `calendar.ical.auto_synced` / `calendar.pms.auto_synced` entries; trusted backend service-role queries still see the complete audit trail. For emergency debugging inspect the full backend before changing any connection or booking holds.
