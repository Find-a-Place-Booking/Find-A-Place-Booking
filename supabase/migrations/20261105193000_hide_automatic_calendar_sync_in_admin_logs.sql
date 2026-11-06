-- Find A Place Booking / 2026-11-05
-- Remove automated iCal/PMS sync noise from ordinary admin activity logs.
-- The entries REMAIN in public.audit_logs, visible through trusted backend
-- service-role diagnostics; sync jobs, calendars and blocks are unchanged.
-- Keep real calendar connection changes, manual holds, payouts, property
-- changes, bookings and all other operational audit entries visible.
-- The existing audit_logs_select_admin policy is the sole authenticated
-- SELECT policy as verified on 2026-11-05.
ALTER POLICY audit_logs_select_admin ON public.audit_logs
  TO authenticated
  USING (
    public.is_active_admin()
    AND action NOT IN (
      'calendar.ical.auto_synced',
      'calendar.pms.auto_synced'
    )
  );
