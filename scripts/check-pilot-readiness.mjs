import fs from "node:fs";

const checks = [
  ["supabase/migrations/20260919004600_live_safety_hardening.sql", "live_safety_hardening_version"],
  ["supabase/migrations/20260920005000_restore_live_safety_hardening.sql", "pilot_readiness_cleanup_version"],
  ["lib/calendar/diagnostics.ts", "inspectIcalFeed"],
  ["app/host/calendar/page.tsx", "Test connection"],
  ["app/host/reports/page.tsx", "Guest payments"],
  ["app/admin/reports/page.tsx", "Platform financial reporting"],
  ["components/AdminSidebar.tsx", "/admin/taxes"],
  ["components/AdminSidebar.tsx", "/admin/reports"],
];

let failed = false;
for (const [file, needle] of checks) {
  if (!fs.existsSync(file)) {
    console.error(`MISSING ${file}`);
    failed = true;
    continue;
  }
  const content = fs.readFileSync(file, "utf8");
  if (!content.includes(needle)) {
    console.error(`MISSING MARKER ${needle} in ${file}`);
    failed = true;
  } else {
    console.log(`ok ${file} -> ${needle}`);
  }
}

const stalePhrases = [
  ["app/host/reports/page.tsx", "planned for the finished system"],
  ["components/PropertyEditor.tsx", "Booking is not enabled yet"],
  ["app/admin/hosts/[profileId]/page.tsx", "Bookings / payments</span><strong>Not connected"],
  ["components/HostOnboardingWizard.tsx", "Confirmed bookings will later retain"],
  ["app/host/rates/page.tsx", "Processors will receive final line items later"],
];

for (const [file, phrase] of stalePhrases) {
  if (!fs.existsSync(file)) continue;
  const content = fs.readFileSync(file, "utf8");
  if (content.includes(phrase)) {
    console.error(`STALE COPY ${file}: ${phrase}`);
    failed = true;
  }
}

if (failed) process.exit(1);
console.log("Pilot-readiness source checks passed.");
