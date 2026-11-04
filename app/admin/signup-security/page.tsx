import Link from "next/link";

import { AdminShell } from "@/components/AdminShell";
import { getAdminContext, hasAnyAdminRole } from "@/lib/admin/context";
import { createAdminClient } from "@/lib/supabase/admin";
import styles from "./signup-security.module.css";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type ReviewRow = {
  id: string;
  name: string;
  email: string;
  phone: string;
  source: string;
  createdAt: string;
  emailConfirmed: boolean;
  lastSignIn: string | null;
  profileExists: boolean;
  activeOrganizations: number;
  termsRecorded: boolean;
  flags: string[];
};

function formatted(value: string | null | undefined) {
  if (!value) return "Never";
  const stamp = new Date(value);
  if (!Number.isFinite(stamp.getTime())) return "Unknown";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/Chicago",
  }).format(stamp);
}

function isConfirmed(value: string | null | undefined) {
  return Boolean(value && Number.isFinite(Date.parse(value)));
}

function reviewFlags(input: {
  name: string;
  email: string;
  source: string;
  ageMs: number;
  emailConfirmed: boolean;
  phone: string;
  profileExists: boolean;
  activeOrganizations: number;
  termsRecorded: boolean;
}) {
  const flags: string[] = [];
  if (!input.emailConfirmed && input.ageMs > 24 * 60 * 60 * 1000) {
    flags.push("Email unconfirmed for over 24h");
  }
  if (!input.profileExists) flags.push("No profile record");
  if (!input.termsRecorded && input.source === "host") flags.push("No host terms record");
  if (!input.phone.trim()) flags.push("No contact phone");
  if (input.ageMs > 7 * 24 * 60 * 60 * 1000 && input.activeOrganizations === 0) {
    flags.push("No active host organization after 7 days");
  }
  if (/(^|\W)(probe|spambot|fakeaccount)(\W|$)/i.test(`${input.name} ${input.email}`)) {
    flags.push("Account name needs review");
  }
  return flags;
}

