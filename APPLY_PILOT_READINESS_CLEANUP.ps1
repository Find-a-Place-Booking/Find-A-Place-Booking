$ErrorActionPreference = "Stop"

function Replace-Required {
  param(
    [string]$Path,
    [string]$Old,
    [string]$New
  )
  if (-not (Test-Path $Path)) { throw "Missing expected file: $Path" }
  $content = Get-Content -Raw -Path $Path
  if (-not $content.Contains($Old)) { throw "Expected cleanup text was not found in $Path. Stop so we do not patch the wrong source revision." }
  $updated = $content.Replace($Old, $New)
  Set-Content -Path $Path -Value $updated -NoNewline -Encoding UTF8
  Write-Host "updated $Path"
}

# Property editor: remove stale disabled calendar CTA and outdated live-listing wording.
Replace-Required "components/PropertyEditor.tsx" @'
This listing is live. A later revision workflow will handle changes without silently altering the approved public version.
'@ @'
This listing is live. Operational rates, calendars, payouts and reports remain available in their dedicated workspaces; approved public listing details stay protected from silent edits.
'@

Replace-Required "components/PropertyEditor.tsx" @'
<div className="connection-card"><div className="connection-icon">↻</div><div><strong>Calendar preference is real; the connection is not yet active.</strong><span>iCal/PMS URLs, sync health and availability ingestion will appear when calendar sync is enabled.</span></div><button className="button button-small" type="button" disabled>Connect calendar</button></div>
'@ @'
<div className="connection-card"><div className="connection-icon">↻</div><div><strong>Manage live calendar connections in Calendar.</strong><span>Connect and test Airbnb, Vrbo, ResNexus, OwnerRez and other iCal/ICS feeds from the dedicated calendar workspace.</span></div><Link className="button button-small" href="/host/calendar">Open calendar</Link></div>
'@

Replace-Required "components/PropertyEditor.tsx" @'
Live in the guest-facing marketplace. Booking is not enabled yet.
'@ @'
Live in the guest-facing marketplace. Checkout availability follows this property's TEST/LIVE launch gate plus its payment, tax and calendar readiness.
'@

# Host onboarding: remove pre-launch copy that is no longer true.
Replace-Required "components/HostOnboardingWizard.tsx" @'
The exact address will later drive taxes, geocoding and the real map. Public search can show the general area instead of the precise street address.
'@ @'
The exact address drives tax jurisdiction, geocoding and the property map after the property record is created. Public search can still show the general area instead of the precise street address.
'@

Replace-Required "components/HostOnboardingWizard.tsx" @'
Only selected amenities will eventually appear on the listing.
'@ @'
Only selected amenities carry into the property listing.
'@

Replace-Required "components/HostOnboardingWizard.tsx" @'
Common policy choices and their details persist with onboarding and carry into the property record. Confirmed bookings will later retain the accepted policy snapshot.
'@ @'
Common policy choices and their details persist with onboarding and carry into the property record. Confirmed bookings retain the policy snapshot the guest reviewed and accepted.
'@

Replace-Required "components/HostOnboardingWizard.tsx" @'
<label className="full"><span>Cancellation policy</span><select value={form.cancellation} onChange={(e) => update("cancellation", e.target.value)}><option value="">Choose a policy</option><option value="flexible">Flexible</option><option value="moderate">Moderate</option><option value="firm">Firm</option><option value="strict">Strict</option></select><small>Exact platform cancellation terms will be finalized before live bookings.</small></label>
'@ @'
<label className="full"><span>Property cancellation notes</span><textarea value={form.cancellation} onChange={(e) => update("cancellation", e.target.value)} placeholder="Property-specific cancellation notes, if any." /><small>Find A Place guest self-service cancellation follows the platform cutoff: before 14 days prior to check-in. Property-specific notes are shown with the host policies.</small></label>
'@

Replace-Required "components/HostOnboardingWizard.tsx" @'
Checked and custom policies will eventually become the guest-facing House Rules section.
'@ @'
Checked and custom policies carry into the guest-facing House Rules section.
'@

Replace-Required "components/HostOnboardingWizard.tsx" @'
Editing the saved membership details does not automatically reopen an admin decision. A future explicit re-review workflow can be added if needed.
'@ @'
Editing the saved membership details does not automatically reopen an admin decision. Contact Find A Place staff if the claim needs another review.
'@

# Rates pages: remove old milestone language now that checkout/promo/tax wiring exists.
Replace-Required "app/host/rates/page.tsx" @'
Future connected providers can sync availability without silently replacing platform pricing.
'@ @'
Connected providers sync availability without silently replacing platform pricing.
'@
Replace-Required "app/host/rates/page.tsx" @'
Will consume a structured quote containing resolved lodging, host discounts, fees and selected add-ons. Availability must be rechecked before a reservation can be created.
'@ @'
Consumes the structured quote containing resolved lodging, host discounts, fees and selected add-ons. Availability is rechecked before the reservation hold is created.
'@
Replace-Required "app/host/rates/page.tsx" @'
Processors will receive final line items later. Processor fees and taxes are deliberately not baked into the rate tables.
'@ @'
Stripe receives the resolved guest total only after pricing and marketplace tax are calculated. Processor fees and taxes remain separate from host rate tables.
'@

