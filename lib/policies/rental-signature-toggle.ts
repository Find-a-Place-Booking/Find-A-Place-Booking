// Protects existing checkout during schema rollout. Enable only after the
// database migration, guest checkout UI and signature evidence are tested.
export function rentalSignatureEnabled() {
  return process.env.FAP_RENTAL_ESIGN_ENABLED === "true";
}
