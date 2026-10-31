#!/usr/bin/env python3
"""Connect the host-feedback overlay to existing pages without replacing their other code."""
from pathlib import Path
import sys

ROOT = Path(sys.argv[1] if len(sys.argv)>1 else '.').resolve()
updates = {}

def replace_once(path: str, before: str, after: str):
    file = ROOT / path
    text = updates.get(path, file.read_text(encoding='utf-8'))
    if after in text:
        return
    if text.count(before) != 1:
        raise RuntimeError(f"STOPPED: {path} is different from the reviewed source (anchor count {text.count(before)}). No files written.")
    updates[path] = text.replace(before, after, 1)

replace_once('app/hosts/[slug]/page.tsx',
    'import { PublicHostInquiryForm } from "@/components/PublicHostInquiryForm";',
    'import { PublicHostInquiryForm } from "@/components/PublicHostInquiryForm";\nimport { PublicHostCommunityReviews } from "@/components/PublicHostCommunityReviews";')
replace_once('app/hosts/[slug]/page.tsx',
    '        <section\n          className={`shell ${styles.messageSection}`}\n          id="message-host"',
    '        <PublicHostCommunityReviews\n          organizationId={host.organizationId}\n          hostSlug={host.slug}\n          hostName={host.name}\n        />\n\n        <section\n          className={`shell ${styles.messageSection}`}\n          id="message-host"')
replace_once('components/AdminSidebar.tsx',
    '  { label: "Properties", href: "/admin/properties", key: "properties" },',
    '  { label: "Properties", href: "/admin/properties", key: "properties" },\n  { label: "Host reviews", href: "/admin/host-reviews", key: "host-reviews" },')
replace_once('components/AdminMobileNav.tsx',
    '  ["Properties", "/admin/properties", "properties"],',
    '  ["Properties", "/admin/properties", "properties"],\n  ["Host reviews", "/admin/host-reviews", "host-reviews"],')
replace_once('app/host/properties/page.tsx',
    '            Manage your listings and control which published properties are\n            currently visible in the Find A Place marketplace.',
    '            Manage your listings and control which published properties are\n            currently visible in the Find A Place marketplace. Open a draft\n            to finish its setup, then use Publish listing in Marketplace visibility\n            near the bottom of its editor. Eligible listings go live immediately.')
replace_once('app/host/properties/page.tsx',
    '                      Edit property\n                    </Link>',
    '                      {isLive || isPaused ? "Edit property" : "Finish & publish"}\n                    </Link>')
# Every anchor was validated before a single write. No silent partial installs.
for path, text in updates.items():
    (ROOT/path).write_text(text, encoding='utf-8')
    print('Connected', path)
print('Host-feedback overlay connected successfully. Run npm run typecheck and npm run build.')
