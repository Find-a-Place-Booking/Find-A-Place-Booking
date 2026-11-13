#!/usr/bin/env python3
"""Complete FAP category wiring from verified GitHub main Nov 12 snapshot.

Edits only app/stays/page.tsx and components/StayResults.tsx. Uses unique
anchors and protects against overwriting later changes. Does not access live data.
"""
from __future__ import annotations
from pathlib import Path
import hashlib
import sys

EXPECTED = {
    'app/stays/page.tsx': 'bac2d98a23695436f539dfceda6358c4514a3824',
    'components/StayResults.tsx': '44adfcb279435e9d559f30fe68b8b6df76572f1e',
}

def blob_sha(data: bytes) -> str:
    return hashlib.sha1(f'blob {len(data)}\0'.encode()+data).hexdigest()

def replace_once(s: str, before: str, after: str, path: str) -> str:
    n=s.count(before)
    if n!=1:
        raise RuntimeError(f'{path}: expected exactly 1 instance, found {n}: {before[:80]!r}')
    return s.replace(before,after,1)

def patch_stays(s: str) -> str:
    path='app/stays/page.tsx'
    changes=[
       ('  "Luxury stays": "Luxury cabins and premium stays",',
        '  "Luxury stays": "Luxury cabins and premium stays",\n  "Unique stays": "Cabooses, treehouses and other one-of-a-kind stays",'),
       ('  "Under $150": "Stays under $150",',
        '  "Budget Friendly": "Budget-friendly stays under $150",'),
       ('  // Old shared Unique stays URLs keep working, but open the new collection.\n  const requestedFilter = params.filter === "Unique stays" ? "Luxury stays" : params.filter;',
        '  // Old Under $150 links still open the new Budget Friendly collection.\n  const requestedFilter = params.filter === "Under $150" ? "Budget Friendly" : params.filter;'),
    ]
    for a,b in changes:s=replace_once(s,a,b,path)
    return s

def patch_results(s: str) -> str:
    path='components/StayResults.tsx'
    changes=[
      ('import { isLargeGroupStay, isLuxuryStay } from "@/lib/public/discovery-categories";',
       'import { isLargeGroupStay, isLuxuryStay, isUniqueStay } from "@/lib/public/discovery-categories";'),
      ('  "Luxury stays",\n  "Sleeps 8+",',
       '  "Luxury stays",\n  "Unique stays",\n  "Sleeps 8+",'),
      ('  "Under $150",','  "Budget Friendly",'),
      ('.map((filter) => filter === "Unique stays" ? "Luxury stays" : filter)',
       '.map((filter) => filter === "Under $150" ? "Budget Friendly" : filter)'),
      ('        if (filter === "Luxury stays") return isLuxuryStay(property);\n        if (filter === "RV Site")',
       '        if (filter === "Luxury stays") return isLuxuryStay(property);\n        if (filter === "Unique stays") return isUniqueStay(property);\n        if (filter === "RV Site")'),
      ('        if (filter === "Under $150") return property.price < 150;',
       '        if (filter === "Budget Friendly") return property.price < 150;'),
    ]
    for a,b in changes:s=replace_once(s,a,b,path)
    return s

PATCHES={'app/stays/page.tsx':patch_stays,'components/StayResults.tsx':patch_results}

def validate_new(home: str, stays: str, results: str):
    assert 'label: "Unique stays"' in home and 'filter: "Unique stays"' in home
    assert 'label: "Budget Friendly"' in home and 'filter: "Budget Friendly"' in home
    assert '"Unique stays": "Cabooses' in stays and '"Budget Friendly":' in stays
    assert 'params.filter === "Under $150" ? "Budget Friendly"' in stays
    assert 'if (filter === "Unique stays") return isUniqueStay(property)' in results
    assert 'if (filter === "Budget Friendly") return property.price < 150' in results
    assert '.map((filter) => filter === "Under $150" ? "Budget Friendly"' in results
    assert 'filter === "Unique stays" ? "Luxury stays"' not in stays+results


def main():
    root=Path(__file__).resolve().parent
    # The archive's app/page.tsx is already the full updated file.
    home=(root/'app/page.tsx').read_text(encoding='utf-8')
    updated={}
    for rel,fn in PATCHES.items():
        target=root/rel
        if not target.is_file():
            raise RuntimeError(f'Missing {rel}. Extract ZIP over repository root before applying.')
        raw=target.read_bytes()
        current=raw.decode('utf-8')
        if 'Unique stays": "Cabooses' in current or 'if (filter === "Unique stays") return isUniqueStay(property)' in current:
            print(f'ALREADY APPLIED: {rel}')
            continue
        if blob_sha(raw)!=EXPECTED[rel]:
            raise RuntimeError(f'{rel} changed since audit, stopping instead of overwriting it. SHA {blob_sha(raw)}')
        updated[rel]=fn(current)
    # Check all files, including previously patched versions, before writing.
    stays=updated.get('app/stays/page.tsx') or (root/'app/stays/page.tsx').read_text(encoding='utf-8')
    results=updated.get('components/StayResults.tsx') or (root/'components/StayResults.tsx').read_text(encoding='utf-8')
    validate_new(home,stays,results)
    if '--check' in sys.argv:
        print('PASS: source anchors and filter wiring verified; no files changed')
        return
    for rel,content in updated.items():
        (root/rel).write_text(content,encoding='utf-8',newline='\n')
        print('UPDATED:',rel)
    print('DONE: Buffalo (12 mi), Luxury ($300+), Unique structures, Budget Friendly (<$150).')

if __name__=='__main__':
    try:main()
    except Exception as exc:
        print(f'NOT APPLIED: {exc}',file=sys.stderr)
        sys.exit(1)
