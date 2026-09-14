# Milestone 10A — Reservation / hold / payment foundation

Baseline: `e710828` — accepted Milestone 9B.1 calendar hardening.

## Purpose

Create the durable reservation and financial boundary before any processor SDK or live platform account is connected.

This milestone deliberately separates **Find A Place business truth** from **processor execution**. A reservation owns the immutable pricing, commission, policy, tax-state, processing-policy and routing snapshots. Stripe/Square will later execute the already-decided payment instruction.

## Added in 10A

- reservation records keyed to immutable organization/property/unit UUIDs;
- 10-minute internal checkout holds using the canonical 9B availability table;
- per-unit transactional advisory lock for local hold creation;
- automatic release/expiry of local test holds;
- full 9A quote snapshot on the reservation;
- 5% / 7% commission tier, rate, base and amount snapshot;
- policy snapshot at reservation creation;
- promotion-use reservation records so limited codes can be protected during a hold without prematurely incrementing permanent redemption history;
- launch processing policy `HOST_FULL` snapshotted per reservation, while preserving future percent/fixed/full Find A Place processing credits;
- organization payment accounts plus property/unit assignment precedence;
- provider-neutral Stripe/Square account routing records with no raw bank/identity data;
- separate payment/refund/processor-event tables;
- append-only financial ledger foundation;
- append-only reservation event history;
- Stripe/Square adapter interfaces that fail closed until the real platform accounts are configured and accepted;
- real Host Reservations and Host Payments workspaces backed by Supabase;
- read-only Admin Reservations operations view.

## Payment-account routing precedence

For a rentable unit, future payment routing resolves:

1. unit-specific ready account;
2. property-specific ready account;
3. organization default ready account;
4. otherwise no payment account.

That keeps the system compatible with a host organization that later manages properties owned by different legal entities/bank accounts.

## Promo boundary

A test hold does not increment `promotion_codes.redemption_count`. Instead it creates a temporary `promotion_reservations` row. The later confirmation transaction will consume it atomically and then increment permanent redemption history.

## Not in 10A

- public/anonymous checkout creation;
- guest card fields;
- Stripe Connect OAuth/onboarding;
- Square seller OAuth;
- Stripe/Square API calls;
- processor webhooks;
- tax calculation/remittance;
- payout-delay/settlement policy;
- reservation confirmation after payment;
- live money.

The provider adapters intentionally throw a not-ready error. This is a safety feature, not unfinished fallback behavior.
