"use client";
import React from "react";
import { api } from "./api";
type Form = {
  weeknight: string;
  weekend: string;
  cleaning: string;
  pet: string;
  petCalculation: string;
  extraGuest: string;
  includedGuests: string;
  minimumStay: string;
};
type Bundle = {
  base: {
    weeknight_cents: number | null;
    weekend_cents: number | null;
    included_guests: number | null;
    minimum_stay_nights: number;
  };
  fees: { fee_type: string; amount_cents: number; calculation: string }[];
};
export function Rates({
  token,
  organizationId,
}: {
  token: string;
  organizationId: string;
}) {
  const [retry, setRetry] = React.useState(0);
  const [units, setUnits] = React.useState<{ id: string; name: string }[]>([]),
    [unit, setUnit] = React.useState(""),
    [form, setForm] = React.useState<Form | null>(null),
    [error, setError] = React.useState(""),
    [notice, setNotice] = React.useState(""),
    [busy, setBusy] = React.useState(false);
  React.useEffect(() => {
    void api<{ units: { id: string; name: string }[] }>(
      "/api/mobile/v1/host/blocks",
      token,
      "GET",
      undefined,
      organizationId,
    )
      .then((d) => {
        setUnits(d.units);
        setUnit(d.units[0]?.id || "");
      })
      .catch((e) => setError(e.message));
  }, [token, organizationId, retry]);
  React.useEffect(() => {
    if (!unit) return;
    let active = true;
    setBusy(true);
    setForm(null);
    setError("");
    void api<{ pricing: Bundle }>(
      `/api/mobile/v1/host/pricing?unitId=${unit}`,
      token,
      "GET",
      undefined,
      organizationId,
    )
      .then((d) => {
        if (!active) return;
        const p = d.pricing;
        const fee = (type: string) => p.fees.find((f) => f.fee_type === type);
        const dollars = (n: number | null | undefined) =>
          n == null ? "" : String(n / 100);
        setForm({
          weeknight: dollars(p.base.weeknight_cents),
          weekend: dollars(p.base.weekend_cents),
          cleaning: dollars(fee("CLEANING")?.amount_cents),
          pet: dollars(fee("PET")?.amount_cents),
          petCalculation: fee("PET")?.calculation || "PER_NIGHT",
          extraGuest: dollars(fee("EXTRA_GUEST")?.amount_cents),
          includedGuests:
            p.base.included_guests == null
              ? ""
              : String(p.base.included_guests),
          minimumStay: String(p.base.minimum_stay_nights || 1),
        });
      })
      .catch((e) => {
        if (active) setError(e.message);
      })
      .finally(() => {
        if (active) setBusy(false);
      });
    return () => {
      active = false;
    };
  }, [unit, token, organizationId, retry]);
  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!form || busy) return;
    setBusy(true);
    setNotice("");
    setError("");
    try {
      await api(
        "/api/mobile/v1/host/pricing",
        token,
        "POST",
        { unitId: unit, pricing: form },
        organizationId,
      );
      setNotice("Rates saved. Future quotes use these prices.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="stack">
      <h2 className="title">Rates & fees</h2>
      {error ? (
        <p role="alert" className="error">
          {error}
        </p>
      ) : null}
      {notice ? (
        <p role="status" className="panel good">
          {notice}
        </p>
      ) : null}
      <label className="field">
        Property
        <select
          disabled={busy}
          value={unit}
          onChange={(e) => {
            setUnit(e.target.value);
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
      {form ? (
        <form className="panel stack" onSubmit={save}>
          <div className="grid-2">
            {(
              [
                ["weeknight", "Weeknight ($)"],
                ["weekend", "Weekend ($)"],
                ["cleaning", "Cleaning ($/stay)"],
                ["pet", "Pet fee ($)"],
                ["extraGuest", "Extra guest ($/night)"],
                ["includedGuests", "Included guests (blank = all)"],
                ["minimumStay", "Minimum nights"],
              ] as const
            ).map(([key, label]) => (
              <label key={key} className="field">
                {label}
                <input
                  disabled={busy}
                  type="number"
                  min={
                    key === "includedGuests" || key === "minimumStay" ? 1 : 0
                  }
                  step={
                    key === "includedGuests" || key === "minimumStay"
                      ? 1
                      : "0.01"
                  }
                  value={form[key]}
                  onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                />
              </label>
            ))}
          </div>
          <label className="field">
            Pet fee calculation
            <select
              disabled={busy}
              value={form.petCalculation}
              onChange={(e) =>
                setForm({ ...form, petCalculation: e.target.value })
              }
            >
              <option value="PER_NIGHT">Per pet, per night</option>
              <option value="PER_PET_PER_STAY">Per pet, per stay</option>
              <option value="FLAT_PER_STAY">Flat per stay</option>
            </select>
          </label>
          <button className="button dark" disabled={busy}>
            {busy ? "Saving…" : "Save rates"}
          </button>
          <small className="muted">
            Existing reservations retain their agreed pricing. Seasonal rules
            and promotions continue to apply.
          </small>
        </form>
      ) : (
        <div className="stack">
          <p className="muted">
            {busy ? "Loading rates…" : "Choose a property to manage rates."}
          </p>
          {!busy ? (
            <button
              className="button secondary"
              onClick={() => setRetry((n) => n + 1)}
            >
              Retry rates
            </button>
          ) : null}
        </div>
      )}
    </section>
  );
}
