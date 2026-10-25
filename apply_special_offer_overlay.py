"""Safely wire the Find A Place individual-offer UI into two existing admin pages.
Run once from the repository root: python apply_special_offer_overlay.py .
All search anchors are validated before either file is modified.
"""
from pathlib import Path
import sys

root = Path(sys.argv[1] if len(sys.argv) > 1 else ".").resolve()
LIST_PATH = root / "app/admin/reservations/page.tsx"
DETAIL_PATH = root / "app/admin/reservations/[reservationId]/page.tsx"

if not LIST_PATH.exists() or not DETAIL_PATH.exists():
    raise SystemExit("ERROR: Run from the Find A Place Booking repository root.")

files = {LIST_PATH: LIST_PATH.read_text(encoding="utf-8"),
         DETAIL_PATH: DETAIL_PATH.read_text(encoding="utf-8")}

def replace_one(source: str, old: str, new: str, label: str) -> str:
    if new in source:
        print("Already applied:", label)
        return source
    count = source.count(old)
    if count != 1:
        raise ValueError(f"{label}: expected one insertion point, found {count}; no files written")
    return source.replace(old, new, 1)

listing = files[LIST_PATH]
listing = replace_one(
    listing,
    "  const q = (params.q ?? \"\").trim();",
    '''  // Only suggest manual discounts to admins who are active owners/managers.
  // The send action independently verifies can_manage_property under their session.
  const { data: offerManagers } = await supabase
    .from("organization_members")
    .select("organization_id,role")
    .eq("profile_id", context.profileId)
    .eq("status", "ACTIVE")
    .in("role", ["OWNER", "MANAGER"]);
  const offerManageableOrgs = new Set((offerManagers ?? []).map((member) => member.organization_id));

  const q = (params.q ?? "").trim();''',
    "reservation list: manager visibility",
)
listing = replace_one(
    listing,
    '''            {filtered.map((reservation) => (
              <Link
                className="admin-list-row"''',
    '''            {filtered.map((reservation) => (
              <div key={reservation.id}>
              <Link
                className="admin-list-row"''',
    "reservation list: offer action wrapper",
)
listing = replace_one(
    listing,
    '''                  <b>Open support view →</b>
                </span>
              </Link>
            ))}''',
    '''                  <b>Open support view →</b>
                </span>
              </Link>
              {offerManageableOrgs.has(reservation.organization_id) &&
               ["HOLD", "PAYMENT_PENDING", "PAYMENT_FAILED", "EXPIRED"].includes(reservation.status) &&
               !["SUCCEEDED", "PROCESSING", "REFUNDED", "DISPUTED"].includes(reservation.payment_status) &&
               reservation.guest_email &&
               reservation.check_in > new Date().toISOString().slice(0, 10) ? (
                <div style={{ display: "flex", justifyContent: "flex-end", margin: "0 0 12px" }}>
                  <Link
                    className="button button-small button-quiet"
                    href={`/admin/reservations/${reservation.id}/offer`}
                  >
                    Send special offer
                  </Link>
                </div>
              ) : null}
              </div>
            ))}''',
    "reservation list: link under eligible booking records",
)

page = files[DETAIL_PATH]
page = replace_one(
    page,
    '''  const canRefund = hasAnyAdminRole(context, [
    "SUPER_ADMIN",
    "FINANCE_ADMIN",
  ]);
''',
    '''  const canRefund = hasAnyAdminRole(context, [
    "SUPER_ADMIN",
    "FINANCE_ADMIN",
  ]);

  const { data: offerPropertyAccess } = await supabase.rpc(
    "can_manage_property", { target_property_id: reservation.property_id },
  );
  const canOffer = environment === "LIVE" && offerPropertyAccess === true &&
    Boolean(reservation.guest_email) &&
    ["HOLD", "PAYMENT_PENDING", "PAYMENT_FAILED", "EXPIRED"].includes(reservation.status) &&
    !["SUCCEEDED", "PROCESSING", "REFUNDED", "DISPUTED"].includes(reservation.payment_status) &&
    reservation.check_in > new Date().toISOString().slice(0, 10);
''',
    "booking detail: secure offer link gate",
)
page = replace_one(
    page,
    '''      <div className="dash-grid metrics">
        <div>
          <span>Guest total</span>''',
    '''      {canOffer ? (
        <section className="panel" style={{ marginBottom: 16, display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
          <div>
            <p className="eyebrow dark">Unfinished checkout</p>
            <strong>Offer this guest a one-time discount</strong>
            <p className="muted">Owner-approved. One guest at a time. No changes to this booking or its calendar.</p>
          </div>
          <Link className="button button-small" href={`/admin/reservations/${reservation.id}/offer`}>
            Send special offer
          </Link>
        </section>
      ) : null}

      <div className="dash-grid metrics">
        <div>
          <span>Guest total</span>''',
    "booking detail: offer card",
)

# All five guarded edits are valid. Never partially modify the repository.
for path, next_content in [(LIST_PATH, listing), (DETAIL_PATH, page)]:
    if files[path] != next_content:
        path.write_text(next_content, encoding="utf-8")
        print("Patched", path.relative_to(root))
print("Individual-offer overlay connected. Run npm run typecheck and npm run build before pushing.")
