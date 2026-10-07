Find A Place Booking — turn on host/onboarding contextual tips

Drop this over the project root.

Changes:
- Mounts the already-built HostHelpAssistant inside DashboardShell.
- On /host/onboarding, tips default ON and follow the active onboarding step.
- The existing Stripe walkthrough becomes visible from the Payments tip.
- On other host dashboard pages, tips remain opt-in as originally designed.
- No onboarding save logic, Stripe logic, calendar sync, checkout, or database code changes.

File:
- components/DashboardShell.tsx

GitHub write access is still returning 403 from this connector, so this is a drop-in overlay instead of a claimed push.
