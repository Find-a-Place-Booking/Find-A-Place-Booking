# Guest Emails V3 — property access defaults

This overlay supersedes the earlier Guest Emails property-flow/styling overlays.

## What changed
- Guest Emails remains property-first: Guest Emails -> property -> email setup.
- The pre-arrival email now has a collapsible **Access code & arrival notes** section directly inside the email setup.
- Hosts can save one normal access/door code and arrival notes for the property.
- `{{access_code}}` and `{{arrival_notes}}` automatically use those saved property defaults.
- Existing reservation-specific instructions remain the higher-priority override when present.
- The old standalone Upcoming stays/access-info section was removed from the main setup UI.
- The property list now shows whether an access code and arrival notes are saved instead of counting guests missing access info.

## Deployment order
1. Apply `supabase/migrations/20261002201500_guest_email_property_defaults.sql`.
2. Overlay the app/lib files and deploy.

The migration only adds two nullable columns and length checks to `host_guest_email_rules`. It does not rewrite existing rules, reservations, hosts, properties, or sent-email history.
