#!/usr/bin/env python3
"""Fail-closed, reversible Find A Place safe host-feature overlay.

Run from repository root: python path/to/extracted/patch/apply.py [--dry-run]
Python 3.9+ required. No DB writes; applies only source changes and copies a migration.
"""
from pathlib import Path
import argparse
import datetime
import shutil
import sys

ROOT = Path.cwd()
BUNDLE = Path(__file__).resolve().parent.parent
MIGRATION = 'supabase/migrations/20261115170000_safe_host_feedback_phase1.sql'


def replace_once(s: str, old: str, new: str, source: str) -> str:
    count = s.count(old)
    if count != 1:
        raise RuntimeError(f'{source}: expected one matching anchor, found {count}; no files changed')
    return s.replace(old, new, 1)


def mutate_catalog(s: str) -> str:
    s = replace_once(s, '    title: "Kitchen & dining",\n    items: [\n', '''    title: "Kitchen & dining",\n    items: [\n      "Toaster",\n      "Blender",\n      "Ice maker",\n      "Dishware & utensils",\n''', 'lib/property/catalog.ts')
    s = replace_once(s, '    title: "Comfort & entertainment",\n    items: [\n', '''    title: "Comfort & entertainment",\n    items: [\n      "Hair dryer",\n      "Iron",\n      "Linens provided",\n      "Towels provided",\n      "Shampoo",\n      "Body wash",\n      "Ceiling fan",\n''', 'lib/property/catalog.ts')
    s = replace_once(s, '    title: "Outdoor & location",\n    items: [\n', '''    title: "Outdoor & location",\n    items: [\n      "Outdoor dining area",\n      "Fenced yard",\n      "Private entrance",\n''', 'lib/property/catalog.ts')
    s = replace_once(s, '    title: "Parking & access",\n    items: [\n', '''    title: "Safety & family",\n    items: [\n      "Smoke alarm",\n      "Carbon monoxide alarm",\n      "Fire extinguisher",\n      "First aid kit",\n      "High chair",\n      "Travel crib",\n    ],\n  },\n  {\n    title: "Parking & access",\n    items: [\n''', 'lib/property/catalog.ts')
    s = replace_once(s, '  "Cabin",\n  "House",', '  "Cabin",\n  "Treehouse",\n  "House",', 'lib/property/catalog.ts')
    return s


def mutate_actions(s: str) -> str:
    marker = 'export async function savePropertyListing(\n'
    addition = '''// Copy only reusable setup into a NEW draft. The authenticated RPC verifies\n// source ownership and deliberately excludes photos, location, taxes, calendars,\n// reservations, payment settings and previous booking IDs.\nexport async function duplicatePropertySetup(formData: FormData) {\n  const sourcePropertyId = compact(formData.get("sourcePropertyId"), 100).trim();\n  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(sourcePropertyId)) {\n    redirect("/host/properties?copy_error=invalid-property");\n  }\n\n  const supabase = await requireHostSession();\n  const { data, error } = await supabase.rpc("duplicate_property_setup", {\n    source_property_id: sourcePropertyId,\n  });\n  if (error) {\n    console.error("[duplicatePropertySetup] RPC failed", {\n      code: error.code,\n      message: error.message,\n    });\n    redirect(`/host/properties?copy_error=${encodeURIComponent(\n      "Couldn't copy this listing. No existing property was changed."\n    )}`);\n  }\n\n  const row = Array.isArray(data) ? data[0] : data;\n  if (!row?.slug) redirect("/host/properties?copy_error=copy-failed");\n  revalidatePath("/host");\n  revalidatePath("/host/properties");\n  revalidatePath("/admin/properties");\n  redirect(`/host/properties/${encodeURIComponent(row.slug)}?copied=1`);\n}\n\n'''
    return replace_once(s, marker, addition + marker, 'app/host/properties/actions.ts')


