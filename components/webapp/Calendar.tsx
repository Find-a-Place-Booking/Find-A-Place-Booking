"use client";
import React from "react";
import { api, dateLabel, today } from "./api";
type Unit = { id: string; name: string };
type Block = {
  id: string;
  unit_id: string;
  block_type: string;
  start_date: string;
  end_date: string;
  label: string | null;
};
export function Calendar({
  token,
  organizationId,
}: {
  token: string;
  organizationId: string;
}) {
  const [month, setMonth] = React.useState(today().slice(0, 7)),
    [units, setUnits] = React.useState<Unit[]>([]),
    [unit, setUnit] = React.useState("");
  const [blocks, setBlocks] = React.useState<Block[]>([]),
    [start, setStart] = React.useState(""),
    [end, setEnd] = React.useState(""),
    [label, setLabel] = React.useState("");
  const [busy, setBusy] = React.useState(false),
    [loaded, setLoaded] = React.useState(false),
    [error, setError] = React.useState(""),
    [notice, setNotice] = React.useState(""),
    [remove, setRemove] = React.useState<string | null>(null);
  const version = React.useRef(0),
    mutating = React.useRef(false);
  const load = React.useCallback(async () => {
    const current = ++version.current;
    setBusy(true);
    setLoaded(false);
    setBlocks([]);
    setError("");
    try {
      const query = new URLSearchParams({
        month,
        ...(unit ? { unitId: unit } : {}),
      });
      const d = await api<{
        units: Unit[];
        blocks: Block[];
        selectedUnitId?: string;
      }>(
        `/api/mobile/v1/host/blocks?${query}`,
        token,
        "GET",
        undefined,
        organizationId,
      );
      if (current !== version.current) return false;
      setUnits(d.units);
      setUnit(d.selectedUnitId || d.units[0]?.id || "");
      setBlocks(d.blocks);
      setLoaded(true);
      return true;
    } catch (e) {
      if (current === version.current)
        setError(e instanceof Error ? e.message : "Calendar unavailable.");
      return false;
    } finally {
      if (current === version.current) setBusy(false);
    }
  }, [token, organizationId, month, unit]);
  React.useEffect(() => {
    void load();
    return () => {
      version.current++;
    };
  }, [load]);
  const visible = blocks.filter((b) => b.unit_id === unit),
    first = new Date(month + "-01T12:00:00"),
    count = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate(),
    offset = first.getDay();
  async function mutate(body: unknown) {
    if (mutating.current || !loaded) return;
    mutating.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await api(
        "/api/mobile/v1/host/blocks",
        token,
        "POST",
        body,
        organizationId,
      );
      setRemove(null);
      const refreshed = await load();
      setNotice(
        refreshed
          ? "Calendar updated."
          : "The update was saved, but the calendar could not refresh. Reload it before making another change.",
      );
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Could not confirm the calendar update. Refresh before retrying.",
      );
    } finally {
      mutating.current = false;
      setBusy(false);
    }
  }
  function shift(n: number) {
    const d = new Date(month + "-01T12:00:00Z");
    d.setUTCMonth(d.getUTCMonth() + n);
    setRemove(null);
    setNotice("");
    setMonth(d.toISOString().slice(0, 7));
  }
  return (
    <section className="stack">
      <h2 className="title">Your calendar</h2>
      {error ? (
        <p className="error" role="alert">
          {error}
        </p>
      ) : null}
      {notice ? (
        <p className="panel good" role="status">
          {notice}
        </p>
      ) : null}
      <label className="field">
        Property calendar
        <select
          disabled={busy}
          value={unit}
          onChange={(e) => {
            setUnit(e.target.value);
            setRemove(null);
            setNotice("");
          }}
        >
          {units.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
        </select>
      </label>
      <div className="row">
        <button
          className="button inline secondary"
          aria-label="Previous month"
          disabled={busy}
          onClick={() => shift(-1)}
        >
          ←
        </button>
        <label className="field">
          Month
          <input
            type="month"
            value={month}
            disabled={busy}
            onChange={(e) => {
              if (/^20\d{2}-(0[1-9]|1[0-2])$/.test(e.target.value)) {
                setMonth(e.target.value);
                setRemove(null);
                setNotice("");
              }
            }}
          />
        </label>
        <button
          className="button inline secondary"
          aria-label="Next month"
          disabled={busy}
          onClick={() => shift(1)}
        >
          →
        </button>
      </div>
      {busy ? <p role="status">Updating calendar…</p> : null}
      {loaded && unit ? (
        <div className="panel">
          <div className="month-grid">
            {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
              <small key={d}>{d}</small>
            ))}
            {Array.from({ length: offset }, (_, i) => (
              <span key={`pad${i}`} />
            ))}
            {Array.from({ length: count }, (_, i) => {
              const day = `${month}-${String(i + 1).padStart(2, "0")}`,
                active = visible.filter(
                  (b) => b.start_date <= day && b.end_date > day,
                ),
                owner = active.some((b) => b.block_type === "OWNER_BLOCK");
              return (
                <button
                  key={day}
                  disabled={busy}
                  className={`day ${active.length ? (owner ? "owner" : "booked") : ""}`}
                  aria-label={`${dateLabel(day)}: ${active.length ? (owner ? "owner block" : "unavailable") : "no block"}`}
                  onClick={() => {
                    setStart(day);
                    const d = new Date(day + "T12:00:00Z");
                    d.setUTCDate(d.getUTCDate() + 1);
                    setEnd(d.toISOString().slice(0, 10));
                    setNotice(
                      active.length
                        ? active
                            .map(
                              (b) =>
                                b.label || b.block_type.replaceAll("_", " "),
                            )
                            .join(", ")
                        : "No block on this date.",
                    );
                  }}
                >
                  {i + 1}
                </button>
              );
            })}
          </div>
          <p className="muted">
            Green: no block · Gold: owner block · Rose: booked or externally
            blocked. End dates are checkout dates.
          </p>
        </div>
      ) : !busy ? (
        <div className="panel stack">
          <p>
            Calendar availability has not loaded. No dates are shown as
            available.
          </p>
          <button className="button secondary" onClick={() => void load()}>
            Retry calendar
          </button>
        </div>
      ) : null}
      <form
        className="panel stack"
        onSubmit={(e) => {
          e.preventDefault();
          void mutate({ action: "create", unitId: unit, start, end, label });
        }}
      >
        <h3>Block dates</h3>
        <div className="grid-2">
          <label className="field">
            First night
            <input
              type="date"
              disabled={busy || !loaded}
              required
              value={start}
              onChange={(e) => setStart(e.target.value)}
            />
          </label>
          <label className="field">
            End / checkout
            <input
              type="date"
              disabled={busy || !loaded}
              required
              min={start}
              value={end}
              onChange={(e) => setEnd(e.target.value)}
            />
          </label>
        </div>
        <label className="field">
          Note
          <input
            disabled={busy || !loaded}
            maxLength={180}
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Owner stay, maintenance…"
          />
        </label>
        <button
          className="button dark"
          disabled={busy || !loaded || !unit || !start || !end || end <= start}
        >
          Block these nights
        </button>
        <small className="muted">
          Existing bookings and holds are checked before saving.
        </small>
      </form>
      {loaded ? (
        <>
          <h3>Unavailable dates this month</h3>
          {visible.map((b) => (
            <div className="panel stack" key={b.id}>
              <strong>{b.label || b.block_type.replaceAll("_", " ")}</strong>
              <span>
                {dateLabel(b.start_date)} – {dateLabel(b.end_date)}
              </span>
              {b.block_type === "OWNER_BLOCK" ? (
                remove === b.id ? (
                  <div className="stack">
                    <p>Remove this owner block and reopen these nights?</p>
                    <button
                      className="button"
                      disabled={busy}
                      onClick={() =>
                        void mutate({
                          action: "remove",
                          unitId: unit,
                          blockId: b.id,
                        })
                      }
                    >
                      Confirm removal
                    </button>
                    <button
                      className="button secondary"
                      disabled={busy}
                      onClick={() => setRemove(null)}
                    >
                      Keep block
                    </button>
                  </div>
                ) : (
                  <button
                    className="button secondary"
                    disabled={busy}
                    onClick={() => setRemove(b.id)}
                  >
                    Remove owner block
                  </button>
                )
              ) : (
                <small className="muted">
                  Managed by the reservation or connected calendar.
                </small>
              )}
            </div>
          ))}
          {!visible.length ? (
            <p className="muted">
              No active blocks returned for this calendar this month.
            </p>
          ) : null}
        </>
      ) : null}
    </section>
  );
}
