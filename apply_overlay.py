#!/usr/bin/env python3
"""Safe, deterministic source patch for Find A Place Booking Oct 14 issues.

Run by a repo coding agent from the repository root; expects current main code.
The deploy itself is separate. Aborts before writing if any patch does not match.
"""
from pathlib import Path
import sys
import hashlib

root = Path(sys.argv[1]).resolve() if len(sys.argv) > 1 else Path.cwd()
repo_files = {}

def patch(path: str, old: str, new: str) -> None:
    dest = root / path
    if path not in repo_files:
        repo_files[path] = dest.read_text(encoding="utf-8")
    current = repo_files[path]
    if new in current:
        return  # Already applied; old may be a substring of new.
    count = current.count(old)
    if count != 1:
        raise RuntimeError(f"Expected one matching anchor in {path}, found {count}. Source changed; review before applying.")
    repo_files[path] = current.replace(old, new, 1)

# 1. Client-side restoration: current email only, no immediate DB writes.
patch("app/host/guest-emails/[slug]/page.tsx",
      'import { DashboardShell } from "@/components/DashboardShell";',
      'import { DashboardShell } from "@/components/DashboardShell";\nimport { GuestEmailTemplateResetButton } from "@/components/GuestEmailTemplateResetButton";')
patch("app/host/guest-emails/[slug]/page.tsx",
      '''        </details>

        <div className={styles.actionRow}>
          <button className="button button-small" type="submit">''',
      '''        </details>

        <GuestEmailTemplateResetButton
          subject={isArrival ? defaultArrivalSubject : defaultPostStaySubject}
          body={isArrival ? defaultArrivalBody : defaultPostStayBody}
          defaultDayOffset={isArrival ? 3 : 1}
        />

        <div className={styles.actionRow}>
          <button className="button button-small" type="submit">''')

# 2. Social links in shared mobile email shell, reusing website source of truth.
patch("lib/notifications/transactional-email.ts",
      'import type { SupabaseClient } from "@supabase/supabase-js";',
      'import type { SupabaseClient } from "@supabase/supabase-js";\n\nimport { FIND_A_PLACE_NETWORK_URL, FIND_A_PLACE_SOCIAL_LINKS } from "@/lib/brand-links";')
patch("lib/notifications/transactional-email.ts",
      '''  const content = styleEmailLinks(input.html);

  return `<!doctype html>''',
      '''  const content = styleEmailLinks(input.html);
  const socialFooter = FIND_A_PLACE_SOCIAL_LINKS.map((social) =>
    `<a href="${escapeHtml(social.href)}" style="color:#315f4b;text-decoration:underline;font-size:12px;display:inline-block;margin:4px 9px" rel="noopener noreferrer">${escapeHtml(social.label)}</a>`,
  ).join(" ");

  return `<!doctype html>''')
patch("lib/notifications/transactional-email.ts",
      '''                  >findaplacebooking.com</a>
                </div>
                <div style="margin-top:8px;font-size:10px;line-height:1.5;color:#929895">''',
      '''                  >findaplacebooking.com</a>
                </div>
                <div style="margin-top:12px;font-size:12px;line-height:1.65">
                  <a href="${homeUrl}/stays" style="color:#315f4b;text-decoration:underline;margin:0 8px">Find a stay</a>
                  <a href="${homeUrl}/trip" style="color:#315f4b;text-decoration:underline;margin:0 8px">Manage a trip</a>
                  <a href="${homeUrl}/help" style="color:#315f4b;text-decoration:underline;margin:0 8px">Get help</a>
                </div>
                <div style="margin-top:12px;font-size:12px;line-height:1.65">
                  ${socialFooter}
                </div>
                <div style="margin-top:10px;font-size:11px;line-height:1.65">
                  <a href="${escapeHtml(FIND_A_PLACE_NETWORK_URL)}" style="color:#315f4b;text-decoration:underline">Explore Find A Place Arkansas &amp; Beyond</a>
                </div>
                <div style="margin-top:8px;font-size:10px;line-height:1.5;color:#929895">''')

# 3. Host onboarding feedback emails also use branded wrapper.
patch("lib/notifications/host-onboarding-feedback.ts",
      'import { escapeHtml } from "@/lib/notifications/transactional-email";',
      'import { brandedEmailHtml, escapeHtml } from "@/lib/notifications/transactional-email";')
patch("lib/notifications/host-onboarding-feedback.ts",
      '''        subject: email.subject,
        html: email.html,
        text: email.text,''',
      '''        subject: email.subject,
        html: brandedEmailHtml({ subject: email.subject, html: email.html }),
        text: email.text,''')

