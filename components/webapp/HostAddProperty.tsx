"use client";

import React from "react";
import Link from "next/link";
import { propertyTypes } from "@/lib/property/catalog";
import { api } from "./api";

type CreatedProperty = {
  property: { id: string; slug: string; status: "DRAFT" };
  editUrl: string;
};

export function HostAddProperty({
  organizationId,
  organizationName,
}: {
  organizationId: string;
  organizationName: string;
}) {
  const [name, setName] = React.useState("");
  const [propertyType, setPropertyType] = React.useState("");
  const [publicArea, setPublicArea] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState("");
  const [created, setCreated] = React.useState<CreatedProperty | null>(null);
  const savingRef = React.useRef(false);
  const back = `/host/mobile/workspace?organizationId=${encodeURIComponent(organizationId)}`;

  async function create(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (savingRef.current || created) return;
    savingRef.current = true;
    setSaving(true);
    setError("");
    try {
      const response = await api<CreatedProperty>(
        "/api/mobile/v1/host/properties",
        undefined,
        "POST",
        { name: name.trim(), propertyType, publicArea: publicArea.trim() },
        organizationId,
      );
      // Preserve the saved draft link even if navigation fails or is interrupted.
      setCreated(response);
      window.location.assign(response.editUrl);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Couldn't create the property.");
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  return (
    <>
      <section className="panel stack" aria-labelledby="new-property-heading">
        <div>
          <p className="eyebrow">New listing</p>
          <h2 id="new-property-heading" className="title">Start a property</h2>
          <p className="muted">
            Create a private draft for {organizationName}. Then finish its photos,
            address, amenities, rates, house rules and calendar right on your phone.
          </p>
        </div>
        {created ? (
          <div className="stack" role="status">
            <strong className="good">Draft property created.</strong>
            <Link className="button dark" href={created.editUrl}>
              Continue property setup
            </Link>
            <Link className="button secondary" href={back}>Return to host app</Link>
          </div>
        ) : (
          <form onSubmit={(event) => void create(event)} className="stack" autoComplete="on">
            <div className="field">
              <label htmlFor="mobile-property-name">Property name *</label>
              <input
                id="mobile-property-name"
                name="propertyName"
                required
                maxLength={180}
                placeholder="Buffalo River Treehouse"
                value={name}
                onChange={(event) => setName(event.target.value)}
                disabled={saving}
                autoFocus
              />
            </div>
            <div className="field">
              <label htmlFor="mobile-property-type">Property type</label>
              <select
                id="mobile-property-type"
                name="propertyType"
                value={propertyType}
                onChange={(event) => setPropertyType(event.target.value)}
                disabled={saving}
              >
                <option value="">Select a type (optional)</option>
                {propertyTypes.map((option) => (
                  <option key={option} value={option}>{option}</option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="mobile-property-area">Public area</label>
              <input
                id="mobile-property-area"
                name="publicArea"
                maxLength={180}
                placeholder="St. Joe / Buffalo River, AR"
                value={publicArea}
                onChange={(event) => setPublicArea(event.target.value)}
                disabled={saving}
              />
              <small className="muted">The full street address is entered privately in the next step.</small>
            </div>
            <p className="muted">
              This only creates a draft. Guests cannot see or book it until
              you complete the requirements and publish it.
            </p>
            {error ? (
              <div role="alert" className="error">
                {error}
                {error.includes("saved onboarding details") ? (
                  <p><Link href="/host/properties">Open Full property setup</Link></p>
                ) : null}
              </div>
            ) : null}
            <button className="button dark" type="submit" disabled={saving || !name.trim()}>
              {saving ? "Creating draft…" : "Create draft & continue"}
            </button>
            <Link className="button secondary" href={back}>Cancel</Link>
          </form>
        )}
      </section>
      <section className="panel stack" aria-label="Property setup help">
        <strong>What happens next?</strong>
        <p className="muted">
          The complete property editor opens after you create this draft. You can
          upload photos from your phone, finish property details, connect a
          calendar, configure taxes and payments, and publish when it's ready.
          Existing listings and reservations won't be changed.
        </p>
      </section>
    </>
  );
}
