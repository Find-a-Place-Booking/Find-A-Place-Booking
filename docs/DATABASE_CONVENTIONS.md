# Find A Place Booking — Database Conventions

These conventions begin with Milestone 3 and should be preserved unless a later architectural decision explicitly supersedes them.

## IDs and timestamps

- Application entities use UUID primary keys.
- `profiles.id` is the matching `auth.users.id`.
- Mutable business records use `created_at` and `updated_at` (`timestamptz`).
- Historical/event records such as `audit_logs` are append-only and use `created_at` rather than mutable timestamps.
- Store timestamps in PostgreSQL as `timestamptz`; render them in the appropriate user/property timezone at the UI boundary.

## Organizations first

Hosts are modeled as organizations rather than assuming one auth user equals one property owner. An organization can later contain multiple properties and multiple owner/manager/staff accounts.

## Admin separation

Internal platform access is modeled separately from host membership:

- `organization_members` controls access to a host organization.
- `admin_users` + `admin_role_assignments` controls internal Find A Place Booking access.

A person can eventually be both without the two permission systems being conflated.

## Partner commission states

The organization carries the current account-level partner/commission state:

- unverified/new host: `STANDARD_7`
- claimed existing partner: `PARTNER_PENDING` + still `STANDARD_7`
- authorized verified partner: `VERIFIED` + `PARTNER_5`

A host cannot grant itself `PARTNER_5`. The future admin verification workflow will perform the change and write an audit record.

**Reservation rule:** the organization's current tier is never treated as historical truth. Future reservation creation must snapshot `commission_tier`, `commission_rate`, and commission base/amount onto the booking/financial records.

## RLS and privileged actions

- Enable RLS before exposing application tables.
- UI visibility is never authorization.
- Host policies must scope records to the caller's organization membership.
- Admin access must require explicit internal role authorization.
- Service-role/secret-key operations are server-only and reserved for narrowly defined privileged workflows.

## Auditability

Privileged changes must later write `audit_logs`, including at minimum commission-tier changes, refunds, payout-account changes, property transfers, tax changes, admin-role changes, and sensitive reservation changes.

Audit records should capture actor, action, entity, timestamp, reason, before/after state when relevant, and useful request/metadata context.