# 4. Hospitable is supported through iCal (not an API key), no migration needed.
patch("app/host/calendar/page.tsx",
      '''                  <option value="HOSTIFY">Hostify</option>
                  <option value="BOOKING_COM">Booking.com</option>''',
      '''                  <option value="HOSTIFY">Hostify</option>
                  <option value="HOSPITABLE">Hospitable</option>
                  <option value="BOOKING_COM">Booking.com</option>''')
patch("app/host/calendar/page.tsx",
      '''              <strong>Hostify:</strong> copy the listing&apos;s iCal export''',
      '''              <strong>Hospitable:</strong> open Properties → your property → Export calendar,
              then copy its Property Reservation iCal link. Select Hospitable above and save with
              Test, connect &amp; sync. In Hospitable, use the corresponding
              property&apos;s Add External iCal section to import Find A Place&apos;s
              outbound calendar link. Do not paste an API key or ordinary website URL.
            </p>

            <p className={styles.help}>
              <strong>Hostify:</strong> copy the listing&apos;s iCal export''')
patch("lib/host/calendar.ts",
      '    HOSTIFY: "Hostify",',
      '    HOSTIFY: "Hostify",\n    HOSPITABLE: "Hospitable",')
patch("lib/calendar/diagnostics.ts",
      '    HOSTIFY: "Hostify",',
      '    HOSTIFY: "Hostify",\n    HOSPITABLE: "Hospitable",')

# 5. Make partially degraded ThinkReservations reservation import impossible
# to confuse with a complete two-way booking integration.
patch("components/CalendarIntegrationPanel.tsx",
      '''              {state.integration.lastError ? (
                <div className={styles.errorBox}>{state.integration.lastError}</div>
              ) : null}''',
      '''              {state.integration.lastError ? (
                <div className={styles.errorBox} role="alert">
                  {state.integration.lastError.includes("RESERVATION_ENRICHMENT_DEGRADED")
                    ? "Partial ThinkReservations sync: availability/blackouts have imported, but the reservation-details API is failing. Do not assume booked stays are mirrored between both systems. Verify existing reservations and resolve the ThinkReservations API response before relying on full synchronization."
                    : state.integration.lastError}
                </div>
              ) : null}''')
patch("components/CalendarIntegrationPanel.tsx",
      '''                The Restricted API Key is encrypted server-side and is never
                displayed again. This connector never calls ThinkReservations
                rate or reservation-write endpoints.''',
      '''                The Restricted API Key is encrypted server-side and is never
                displayed again. This is a read-only availability import:
                Find A Place bookings are not pushed into ThinkReservations.
                The connector does not call rate or reservation-write endpoints.''')

# 6. Explain listing's required availability choice near publication action.
patch("app/host/properties/[slug]/page.tsx",
      '''              <div className="review-readiness-list">
                {blockingIssues.map((issue) => (
                  <span key={issue}>• {issue}</span>
                ))}
              </div>
            </>
          ) : missingCancellation ? (''',
      '''              <div className="review-readiness-list">
                {blockingIssues.map((issue) => (
                  <span key={issue}>• {issue}</span>
                ))}
              </div>
              {blockingIssues.some((issue) => issue.startsWith("Availability setup")) ? (
                <p>
                  Open the property editor and select the correct calendar preference.
                  For Hospitable, choose iCal and connect the property&apos;s reservation
                  feed under Host → Calendar. The feed must pass its first sync before
                  the listing can be published.
                </p>
              ) : null}
            </>
          ) : missingCancellation ? (''')

# 7. Facebook previews: use published source-photo identity, stable crawler-allowed
# URL outside the restricted /api/ path, and one OG image source.
patch("lib/public/listings.ts",
      'import { redirect } from "next/navigation";',
      'import { createHash } from "node:crypto";\nimport { redirect } from "next/navigation";')
patch("lib/public/listings.ts",
      '  images: string[];',
      '  images: string[];\n  socialPhotoRevision: string | null;')
patch("lib/public/listings.ts",
      '  const imagePaths = (row.image_paths ?? []).slice(0, 25);',
      '''  const imagePaths = (row.image_paths ?? []).slice(0, 25);
  // A primary-photo change creates a new URL for social sharing caches.
  // Do not use expiring signed gallery URLs to decide whether photos exist.
  const socialPhotoRevision = imagePaths[0]
    ? createHash("sha256").update(imagePaths[0]).digest("hex").slice(0, 12)
    : null;''')
patch("lib/public/listings.ts",
      '    images,',
      '    images,\n    socialPhotoRevision,')
