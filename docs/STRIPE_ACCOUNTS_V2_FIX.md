# Stripe Accounts v2 correction

## Why this patch exists

Stripe is rejecting Accounts v1 creation for this new Connect integration:

> Stripe no longer recommends Accounts v1 for new Connect integrations.
> Create connected accounts with POST /v2/core/accounts instead.

The earlier test overlays still called `POST /v1/accounts`, so they could never
finish on this Stripe platform without explicitly enabling the legacy
compatibility switch.

This patch uses Accounts v2 instead. Do **not** enable the legacy Accounts v1
feature just to preserve the old test code.

## Find A Place account model

Find A Place uses destination charges:

guest -> Find A Place platform -> connected host

Therefore the host is created as an Accounts v2 `recipient` with
`stripe_balance.stripe_transfers` requested.

The host has:

- `dashboard: none`
- embedded Connect onboarding inside Find A Place
- no Stripe-hosted dashboard redirect
- Stripe-owned KYC/bank fields
- a stored `acct_...` reference in Find A Place

The platform remains the account that creates the guest charge.

## Why charges_enabled is not the readiness gate

A recipient-only connected account is not charging the guest directly.

Find A Place creates the charge, so the host's `charges_enabled` flag is not the
correct launch gate. The local account becomes READY when Stripe reports:

- transfers capability active
- payouts enabled

## Account Sessions

The connected account is created through Accounts v2. Stripe Account Sessions
are still used to authenticate Connect embedded components. Accounts v2 account
IDs are interoperable with most v1 endpoints, which lets the embedded component
flow continue to use `/v1/account_sessions`.

## Sandbox replacement

If one of the earlier patches already stored a v1 test `acct_...` ID, this patch
replaces that reference once with an Accounts v2 recipient account. That is safe
for the current sandbox-only phase.

Do not automatically replace live connected accounts after launch.