def mutate_properties(s: str) -> str:
    s = replace_once(s, '''  createPropertyFromOnboarding,\n  setPropertyMarketplaceVisibility,''', '''  createPropertyFromOnboarding,\n  duplicatePropertySetup,\n  setPropertyMarketplaceVisibility,''', 'app/host/properties/page.tsx')
    s = replace_once(s, '''    marketplace_error?: string;\n''', '''    marketplace_error?: string;\n    copy_error?: string;\n''', 'app/host/properties/page.tsx')
    s = replace_once(s, '''      {query.marketplace === "disabled" ? (''', '''      {query.copy_error ? (\n        <div className={`admin-message error ${styles.notice}`}>\n          Could not copy that property. Nothing was changed on your existing listings.\n        </div>\n      ) : null}\n\n      {query.marketplace === "disabled" ? (''', 'app/host/properties/page.tsx')
    # Insert next to the existing Edit/Finish button, not replacing visibility controls.
    s = replace_once(s, '''                    <Link\n                      className={styles.edit}\n                      href={`/host/properties/${property.slug}`}\n                    >''', '''                    <form action={duplicatePropertySetup}>\n                      <input type="hidden" name="sourcePropertyId" value={property.id} />\n                      <button\n                        type="submit"\n                        className={styles.edit}\n                        title="Copy listing details, amenities, house rules and base rates into a new draft. Photos, address, taxes, calendars and bookings stay separate."\n                      >\n                        Copy setup\n                      </button>\n                    </form>\n                    <Link\n                      className={styles.edit}\n                      href={`/host/properties/${property.slug}`}\n                    >''', 'app/host/properties/page.tsx')
    s = replace_once(s, '''            Manage your listings and control which published properties are\n            currently visible in the Find A Place marketplace.''', '''            Manage your listings and control which published properties are\n            currently visible in the Find A Place marketplace.''', 'app/host/properties/page.tsx')
    s = replace_once(s, '''        <div className="property-toolbar-actions">''', '''        <div className="property-toolbar-actions">''', 'app/host/properties/page.tsx')
    return s


def mutate_rates(s: str) -> str:
    return replace_once(s,
      'Use these for holidays, events, seasons or an advertised special. Higher priority wins when date ranges overlap.',
      'For holiday premiums, enter a higher nightly rate for the exact dates (e.g. Christmas week) and leave the guest-facing special checkbox off unless it is a promotion. Higher priority wins when dates overlap. Existing bookings are never repriced.',
      'app/host/rates/[slug]/page.tsx')

CHANGES = {
    'lib/property/catalog.ts': mutate_catalog,
    'app/host/properties/actions.ts': mutate_actions,
    'app/host/properties/page.tsx': mutate_properties,
    'app/host/rates/[slug]/page.tsx': mutate_rates,
}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--dry-run', action='store_true', help='Check all anchors and report changes, do not write')
    args = parser.parse_args()
    if not (ROOT / 'package.json').exists() or not (ROOT / 'lib/property/catalog.ts').exists():
        raise RuntimeError('Run from the Find-A-Place-Booking repository root')
    if (ROOT / MIGRATION).exists():
        raise RuntimeError(f'Migration already exists: {MIGRATION}. Refusing to overwrite.')
    outputs = {}
    for path, change in CHANGES.items():
        file_path = ROOT / path
        original = file_path.read_text(encoding='utf-8')
        outputs[path] = change(original)
        if outputs[path] == original:
            raise RuntimeError(f'No change detected for {path}')
    migration = (BUNDLE / MIGRATION).read_text(encoding='utf-8')
    if 'create or replace function public.duplicate_property_setup' not in migration:
        raise RuntimeError('Migration missing duplicate function')
    print('Validated anchors for:')
    for key in outputs:
        print('  ', key)
    print('  ', MIGRATION)
    if args.dry_run:
        print('Dry run complete: no changes made.')
        return
    backup = ROOT / ('.fap-host-phase1-backup-' + datetime.datetime.now().strftime('%Y%m%d-%H%M%S'))
    if backup.exists():
        raise RuntimeError('Backup destination exists')
    backup.mkdir()
    try:
        for path in outputs:
            dst = backup / path
            dst.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(ROOT / path, dst)
        for path, data in outputs.items():
            (ROOT / path).write_text(data, encoding='utf-8')
        dst = ROOT / MIGRATION
        dst.parent.mkdir(parents=True, exist_ok=True)
        dst.write_text(migration, encoding='utf-8')
    except Exception:
        for path in outputs:
            b = backup / path
            if b.exists():
                shutil.copy2(b, ROOT / path)
        (ROOT / MIGRATION).unlink(missing_ok=True)
        raise
    print('Overlay installed. Originals backed up at', backup)
    print('NEXT: npm ci && npm run build; review migration, deploy code and apply SQL migration in the proper sequence.')
    print('DO NOT treat the new Copy setup button as active until the migration is deployed.')


if __name__ == '__main__':
    try:
        main()
    except Exception as exc:
        print('Overlay stopped:', exc, file=sys.stderr)
        sys.exit(1)