patch("app/stays/[slug]/page.tsx",
      '''  const socialImage = property.images[0]
    ? absoluteUrl(
        `/api/public/stay-social-image/${encodeURIComponent(
          property.slug,
        )}`,
      )
    : absoluteUrl("/brand/find-a-place-seal.png");''',
      '''  // Image source is versioned by the *stored* primary photo, not a signed
  // gallery URL. The endpoint is public and not blocked by /api/ robots rules.
  const socialImage = property.socialPhotoRevision
    ? absoluteUrl(
        `/stay-preview/${encodeURIComponent(property.slug)}?v=${property.socialPhotoRevision}`,
      )
    : absoluteUrl("/brand/find-a-place-seal.png");''')
patch("lib/seo.ts",
      r'''  "https://findaplacebooking.com"
).replace(/\/+$/, "");''',
      r'''  "https://www.findaplacebooking.com"
)
  .replace(/^https?:\/\/(?:www\.)?findaplacebooking\.com(?=\/|$)/i, "https://www.findaplacebooking.com")
  .replace(/\/+$/, "");''')

# Validate existing action version before ANY writes. This guards against
# accidentally overwriting unrelated fixes added after our source audit.
source_root = Path(__file__).parent
actions_destination = root / "app/host/guest-emails/actions.ts"
actions_bytes = (source_root / "app/host/guest-emails/actions.ts").read_bytes()
if actions_destination.exists():
    current_actions = actions_destination.read_bytes()
    git_blob = b"blob " + str(len(current_actions)).encode() + b"\x00" + current_actions
    expected = "bfd414ac1e08c7e3d4d30d457a30a9d83de930d3"
    if current_actions != actions_bytes and hashlib.sha1(git_blob).hexdigest() != expected:
        raise RuntimeError("Guest email actions.ts changed since review; inspect newer changes before replacing it.")

# Only remove the old file-based metadata image handler when it is exactly
# the inspected version. Next.js otherwise prioritizes this conflicting image.
obsolete = root / "app/stays/[slug]/opengraph-image.tsx"
if obsolete.exists():
    raw = obsolete.read_bytes()
    blob = b"blob " + str(len(raw)).encode() + b"\x00" + raw
    expected_sha = "962cecfbe41b8e5b266da8c5d269bf5d64a5358d"
    if hashlib.sha1(blob).hexdigest() != expected_sha:
        raise RuntimeError("File-based OG handler changed since review; inspect before removing.")

# Validate new-file paths too; avoid partial application if a future repo
# already contains an unrelated implementation of these features.
for newfile in [
    "components/GuestEmailTemplateResetButton.tsx",
    "app/stay-preview/[slug]/route.ts",
    "scripts/check-stay-social-preview.mjs",
]:
    source = source_root / newfile
    destination = root / newfile
    if destination.exists() and destination.read_bytes() != source.read_bytes():
        raise RuntimeError(f"Existing {newfile} differs. Review before modifying the repository.")

# Validate all modified targets before writing any existing file.
for path, content in repo_files.items():
    if not content.strip():
        raise RuntimeError(f"Refusing blank file: {path}")
for path, content in repo_files.items():
    dest = root / path
    dest.write_text(content, encoding="utf-8")

# Add client component, checked action replacement, and source-controlled migration.
for path in ["components/GuestEmailTemplateResetButton.tsx", "app/host/guest-emails/actions.ts", "supabase/migrations/20261013192000_protect_guest_email_rule_identity.sql"]:
    source = source_root / path
    destination = root / path
    destination.parent.mkdir(parents=True, exist_ok=True)
    if destination.exists() and path.endswith(".sql"):
        continue
    destination.write_bytes(source.read_bytes())
# Expose the existing private-storage image proxy at a public, crawler-allowed URL.
preview_source = source_root / "app/stay-preview/[slug]/route.ts"
preview_target = root / "app/stay-preview/[slug]/route.ts"
preview_target.parent.mkdir(parents=True, exist_ok=True)
if preview_target.exists() and preview_target.read_bytes() != preview_source.read_bytes():
    raise RuntimeError("Public stay-preview route changed. Inspect before overwrite.")
preview_target.write_bytes(preview_source.read_bytes())
if obsolete.exists():
    obsolete.unlink()

# Deploy-time check: fetch stay HTML and image as the Facebook crawler.
smoke_source = source_root / "scripts/check-stay-social-preview.mjs"
smoke_target = root / "scripts/check-stay-social-preview.mjs"
smoke_target.parent.mkdir(parents=True, exist_ok=True)
if smoke_target.exists() and smoke_target.read_bytes() != smoke_source.read_bytes():
    raise RuntimeError("Social preview checker changed. Inspect before overwrite.")
smoke_target.write_bytes(smoke_source.read_bytes())
print("Reviewed Oct 14 fix plus Facebook social photo previews applied. Build and deploy.")
