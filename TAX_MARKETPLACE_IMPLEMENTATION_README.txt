Find A Place Booking - Marketplace Lodging Tax Patch

Built against production main HEAD:
6f172dc66dcf255c47f19a2be812e114b6901343

What this patch does
- Adds effective-dated tax authorities/rules and property locality verification.
- Seeds Arkansas 6.5% state sales, 2% tourism, Hot Springs/Garland 3% local sales, and Hot Springs 3% A&P lodging rules.
- Keeps local rules assignment-based so exact property jurisdiction is verified before LIVE checkout.
- Calculates and snapshots tax inside the same transaction that creates a booking hold.
- Adds tax to guest total but not the 5%/7% commission base.
- Retains tax in the Stripe destination-charge application fee instead of transferring it to the host.
- Keeps commission, tax, processor recovery, and host proceeds separate in accounting.
- Adds an append-only tax liability ledger and manual remittance records.
- Reverses tax liability on full refunds.
- Blocks 30+ night LIVE checkout pending contract-based transient-tax handling.
- Adds /admin/taxes for SUPER_ADMIN and FINANCE_ADMIN.

Apply
1. Extract this ZIP.
2. Run apply-tax-marketplace.ps1.
3. Run npm run typecheck.
4. Run npm run build.
5. Apply supabase/migrations/20260918004100_marketplace_lodging_tax.sql to the project database.
6. Open /admin/taxes and verify each property's exact locality / assigned local rules before enabling LIVE checkout.

Important
Government filing/payment is intentionally not automated. The admin console records what was filed/paid; Find A Place still files/remits through the appropriate government account when due.
