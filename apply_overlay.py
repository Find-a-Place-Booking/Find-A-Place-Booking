#!/usr/bin/env python3
"""Apply carefully guarded cosmetic/copy changes to existing Find A Place files.
No database or payment operations are performed by this script.
"""
from pathlib import Path
import sys

ROOT = Path(sys.argv[1]).resolve() if len(sys.argv) > 1 else Path(__file__).resolve().parent


STAGED = {}


def replace(path: str, old: str, new: str):
    p = ROOT / path
    if not p.is_file():
        raise RuntimeError(f"Missing expected repository file: {path} (extract this ZIP at the repository root)")
    source = STAGED.get(path, p.read_text(encoding="utf-8"))
    n = source.count(old)
    if (new and new in source) or (not new and n == 0 and "/admin/partners" not in source):
        print(f"  already updated: {path}")
        return
    if n != 1:
        raise RuntimeError(f"Expected exactly one matching anchor in {path}; found {n}. No existing files were changed.")
    STAGED[path] = source.replace(old, new)
    print(f"  ready: {path}")


def replace_legal_fallback():
    import json
    path = "app/host-agreement/page.tsx"
    p = ROOT / path
    if not p.is_file():
        raise RuntimeError(f"Missing expected {path}")
    source = STAGED.get(path, p.read_text(encoding="utf-8"))
    marker = '  "policy.host.payments": { title:'
    start = source.find(marker)
    end = source.find('  "policy.host.taxes": { title:', start)
    if start < 0 or end < 0 or source.find(marker, start + 1) >= 0:
        raise RuntimeError("Host agreement fallback has changed; no files were changed.")
    old = source[start:end]
    if "Payment processing and guest service fee" in old:
        return
    if "5% partner commission rate" not in old:
        raise RuntimeError("The legacy host policy wording is unexpected; no files were changed.")
    body = ("Guest booking charges are processed directly on the host's connected merchant account. "
            "For new reservations, a 7% Find A Place service fee is added to the guest's checkout total on the "
            "discounted lodging subtotal. Separately listed cleaning, pet and optional extras, and lodging taxes "
            "are excluded. The fee is disclosed before payment and retained through the connected payment's "
            "application fee; no second Find A Place commission is charged to the host.\n\n"
            "Existing reservations retain their originally agreed payment and fee snapshots and are not recalculated. "
            "Tax proceeds stay in the host's connected account. Stripe processing fees remain the host's responsibility.")
    new = '  "policy.host.payments": { title: "Payment processing and guest service fee", body: ' + json.dumps(body) + ' },\n'
    STAGED[path] = source[:start] + new + source[end:]
    print(f"  ready: {path}")


def main():
    replace("app/layout.tsx", 'import "./natural-brand-polish.css";',
            'import "./natural-brand-polish.css";\nimport "./custom-site-refinements.css";')
    replace("components/AdminSidebar.tsx",
            '  { label: "Partner rates", href: "/admin/partners", key: "partners", roles: ["SUPER_ADMIN", "PARTNER_ADMIN"] },\n', '')
    replace("components/AdminMobileNav.tsx",
            '  ["Partner rates", "/admin/partners", "partners", ["SUPER_ADMIN", "PARTNER_ADMIN"]],\n', '')
    replace("app/hosts/page.tsx",
            '    title: "Platform commission",\n    body:\n      "Commission is calculated from the nightly lodging subtotal after host discounts, not legitimate cleaning fees, pet fees, taxes, refundable deposits or optional add-ons.",',
            '    title: "Guest-paid booking fee",\n    body:\n      "Guests pay a 7% Find A Place service fee on the discounted lodging subtotal. Cleaning, pet fees, taxes and optional extras are excluded. Hosts remain responsible for their Stripe processing charges.",')
    replace("app/hosts/page.tsx", '<span> standard host commission</span>',
            '<span> guest-paid booking fee</span>')
    replace("app/hosts/page.tsx", 'Advertising is optional and separate from the booking commission.',
            'Advertising is optional and separate from the guest booking fee.')
    replace("app/host/payments/page.tsx", '  const organization = workspace.organizations[0] ?? null;\n', '')
    replace("app/host/payments/page.tsx", '    commissionResult,\n', '')
    replace("app/host/payments/page.tsx",
            '    organization\n      ? supabase\n          .from("organizations")\n          .select("partner_status,commission_tier")\n          .eq("id", organization.id)\n          .maybeSingle()\n      : Promise.resolve({ data: null }),\n', '')
    replace("app/host/payments/page.tsx",
            '  const commissionOrganization = commissionResult.data;\n  const isPartner =\n    commissionOrganization?.commission_tier === "PARTNER_5" &&\n    commissionOrganization?.partner_status === "VERIFIED";\n  const commissionRate = isPartner ? 5 : 7;\n\n', '')
    replace("app/host/payments/page.tsx",
            '          <span>Find A Place fee</span>\n          <strong>{commissionRate}%</strong>\n          <small>\n            {isPartner\n              ? "Partner rate · lodging subtotal only"\n              : "Standard commission · lodging subtotal only"}\n          </small>',
            '          <span>Find A Place guest fee</span>\n          <strong>7%</strong>\n          <small>Paid by the guest on discounted lodging</small>')
    replace("app/host/payments/page.tsx",
            '              Receives {commissionRate}% of the lodging subtotal',
            '              7% guest-paid service fee on the lodging subtotal')
    replace("app/admin/hosts/page.tsx",
            '<div><small>Partner tier</small><strong>{row.commission_tier ? cleanStatus(row.commission_tier) : "Standard 7%"}</strong><span>{row.partner_status ? cleanStatus(row.partner_status) : "Not claimed"}</span></div>',
            '<div><small>Guest booking fee</small><strong>7% · guest-paid</strong><span>Same rate for every new booking</span></div>')
    replace("app/admin/hosts/[profileId]/page.tsx",
            '<span><b>{organization ? cleanStatus(organization.commission_tier) : "—"}</b><small>{organization ? cleanStatus(organization.partner_status) : "—"}</small></span>',
            '<span><b>{organization ? "7% guest fee" : "—"}</b><small>{organization ? cleanStatus(organization.partner_status) : "—"}</small></span>')
    replace("app/admin/hosts/[profileId]/page.tsx",
            '<div><small>Commission effective</small><strong>{formatAdminDate(organization.commission_effective_from)}</strong></div>',
            '<div><small>Booking fee</small><strong>7% paid by guests on new reservations</strong></div>')
    replace("app/api/booking/airbnb-comparison/route.ts",
            '      const feeBps = host.commission_tier === "PARTNER_5" ? 500 : 700;',
            '      const feeBps = 700; // One guest-paid platform rate for future reservations.')
    replace_legal_fallback()
    # The entire overlay is validated before touching any original source file.
    for path, source in STAGED.items():
        (ROOT / path).write_text(source, encoding="utf-8")
    print(f"Completed {len(STAGED)} files. No database or payment operations were performed.")


if __name__ == "__main__":
    main()
