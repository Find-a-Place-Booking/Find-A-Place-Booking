// Default OFF. Enable only after new tables, Stripe deposit webhook, test payment,
// refund and chargeback reconciliation have been verified end-to-end.
export function securityDepositPaymentsEnabled() {
  return process.env.FAP_SECURITY_DEPOSIT_PAYMENTS_ENABLED === "true";
}