export default async function SignupSecurityPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; q?: string }>;
}) {
  const context = await getAdminContext();

  // Check role BEFORE using any service-role credential to read Auth users.
  // No guest or host can request this listing.
  if (!hasAnyAdminRole(context, ["SUPER_ADMIN", "OPERATIONS_ADMIN"])) {
    return (
      <AdminShell active="signup-security" eyebrow="Account safety" title="Signup security" context={context}>
        <section className="panel"><p>This review is restricted to the Super and Operations Admin teams.</p></section>
      </AdminShell>
    );
  }

  const params = await searchParams;
  const view = params.view === "all" || params.view === "confirmed" ? params.view : "attention";
  const query = (params.q || "").trim().toLowerCase().slice(0, 100);
  const admin = createAdminClient();

  // Bounded read; 200 most recently returned Auth users are evaluated.
  // This is a human review aid, not a comprehensive fraud-detection service.
  const usersResult = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
  if (usersResult.error) {
    console.error("[signup security] Auth users read failed", usersResult.error.message);
    return (
      <AdminShell active="signup-security" eyebrow="Account safety" title="Signup security" context={context}>
        <section className="panel" role="alert">
          <h2>Account review is temporarily unavailable</h2>
          <p>Supabase Auth could not return the account list. No account was modified. Please refresh or check the service connection.</p>
        </section>
      </AdminShell>
    );
  }

  const users = (usersResult.data?.users ?? [])
    .slice()
    .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))
    .slice(0, 200);
  const ids = users.map((user) => user.id);

  const [profilesResult, membershipsResult, termsResult, adminsResult] = ids.length
    ? await Promise.all([
        admin.from("profiles").select("id,full_name,email,phone").in("id", ids),
        admin.from("organization_members").select("profile_id,status").in("profile_id", ids),
        admin.from("host_terms_acceptances").select("user_id").in("user_id", ids),
        admin.from("admin_users").select("profile_id").in("profile_id", ids),
      ])
    : [
        { data: [], error: null },
        { data: [], error: null },
        { data: [], error: null },
        { data: [], error: null },
      ];

  const readError = [profilesResult.error, membershipsResult.error, termsResult.error, adminsResult.error]
    .filter(Boolean);
  if (readError.length) {
    console.error("[signup security] account review joins failed", readError.map((error) => error?.message));
    return (
      <AdminShell active="signup-security" eyebrow="Account safety" title="Signup security" context={context}>
        <section className="panel" role="alert">
          <h2>Account review is temporarily unavailable</h2>
          <p>One of the required account tables could not be read. No account was modified.</p>
        </section>
      </AdminShell>
    );
  }

  const profileById = new Map((profilesResult.data ?? []).map((p) => [p.id as string, p]));
  const adminIds = new Set((adminsResult.data ?? []).map((row) => row.profile_id as string));
  const acceptedIds = new Set((termsResult.data ?? []).map((row) => row.user_id as string));
  const orgCounts = new Map<string, number>();
  for (const membership of membershipsResult.data ?? []) {
    if (membership.status !== "ACTIVE") continue;
    const id = membership.profile_id as string;
    orgCounts.set(id, (orgCounts.get(id) ?? 0) + 1);
  }

  const nowMs = Date.now();
  const rows: ReviewRow[] = users
    .filter((user) => !adminIds.has(user.id))
    .map((user) => {
      const profile = profileById.get(user.id);
      const source = typeof user.user_metadata?.signup_source === "string"
        ? user.user_metadata.signup_source
        : "legacy / unspecified";
      const name = String(profile?.full_name || user.user_metadata?.full_name || "Unnamed account").slice(0, 140);
      const email = String(profile?.email || user.email || "No email");
      const phone = String(profile?.phone || user.user_metadata?.phone || "");
      const emailConfirmed = isConfirmed(user.email_confirmed_at);
      const ageMs = Math.max(0, nowMs - Date.parse(user.created_at));
      const activeOrganizations = orgCounts.get(user.id) ?? 0;
      const termsRecorded = acceptedIds.has(user.id);
      return {
        id: user.id,
        name,
        email,
        phone,
        source,
        createdAt: user.created_at,
        emailConfirmed,
        lastSignIn: user.last_sign_in_at || null,
        profileExists: Boolean(profile),
        activeOrganizations,
        termsRecorded,
        flags: reviewFlags({
          name, email, source, ageMs, emailConfirmed, phone,
          profileExists: Boolean(profile), activeOrganizations, termsRecorded,
        }),
      };
    });

  const pending = rows.filter((row) => row.flags.length);
  const unconfirmed = rows.filter((row) => !row.emailConfirmed);
  const filtered = rows.filter((row) => {
    if (view === "attention" && !row.flags.length) return false;
    if (view === "confirmed" && !row.emailConfirmed) return false;
    return !query || `${row.name} ${row.email} ${row.phone}`.toLowerCase().includes(query);
  });

  return (
    <AdminShell active="signup-security" eyebrow="Account safety" title="Signup security" context={context}>
      <section className={`panel ${styles.intro}`}>
        <p className="eyebrow dark">Account review</p>
        <h2>Check new host signups before they become a problem.</h2>
        <p>This screen reads Supabase Auth, profiles, host policy acceptances and organization memberships. A review signal is not proof of fraud. The page cannot suspend or delete accounts, and nothing here changes a host's bookings or permissions.</p>
        <p className={styles.note}>Existing signups without phone numbers are not disabled. Phone and bot-trap checks apply to new host signups after this overlay is deployed.</p>
      </section>

      <div className={`metrics dash-grid ${styles.metrics}`}>
        <div><span>Recent accounts reviewed</span><strong>{rows.length}</strong><small>Non-admin accounts in the current Auth page</small></div>
        <div><span>Needs manual attention</span><strong>{pending.length}</strong><small>Any review signal</small></div>
        <div><span>Email unconfirmed</span><strong>{unconfirmed.length}</strong><small>Includes newly created signups</small></div>
        <div><span>With host organization</span><strong>{rows.filter((row) => row.activeOrganizations > 0).length}</strong><small>At least one active membership</small></div>
      </div>

      <section className="panel">
        <div className="panel-head">
          <div><p className="eyebrow dark">Signup queue</p><h2>Account records</h2></div>
          <span className="status-pill status-muted">{filtered.length} shown</span>
        </div>
        <div className={styles.toolbar}>
          <nav className={styles.filters} aria-label="Account status filter">
            <Link href="/admin/signup-security?view=attention" className={view === "attention" ? styles.selected : ""}>Needs review ({pending.length})</Link>
            <Link href="/admin/signup-security?view=all" className={view === "all" ? styles.selected : ""}>All ({rows.length})</Link>
            <Link href="/admin/signup-security?view=confirmed" className={view === "confirmed" ? styles.selected : ""}>Verified email ({rows.length - unconfirmed.length})</Link>
          </nav>
          <form className={styles.search} method="get" action="/admin/signup-security">
            <input type="hidden" name="view" value={view} />
            <input name="q" defaultValue={params.q || ""} maxLength={100} placeholder="Search email or host name" aria-label="Search reviewed accounts" />
            <button className="button button-small" type="submit">Search</button>
          </form>
        </div>

        {filtered.length ? <div className={styles.accounts}>
          {filtered.map((row) => <article key={row.id} className={styles.account}>
            <div className={styles.identity}>
              <div className={styles.nameLine}>
                <strong>{row.name}</strong>
                <span className={`${styles.status} ${row.flags.length ? styles.needsReview : styles.clear}`}>{row.flags.length ? "Needs review" : "No flags"}</span>
              </div>
              <span>{row.email}</span>
              <small>{row.phone || "No phone on file"} · Registered {formatted(row.createdAt)}</small>
            </div>
            <div className={styles.evidence}>
              <small>Email: <b>{row.emailConfirmed ? "Confirmed" : "Unconfirmed"}</b></small>
              <small>Organization: <b>{row.activeOrganizations ? `${row.activeOrganizations} active` : "None"}</b></small>
              <small>Host agreement: <b>{row.termsRecorded ? "Recorded" : "Not found"}</b></small>
              <small>Last sign-in: <b>{formatted(row.lastSignIn)}</b></small>
              <small>Source: <b>{row.source}</b></small>
            </div>
            <div className={styles.review}>
              {row.flags.length ? <ul>{row.flags.map((flag) => <li key={flag}>{flag}</li>)}</ul> : <p>No automated review signals.</p>}
              {row.profileExists ? <Link href={`/admin/hosts/${row.id}`}>Review host record →</Link> : <span>No profile page available</span>}
            </div>
          </article>)}
        </div> : <div className="panel-empty"><strong>No accounts match this view.</strong><span>Try the All filter or clear the search.</span></div>}

        <p className={styles.footer}>Only the most recent 200 authentication users are checked. Email confirmation and signup data come from Supabase Auth; review signals are advisory, not automatic account decisions. Existing CAPTCHA and admin account permissions remain in place.</p>
      </section>
    </AdminShell>
  );
}