Replace-Required "app/host/rates/[slug]/page.tsx" @'
Maximum-use settings are stored now, but previewing a quote never consumes a use. The future reservation transaction will atomically reserve/redeem the code and snapshot it with the booking.
'@ @'
Maximum-use settings are enforced when a reservation hold is created. Previewing a quote never consumes a use; an accepted code is reserved/redeemed atomically and snapshotted with the booking.
'@
Replace-Required "app/host/rates/[slug]/page.tsx" @'
This preview uses the same structured quote boundary reserved for checkout.
'@ @'
This preview uses the same structured quote boundary used by checkout.
'@
Replace-Required "app/host/rates/[slug]/page.tsx" @'
Enforced atomically when reservation creation is wired. Preview does not consume uses.
'@ @'
Enforced atomically when a reservation hold is created. Preview does not consume uses.
'@
Replace-Required "app/host/rates/[slug]/page.tsx" @'
Show to guests when checkout add-ons are enabled.
'@ @'
Show this active add-on to guests during checkout.
'@

# Admin host detail: point at the real booking workspace instead of claiming it is disconnected.
Replace-Required "app/admin/hosts/[profileId]/page.tsx" @'
<div><span>Bookings / payments</span><strong>Not connected</strong></div>
'@ @'
<div><span>Bookings / payments</span><strong><Link href="/admin/reservations">Open reservations</Link></strong></div>
'@
Replace-Required "app/admin/hosts/[profileId]/page.tsx" @'
Real property records and review/publication state are now available. Reservation, payment, notification and issue history are not enabled yet.
'@ @'
Property review is connected, and booking/payment history is available from Reservations. Messages, reviews, refunds and issue notes remain tied to the reservation record.
'@

# Host dashboard: remove fake discovery placeholder and point to the real reports workspace.
Replace-Required "app/host/page.tsx" @'
<section className="panel performance"><p className="eyebrow dark">Network reach</p><h2>Discovery data</h2><div className="panel-empty"><strong>Performance begins after launch.</strong><span>Search impressions, property views and booking sources will appear here after listings are published.</span></div></section>
'@ @'
<section className="panel performance"><div className="panel-head"><div><p className="eyebrow dark">Reporting</p><h2>Booking & payout reports</h2></div><Link href="/host/reports">Open reports</Link></div><div className="panel-empty"><strong>Financial reporting is connected.</strong><span>Run date/property reports for guest payments, host proceeds, refunds, taxes, commission and completed payouts.</span></div></section>
'@

# Payments: be explicit that Square is not part of the current pilot instead of looking half-wired.
Replace-Required "app/host/payments/page.tsx" @'
<small>Supported alternative</small>
'@ @'
<small>Planned alternative</small>
'@
Replace-Required "app/host/payments/page.tsx" @'
Square seller OAuth is reserved for the later Square integration.
'@ @'
Square is not enabled during the Stripe-first pilot.
'@
Replace-Required "app/host/payments/page.tsx" @'
Connect Square
'@ @'
Square not available in pilot
'@


# Partner verification and audit copy: describe the current manual workflow instead of a future import.
Replace-Required "app/admin/partners/page.tsx" @'
<p className="eyebrow dark">Existing partner import</p><h2>Claim records are real; directory matching is not enabled yet</h2><p className="muted">The exact business, owner, email and phone submitted by the host are stored with the claim. A future directory import can compare existing Find A Place partners against these normalized claims and flag likely matches without ever auto-granting PARTNER_5.</p>
'@ @'
<p className="eyebrow dark">Manual partner verification</p><h2>Compare the host's claim with the existing Find A Place relationship</h2><p className="muted">The submitted business, owner, email and phone stay attached to the claim so authorized staff can verify the relationship before granting PARTNER_5. No host can self-award the partner rate.</p>
'@

Replace-Required "components/HostOnboardingWizard.tsx" @'
This creates the real host organization used by the dashboard and admin team. One organization can manage multiple properties and staff accounts later.
'@ @'
This creates the real host organization used by the dashboard and admin team. One organization can manage multiple properties; the owner/manager account controls the pilot workspace.
'@

Replace-Required "components/HostOnboardingWizard.tsx" @'
This organization persists across sign-out/sign-in. Property records are managed in Properties; additional team-member controls can be added later.
'@ @'
This organization persists across sign-out/sign-in. Property records are managed in Properties; additional team-member access is outside the current pilot.
'@

Replace-Required "components/HostOnboardingWizard.tsx" @'
Saving this step creates/updates the real admin verification request. Matching a future imported partner record may speed review but will never automatically grant 5%.
'@ @'
Saving this step creates or updates the real admin verification request. Find A Place staff compare the submitted membership details before any 5% tier is approved.
'@

Replace-Required "app/admin/audit/page.tsx" @'
Partner verification decisions and future privileged changes will appear here automatically.
'@ @'
Partner verification decisions and other privileged admin changes appear here automatically.
'@

Replace-Required "app/host/rates/[slug]/page.tsx" @'
Allow this rate to be highlighted as a special when guest date-pricing is wired in.
'@ @'
Allow this rate to be highlighted as a guest-facing special.
'@

Write-Host "Pilot-readiness copy cleanup complete."
