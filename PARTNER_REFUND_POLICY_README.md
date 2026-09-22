# Partner + Non-Refundable Commission Overlay

This overlay implements the updated Find A Place business rules.

## Partner rate

- Standard host commission is 7%.
- The host onboarding wizard no longer contains partner questions or a 5% option.
- Old pending partner claims are withdrawn.
- Only SUPER_ADMIN / PARTNER_ADMIN can assign the 5% partner rate.
- Admin -> Partner rates lists host organizations and lets staff switch an
  organization between STANDARD_7 and PARTNER_5.
- A partner host sees a Partner indicator and 5% in their host dashboard.
- A standard host sees their normal 7% fee without being offered a partner path.
- Existing reservations keep the commission snapshot they were created with;
  changing an organization rate affects new reservations.

## Refunds / cancellations / changes

- Find A Place commission is non-refundable once a booking is paid.
- Host-approved guest refunds are funded from the host's connected Stripe charge.
- The application fee is not refunded.
- There is no longer a Find A Place 14-day commission-refund rule.
- Host cancellation without refund is no longer blocked by the old 14-day
  platform rule; the host's property policy and applicable law control the
  guest-facing decision.
- Cancellation still releases the reservation calendar immediately.
- Terms, Host Agreement and Cancellation Policy now state the rule explicitly.
- Policy versions are bumped to v6, so hosts who accepted an older Host
  Agreement/Cancellation Policy will be prompted to accept the current version.

Apply after the previous overlays:

```powershell
npx supabase db push
npm run typecheck
npm run build
```

Then test:
1. New standard host onboarding contains no partner question.
2. Standard host dashboard/payment page shows 7% and no partner enrollment.
3. Admin -> Partner rates can set a host to 5%.
4. That host dashboard then shows Partner / 5%.
5. Create a new reservation after the rate change and confirm its commission
   snapshot is 5%; older reservations remain unchanged.
6. Approve a guest refund and confirm `platform_fee_refund_cents = 0`.
7. Confirm the guest refund can complete while the Find A Place application fee
   remains retained.
