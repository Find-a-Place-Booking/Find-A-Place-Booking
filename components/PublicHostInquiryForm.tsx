"use client";

import { FormEvent, useState } from "react";

import styles from "./PublicHostInquiryForm.module.css";

type StayOption = {
  propertyId: string;
  name: string;
};

export function PublicHostInquiryForm({
  hostSlug,
  hostName,
  stays,
}: {
  hostSlug: string;
  hostName: string;
  stays: StayOption[];
}) {
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;

    const target = event.currentTarget;
    const data = new FormData(target);
    const payload = {
      hostSlug,
      propertyId: String(data.get("propertyId") || ""),
      guestName: String(data.get("guestName") || ""),
      guestEmail: String(data.get("guestEmail") || ""),
      message: String(data.get("message") || ""),
      website: String(data.get("website") || ""),
    };

    setBusy(true);
    setNotice(null);
    setError(null);

    const response = await fetch("/api/public/host-inquiries", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const result = await response.json().catch(() => null);
    setBusy(false);

    if (!response.ok) {
      setError(result?.error || "Your message could not be sent.");
      return;
    }

    target.reset();
    setNotice(
      `Message sent to ${hostName}. It will appear in their Find A Place host inbox.`,
    );
  }

  return (
    <form className={styles.form} onSubmit={submit}>
      <div className={styles.twoColumns}>
        <label>
          <span>Your name</span>
          <input
            name="guestName"
            maxLength={120}
            autoComplete="name"
            required
          />
        </label>
        <label>
          <span>Your email</span>
          <input
            name="guestEmail"
            type="email"
            maxLength={320}
            autoComplete="email"
            required
          />
        </label>
      </div>

      <label>
        <span>Stay · optional</span>
        <select name="propertyId" defaultValue="">
          <option value="">General question for {hostName}</option>
          {stays.map((stay) => (
            <option key={stay.propertyId} value={stay.propertyId}>
              {stay.name}
            </option>
          ))}
        </select>
      </label>

      <label>
        <span>Message</span>
        <textarea
          name="message"
          rows={5}
          minLength={10}
          maxLength={3000}
          placeholder="Ask about the stay, location, amenities, or anything you want to know before booking."
          required
        />
      </label>

      <label className={styles.honeypot} aria-hidden="true">
        <span>Website</span>
        <input
          name="website"
          tabIndex={-1}
          autoComplete="off"
        />
      </label>

      {notice ? (
        <div className={styles.success}>{notice}</div>
      ) : null}
      {error ? (
        <div className={styles.error}>{error}</div>
      ) : null}

      <div className={styles.footer}>
        <small>
          Your email is shared with the host only so they can respond. Find A
          Place does not publish it on the host profile.
        </small>
        <button className="button" type="submit" disabled={busy}>
          {busy ? "Sending…" : "Message host"}
        </button>
      </div>
    </form>
  );
}
