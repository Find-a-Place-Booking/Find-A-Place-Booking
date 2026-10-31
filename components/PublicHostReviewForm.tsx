"use client";

import Script from "next/script";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import styles from "./PublicHostReviews.module.css";

type TurnstileRuntime = {
  render: (element: HTMLElement, options: {
    sitekey: string;
    action: string;
    callback: (token: string) => void;
    "expired-callback": () => void;
    "error-callback": () => void;
  }) => string;
  remove: (widgetId: string) => void;
};

export function PublicHostReviewForm({ hostSlug, hostName, siteKey }: {
  hostSlug: string;
  hostName: string;
  siteKey: string;
}) {
  const container = useRef<HTMLDivElement>(null);
  const widgetId = useRef<string | null>(null);
  const [scriptReady, setScriptReady] = useState(false);
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  const clearToken = useCallback(() => setToken(""), []);
  const receiveToken = useCallback((value: string) => setToken(value), []);

  useEffect(() => {
    const turnstile = window.turnstile as TurnstileRuntime | undefined;
    if (!scriptReady || !container.current || !turnstile || widgetId.current) return;
    widgetId.current = turnstile.render(container.current, {
      sitekey: siteKey,
      action: "host_review",
      callback: receiveToken,
      "expired-callback": clearToken,
      "error-callback": clearToken,
    });
    return () => {
      if (widgetId.current) turnstile.remove(widgetId.current);
      widgetId.current = null;
    };
  }, [scriptReady, siteKey, receiveToken, clearToken]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || notice) return;
    if (!token) { setError("Please complete the security check."); return; }
    const form = event.currentTarget;
    const data = new FormData(form);
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/public/host-reviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          hostSlug,
          name: data.get("name"),
          email: data.get("email"),
          rating: Number(data.get("rating")),
          review: data.get("review"),
          experience: data.get("experience"),
          website: data.get("website"),
          turnstileToken: token,
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) { setError(result.error || "Unable to submit review."); return; }
      setNotice("Thanks. Your review has been submitted for moderation. It will appear after the Find A Place team approves it.");
      form.reset();
    } catch {
      setError("Unable to reach the review service. Check your connection and try again.");
    } finally {
      setBusy(false);
      setToken("");
      // Siteverify tokens are single-use; recreate the challenge for retries.
      const ts = window.turnstile as TurnstileRuntime | undefined;
      if (ts && widgetId.current) ts.remove(widgetId.current);
      widgetId.current = null;
      setScriptReady(false);
      window.setTimeout(() => setScriptReady(true), 50);
    }
  }

  return (
    <form className={styles.form} onSubmit={submit}>
      <h3>Share your experience with {hostName}</h3>
      <p>Already stayed with this host or dealt with them outside Find A Place? You can leave feedback here. A Find A Place booking is not required, but these reviews are not verified bookings.</p>
      <div className={styles.twoCol}>
        <label><span>Your name</span><input name="name" autoComplete="name" maxLength={100} required minLength={2}/></label>
        <label><span>Email (not shown publicly)</span><input name="email" autoComplete="email" type="email" maxLength={254} required/></label>
      </div>
      <div className={styles.twoCol}>
        <label><span>Rating</span><select name="rating" required defaultValue=""><option value="" disabled>Choose a rating</option><option value="5">★★★★★ · Excellent</option><option value="4">★★★★☆ · Good</option><option value="3">★★★☆☆ · Average</option><option value="2">★★☆☆☆ · Poor</option><option value="1">★☆☆☆☆ · Very poor</option></select></label>
        <label><span>Your experience</span><select name="experience" defaultValue="STAYED" required><option value="STAYED">Stayed with this host</option><option value="HOST_INTERACTION">Communicated with this host</option><option value="OTHER">Other direct experience</option></select></label>
      </div>
      <label><span>Your review</span><textarea name="review" rows={4} minLength={20} maxLength={2000} required placeholder="Share the specifics of your real experience, good or bad."/></label>
      <label className={styles.honey} aria-hidden="true">Website<input name="website" tabIndex={-1} autoComplete="off"/></label>
      <Script id="host-review-turnstile-js" src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit" strategy="afterInteractive" onReady={() => setScriptReady(true)} />
      <div ref={container} aria-label="Review security check" />
      <p className={styles.note}>Reviews are moderated for spam and authenticity. Submissions are not labeled verified unless linked to a completed Find A Place reservation. Do not include sensitive personal information.</p>
      {error ? <p className={styles.error} role="alert">{error}</p> : null}
      {notice ? <p className={styles.success} role="status">{notice}</p> : null}
      <button className="button button-small" type="submit" disabled={busy || !siteKey || Boolean(notice)}>{busy ? "Submitting…" : "Submit host review"}</button>
    </form>
  );
}
