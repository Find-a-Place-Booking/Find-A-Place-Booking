"""No-IO static consistency tests for the UI-only overlay."""
from pathlib import Path
root=Path(__file__).resolve().parents[1]
card=(root/'components/DirectBookingValue.tsx').read_text()
css=(root/'components/DirectBookingValue.module.css').read_text()
app=(root/'app/admin/partners/page.tsx').read_text()
action=(root/'app/admin/partners/actions.ts').read_text()
fee=(root/'supabase/migrations/20261106090000_single_7_percent_guest_fee.sql').read_text()
assert '/brand/find-a-place-seal.png' in card
assert 'How we estimated this' in card and 'not an actual Airbnb price' in card
assert 'BEFORE_TAXES' in card and 'receiptPreTaxTotalCents' in card
assert 'estimatedSavings' not in card or 'Estimated savings:' not in card
assert '.brandSeal' in css and '@media (max-width: 560px)' in css
assert 'redirect("/admin/hosts")' in app
assert 'throw new Error' in action
assert "'STANDARD_7'::public.commission_tier" in fee
assert 'FROM PUBLIC, anon, authenticated' in fee
assert "key = 'hosts.commission'" in fee
assert "policy_key = 'host_agreement'" in fee
assert 'update public.reservations' not in fee.lower()
print('PASS: comparison, mobile layout, retired admin controls, and forward-only fee migration')
