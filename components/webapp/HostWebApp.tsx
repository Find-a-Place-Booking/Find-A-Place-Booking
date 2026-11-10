"use client";
import React from "react";
import Link from "next/link";
import { signOutHost } from "@/app/auth/actions";
import { api, cash, dateLabel, today } from "./api";
import { Calendar } from "./Calendar";
import { Messages } from "./Messages";
import { Rates } from "./Rates";
import { InstallWebApp } from "./InstallWebApp";
export type Reservation = {
  id: string;
  confirmation_code: string;
  guest_name: string;
  check_in: string;
  check_out: string;
  status: string;
  guest_count: number;
  guest_total_cents: number;
};
type Organization = { id: string; name: string; mode: string };
export function HostWebApp({
  organization,
  organizations,
}: {
  organization: Organization;
  organizations: Organization[];
}) {
  const [accessLost, setAccessLost] = React.useState(false);
  const [tab, setTab] = React.useState("home"),
    [thread, setThread] = React.useState<Reservation | null>(null);
  const [bookings, setBookings] = React.useState<Reservation[]>([]),
    [properties, setProperties] = React.useState<
      { id: string; name: string; status: string }[]
    >([]);
  const [busy, setBusy] = React.useState(false),
    [error, setError] = React.useState(""),
    [page, setPage] = React.useState(0),
    [hasMore, setHasMore] = React.useState(false);
  const org = organization.id,
    version = React.useRef(0);
  const lock = React.useCallback(() => {
    version.current++;
    setAccessLost(true);
    setBookings([]);
    setProperties([]);
    setThread(null);
  }, []);
  React.useEffect(() => {
    window.addEventListener("fap-host-access-lost", lock);
    return () => window.removeEventListener("fap-host-access-lost", lock);
  }, [lock]);
  const refresh = React.useCallback(async () => {
    const current = ++version.current;
    setBusy(true);
    setError("");
    try {
      const access = await api<{ access: { allowed: boolean } }>(
        "/api/mobile/v1/host/access",
        undefined,
        "GET",
        undefined,
        org,
      );
      if (!access.access.allowed) {
        lock();
        return;
      }
      const [r, p] = await Promise.all([
        api<{ reservations: Reservation[]; hasMore: boolean }>(
          "/api/mobile/v1/host/reservations",
          undefined,
          "GET",
          undefined,
          org,
        ),
        api<{ properties: { id: string; name: string; status: string }[] }>(
          "/api/mobile/v1/host/properties",
          undefined,
          "GET",
          undefined,
          org,
        ),
      ]);
      if (current !== version.current) return;
      setBookings(r.reservations);
      setHasMore(r.hasMore);
      setPage(0);
      setProperties(p.properties);
    } catch (e) {
      if (current === version.current)
        setError(e instanceof Error ? e.message : "Unable to refresh.");
    } finally {
      if (current === version.current) setBusy(false);
    }
  }, [org, lock]);
  React.useEffect(() => {
    void refresh();
    return () => {
      version.current++;
    };
  }, [refresh]);
  React.useEffect(() => {
    const visible = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    document.addEventListener("visibilitychange", visible);
    return () => document.removeEventListener("visibilitychange", visible);
  }, [refresh]);
  async function more() {
    if (busy || accessLost) return;
    const current = version.current;
    setBusy(true);
    try {
      const d = await api<{ reservations: Reservation[]; hasMore: boolean }>(
        `/api/mobile/v1/host/reservations?page=${page + 1}`,
        undefined,
        "GET",
        undefined,
        org,
      );
      if (current !== version.current) return;
      setBookings((old) => [
        ...old,
        ...d.reservations.filter((r) => !old.some((x) => x.id === r.id)),
      ]);
      setPage((n) => n + 1);
      setHasMore(d.hasMore);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to load stays.");
    } finally {
      setBusy(false);
    }
  }
  if (accessLost)
    return (
      <div className="fap-webapp">
        <main className="shell section stack">
          <h1>Host access needs to be checked</h1>
          <p>
            Your private workspace has been cleared. Sign in again or review
            your app access.
          </p>
          <Link className="button" href="/host/mobile">
            Check host access
          </Link>
        </main>
      </div>
    );
  const upcoming = bookings
    .filter((r) => r.status === "CONFIRMED" && r.check_out >= today())
    .sort((a, b) => a.check_in.localeCompare(b.check_in));
  const mode =
    organization.mode === "PARTNER"
      ? "Verified partner · Free"
      : organization.mode === "TRIAL"
        ? "Free trial"
        : "Host subscription";
  return (
    <div className="fap-webapp">
      <header className="top">
        <div className="shell">
          <span className="eyebrow">Find A Place Host</span>
          <h1>{organization.name}</h1>
          <p>Your stays, guests and calendar in one place.</p>
        </div>
      </header>
      <main className="shell section stack">
        {organizations.length > 1 ? (
          <label className="field">
            Host organization
            <select
              value={org}
              onChange={(e) =>
                window.location.assign(
                  `/host/mobile/workspace?organizationId=${encodeURIComponent(e.target.value)}`,
                )
              }
            >
              {organizations.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <div className="row">
          <span className="chip">{mode}</span>
          <button
            className="button inline secondary"
            disabled={busy}
            onClick={() => void refresh()}
          >
            Refresh
          </button>
        </div>
        {error ? (
          <p role="alert" className="error">
            {error}
          </p>
        ) : null}
        {busy ? (
          <p role="status" className="muted">
            Updating…
          </p>
        ) : null}
        {tab === "home" ? (
          <>
            <div className="grid-2">
              <div className="stat">
                <small>Properties</small>
                <strong>{properties.length}</strong>
              </div>
              <div className="stat">
                <small>Upcoming in recent stays</small>
                <strong>{upcoming.length}</strong>
              </div>
            </div>
            <h2 className="title">Coming up</h2>
            {upcoming.length ? (
              upcoming.slice(0, 6).map((r) => (
                <Booking
                  key={r.id}
                  r={r}
                  onMessage={() => {
                    setThread(r);
                    setTab("messages");
                  }}
                />
              ))
            ) : (
              <p className="panel muted">
                No upcoming stays in recent reservations. Open Stays to load
                older records.
              </p>
            )}
            <InstallWebApp />
          </>
        ) : tab === "stays" ? (
          <>
            <h2 className="title">Reservations</h2>
            {bookings.map((r) => (
              <Booking
                key={r.id}
                r={r}
                onMessage={() => {
                  setThread(r);
                  setTab("messages");
                }}
              />
            ))}
            {hasMore ? (
              <button
                className="button secondary"
                disabled={busy}
                onClick={() => void more()}
              >
                Load more stays
              </button>
            ) : null}
            {!bookings.length && !busy ? (
              <p className="panel muted">No reservations yet.</p>
            ) : null}
          </>
        ) : tab === "calendar" ? (
          <Calendar key={org} token="" organizationId={org} />
        ) : tab === "messages" ? (
          <>
            {thread ? (
              <>
                <button
                  className="button secondary"
                  onClick={() => setThread(null)}
                >
                  ← All conversations
                </button>
                <Messages
                  key={thread.id}
                  token=""
                  organizationId={org}
                  reservation={thread}
                />
              </>
            ) : (
              <>
                <h2 className="title">Guest messages</h2>
                {bookings
                  .filter((r) => ["CONFIRMED", "CANCELLED"].includes(r.status))
                  .map((r) => (
                    <button
                      className="panel conversation"
                      key={r.id}
                      onClick={() => setThread(r)}
                    >
                      <strong>{r.guest_name || "Guest"}</strong>
                      <span className="muted">
                        {r.confirmation_code} · {dateLabel(r.check_in)}
                      </span>
                    </button>
                  ))}
                {hasMore ? (
                  <button
                    className="button secondary"
                    disabled={busy}
                    onClick={() => void more()}
                  >
                    Load more conversations
                  </button>
                ) : null}
              </>
            )}
          </>
        ) : (
          <>
            <Rates key={org} token="" organizationId={org} />
            <section className="panel stack">
              <h2 className="title">Your places</h2>
              {properties.map((p) => (
                <div className="row" key={p.id}>
                  <strong>{p.name}</strong>
                  <span className="chip">{p.status}</span>
                </div>
              ))}
              <Link className="button secondary" href="/host/properties">
                Listings & photos
              </Link>
              <Link className="button secondary" href="/host/payouts">
                Payout account
              </Link>
              <Link className="button ghost" href="/host/mobile">
                App access & billing
              </Link>
            </section>
            <InstallWebApp />
            <form action={signOutHost}>
              <button className="button ghost" type="submit">
                Sign out
              </button>
            </form>
          </>
        )}
      </main>
      <nav className="bottom" aria-label="Host app navigation">
        <div className="bottom-inner">
          {["home", "stays", "calendar", "messages", "account"].map((t) => (
            <button
              key={t}
              aria-current={tab === t ? "page" : undefined}
              onClick={() => {
                setTab(t);
                setError("");
              }}
            >
              {t[0].toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>
      </nav>
    </div>
  );
}
function Booking({ r, onMessage }: { r: Reservation; onMessage: () => void }) {
  return (
    <article className="panel stack">
      <div className="row">
        <strong>{r.guest_name || "Guest"}</strong>
        <span className="chip">{r.status.replaceAll("_", " ")}</span>
      </div>
      <span>
        {dateLabel(r.check_in)} – {dateLabel(r.check_out)}
      </span>
      <small className="muted">
        {r.confirmation_code} · {r.guest_count} guests ·{" "}
        {cash(r.guest_total_cents)} guest total
      </small>
      <button
        className="button secondary"
        disabled={!["CONFIRMED", "CANCELLED"].includes(r.status)}
        onClick={onMessage}
      >
        Messages
      </button>
    </article>
  );
}
