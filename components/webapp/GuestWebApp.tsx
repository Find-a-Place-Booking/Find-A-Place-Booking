"use client";
import React from "react";

import { API_BASE, api, dateLabel, today, openWebsite } from "./api";

import { InstallWebApp } from "./InstallWebApp";
import { Trips } from "./Trips";
import { StayMap } from "./StayMap";

export type Stay = {
  lat: number;
  lng: number;
  slug: string;
  name: string;
  location: string;
  city: string;
  region: string;
  type: string;
  sleeps: number;
  bedrooms: number;
  baths: number;
  startingNightlyUsd: number;
  cover: string;
  tags: string[];
  rating: number;
  reviewCount: number;
};
type Detail = Stay & {
  description: string;
  images: string[];
  amenities: string[];
  policies: string[];
  minNights: number;
  hostName: string;
  cancellationPolicy: string | null;
  weekendNightlyUsd: number | null;
};
type Tab = "explore" | "saved" | "trips";
const savedKey = "fap_guest_saved_stays_v1";
export function GuestWebApp() {
  const [map, setMap] = React.useState(false);
  const [tab, setTab] = React.useState<Tab>("explore");
  const [where, setWhere] = React.useState("");
  const [checkIn, setCheckIn] = React.useState("");
  const [checkOut, setCheckOut] = React.useState("");
  const [guests, setGuests] = React.useState(2);
  const [stays, setStays] = React.useState<Stay[]>([]);
  const [savedStays, setSavedStays] = React.useState<Stay[]>([]);
  const viewVersion = React.useRef(0);
  const [detailLoading, setDetailLoading] = React.useState(false);
  React.useEffect(
    () => () => {
      viewVersion.current++;
    },
    [],
  );
  const [detail, setDetail] = React.useState<Detail | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState("");
  const [saved, setSaved] = React.useState<string[]>([]);
  React.useEffect(() => {
    const readSaved = () => {
      try {
        const parsed: unknown = JSON.parse(
          localStorage.getItem(savedKey) || "[]",
        );
        return Array.isArray(parsed)
          ? parsed
              .filter(
                (s): s is string =>
                  typeof s === "string" && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(s),
              )
              .slice(0, 50)
          : [];
      } catch {
        return [];
      }
    };
    setSaved(readSaved());
  }, []);
  const searchVersion = React.useRef(0);
  const refresh = React.useCallback(async () => {
    if (
      (checkIn && !checkOut) ||
      (!checkIn && checkOut) ||
      (checkIn && checkOut && (checkOut <= checkIn || checkIn < today()))
    ) {
      setError("Choose valid check-in and checkout dates.");
      return;
    }
    setLoading(true);
    setError("");
    const version = ++searchVersion.current;
    const qs = new URLSearchParams({ where, guests: String(guests) });
    if (checkIn && checkOut && checkOut > checkIn) {
      qs.set("checkIn", checkIn);
      qs.set("checkOut", checkOut);
    }
    try {
      const payload = await api<{ stays: Stay[] }>(
        `/api/mobile/v1/stays?${qs}`,
      );
      if (version === searchVersion.current) setStays(payload.stays);
    } catch (e) {
      if (version === searchVersion.current)
        setError(e instanceof Error ? e.message : "Could not load stays.");
    } finally {
      if (version === searchVersion.current) setLoading(false);
    }
  }, [where, guests, checkIn, checkOut]);
  React.useEffect(() => {
    const timer = window.setTimeout(() => {
      void refresh();
    }, 400);
    return () => window.clearTimeout(timer);
  }, [refresh]);
  React.useEffect(() => {
    if (tab !== "saved") return;
    if (!saved.length) {
      setSavedStays([]);
      return;
    }
    let cancelled = false;
    const ids = saved.slice(0, 50).join(",");
    void api<{ stays: Stay[] }>(
      `/api/mobile/v1/stays?slugs=${encodeURIComponent(ids)}`,
    )
      .then((data) => {
        if (!cancelled) setSavedStays(data.stays);
      })
      .catch(() => {
        if (!cancelled)
          setError("Could not refresh your saved stays. Try again.");
      });
    return () => {
      cancelled = true;
    };
  }, [tab, saved]);
  const view = async (stay: Stay) => {
    const current = ++viewVersion.current;
    setDetailLoading(true);
    setError("");
    try {
      const d = await api<{ stay: Detail }>(
        `/api/mobile/v1/stays/${encodeURIComponent(stay.slug)}`,
      );
      if (current !== viewVersion.current) return;
      setDetail(d.stay);
      setGuests((n) => Math.min(n, Math.max(1, d.stay.sleeps)));
    } catch (e) {
      if (current === viewVersion.current)
        setError(e instanceof Error ? e.message : "Could not open stay.");
    } finally {
      if (current === viewVersion.current) setDetailLoading(false);
    }
  };
  const toggle = (slug: string) => {
    setSaved((previous) => {
      const next = previous.includes(slug)
        ? previous.filter((s) => s !== slug)
        : [...previous, slug];
      const bounded = next.slice(0, 50);
      try {
        localStorage.setItem(savedKey, JSON.stringify(bounded));
      } catch {}
      return bounded;
    });
  };
  const book = () => {
    if (!detail) return;
    if (!checkIn || !checkOut || checkOut <= checkIn || checkIn < today()) {
      setError("Choose check-in and checkout dates to continue.");
      return;
    }
    const nights = (Date.parse(checkOut) - Date.parse(checkIn)) / 86400000;
    if (nights < detail.minNights) {
      setError(`This stay requires at least ${detail.minNights} nights.`);
      return;
    }
    const q = new URLSearchParams({
      stay: detail.slug,
      checkIn,
      checkOut,
      guests: String(guests),
    });
    void openWebsite(`/checkout?${q}`);
  };
  const items = tab === "saved" ? savedStays : stays;
  return (
    <div className="fap-webapp">
      <header className="top">
        <div className="shell">
          <div className="eyebrow">Find A Place Booking</div>
          <h1>
            {detail
              ? "Your next getaway"
              : tab === "trips"
                ? "Your trip"
                : tab === "saved"
                  ? "Saved places"
                  : "Find somewhere good."}
          </h1>
          <p>
            {detail
              ? "Independent stays. A simpler way to book."
              : tab === "trips"
                ? "Reservations, messages and trip details."
                : "Cabins, cottages, RV sites and more."}
          </p>
        </div>
      </header>
      <main className="shell section">
        {!detail && tab === "explore" ? <InstallWebApp /> : null}
        {error ? (
          <p className="error" role="alert">
            {error}
          </p>
        ) : null}
        {detail ? (
          <div className="stack">
            {detail.images[0] ? (
              <img
                className="card media"
                style={{ height: 230 }}
                src={detail.images[0]}
                alt={detail.name}
              />
            ) : null}
            <div className="row">
              <button
                className="button secondary inline"
                onClick={() => {
                  viewVersion.current++;
                  setDetailLoading(false);
                  setDetail(null);
                  setError("");
                }}
              >
                ← All stays
              </button>
              <button
                className="button secondary inline"
                onClick={() => toggle(detail.slug)}
              >
                {saved.includes(detail.slug) ? "♥ Saved" : "♡ Save"}
              </button>
            </div>
            <div>
              <span className="muted">
                {detail.location} · Sleeps {detail.sleeps}
              </span>
              <h2 className="title">{detail.name}</h2>
              <p style={{ lineHeight: 1.6 }}>{detail.description}</p>
            </div>
            <div className="flex-wrap">
              {detail.amenities.slice(0, 12).map((a) => (
                <span className="chip" key={a}>
                  {a}
                </span>
              ))}
            </div>
            <div className="panel stack">
              <strong>Select dates to book</strong>
              <div className="grid-2">
                <div className="field">
                  <label htmlFor="in">Check-in</label>
                  <input
                    id="in"
                    type="date"
                    min={today()}
                    value={checkIn}
                    onChange={(e) => setCheckIn(e.target.value)}
                  />
                </div>
                <div className="field">
                  <label htmlFor="out">Checkout</label>
                  <input
                    id="out"
                    type="date"
                    min={checkIn || today()}
                    value={checkOut}
                    onChange={(e) => setCheckOut(e.target.value)}
                  />
                </div>
              </div>
              <div className="field">
                <label htmlFor="count">Guests</label>
                <select
                  id="count"
                  value={guests}
                  onChange={(e) => setGuests(Number(e.target.value))}
                >
                  {Array.from(
                    { length: Math.min(detail.sleeps, 16) },
                    (_, i) => i + 1,
                  ).map((n) => (
                    <option value={n} key={n}>
                      {n} {n === 1 ? "guest" : "guests"}
                    </option>
                  ))}
                </select>
              </div>
              <button className="button" onClick={book}>
                Check price & book securely
              </button>
              <small className="muted">
                Checkout opens our secure booking site. Taxes, fees and
                availability are verified before payment.
              </small>
            </div>
          </div>
        ) : tab === "trips" ? (
          <Trips />
        ) : (
          <div className="stack">
            {tab === "explore" ? (
              <div className="panel stack">
                <div className="field">
                  <label htmlFor="where">City or destination</label>
                  <input
                    id="where"
                    value={where}
                    onChange={(e) => setWhere(e.target.value)}
                    placeholder="Hot Springs, Jasper, lake, cabin…"
                  />
                </div>
                <div className="grid-2">
                  <div className="field">
                    <label htmlFor="ci">Check-in</label>
                    <input
                      id="ci"
                      type="date"
                      min={today()}
                      value={checkIn}
                      onChange={(e) => setCheckIn(e.target.value)}
                    />
                  </div>
                  <div className="field">
                    <label htmlFor="co">Checkout</label>
                    <input
                      id="co"
                      type="date"
                      min={checkIn || today()}
                      value={checkOut}
                      onChange={(e) => setCheckOut(e.target.value)}
                    />
                  </div>
                </div>
                <div className="field">
                  <label htmlFor="g">Guests</label>
                  <select
                    id="g"
                    value={guests}
                    onChange={(e) => setGuests(Number(e.target.value))}
                  >
                    {Array.from({ length: 16 }, (_, i) => i + 1).map((n) => (
                      <option value={n} key={n}>
                        {n} {n === 1 ? "guest" : "guests"}
                      </option>
                    ))}
                  </select>
                </div>
                <button className="button" onClick={() => void refresh()}>
                  Find stays
                </button>
              </div>
            ) : null}
            <div className="row">
              <h2 className="title" style={{ margin: 0 }}>
                {tab === "saved" ? "Your saved stays" : "Places to stay"}
              </h2>
              <span className="muted">{items.length} stays</span>
            </div>
            {loading || detailLoading ? (
              <p className="muted">
                <span className="spinner" /> Loading current stays…
              </p>
            ) : null}
            {items.length === 0 && !loading ? (
              <p className="panel muted">
                {tab === "saved"
                  ? "Tap Save on a property to keep it here."
                  : "No stays found for that search. Try another destination or dates."}
              </p>
            ) : null}
            <button
              className="button secondary"
              onClick={() => setMap((v) => !v)}
            >
              {map ? "Show list" : "Show map"}
            </button>
            {map ? (
              <StayMap stays={items} onSelect={(s) => void view(s)} />
            ) : null}
            {!map
              ? items.map((s) => (
                  <article key={s.slug} className="card">
                    {s.cover ? (
                      <img
                        className="media"
                        src={s.cover}
                        alt={s.name}
                        loading="lazy"
                      />
                    ) : (
                      <div className="placeholder">Find A Place</div>
                    )}
                    <div className="card-body stack" style={{ gap: 8 }}>
                      <div className="row">
                        <span className="muted">
                          {s.location} · {s.type}
                        </span>
                        <button
                          className="button inline secondary"
                          aria-label="Toggle saved"
                          onClick={() => toggle(s.slug)}
                        >
                          {saved.includes(s.slug) ? "♥" : "♡"}
                        </button>
                      </div>
                      <h3>{s.name}</h3>
                      <div className="row">
                        <span className="muted">
                          Sleeps {s.sleeps} · {s.bedrooms} bedrooms
                        </span>
                        <b>From ${s.startingNightlyUsd}/night</b>
                      </div>
                      <button
                        className="button dark"
                        disabled={detailLoading}
                        onClick={() => void view(s)}
                      >
                        See this stay
                      </button>
                    </div>
                  </article>
                ))
              : null}
            <small className="muted">
              Nightly prices are starting rates. Calendar availability is
              rechecked at checkout.
            </small>
          </div>
        )}
      </main>
      <nav className="bottom" aria-label="Main navigation">
        <div className="bottom-inner">
          {(["explore", "saved", "trips"] as const).map((t) => (
            <button
              key={t}
              aria-current={!detail && tab === t ? "page" : undefined}
              onClick={() => {
                setTab(t);
                viewVersion.current++;
                setDetailLoading(false);
                setDetail(null);
                setError("");
              }}
            >
              {t === "explore"
                ? "⌕  Explore"
                : t === "saved"
                  ? "♡  Saved"
                  : "▣  My Trip"}
            </button>
          ))}
        </div>
      </nav>
    </div>
  );
}
