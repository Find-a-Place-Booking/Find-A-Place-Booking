"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import styles from "./GuestPolicyAcceptance.module.css";

type PolicyStatus = {
  ready: boolean; propertyOpened: boolean; platformOpened: boolean; accepted: boolean;
  signatureRequired?: boolean; signatureComplete?: boolean;
  securityDeposit?: { amountCents: number; terms: string } | null;
  propertyPolicies: {
    checkIn: string | null; checkout: string | null;
    cancellationPolicy: string | null; customPolicies: string | null; policies: string[];
  };
  propertyDocument: { id: string; version: number | null; originalName: string | null; url: string | null } | null;
  platform: {
    termsVersion: string; cancellationPolicyVersion: string; privacyVersion: string;
    termsUrl: string; cancellationUrl: string; privacyUrl: string;
  };
};

export function GuestPolicyAcceptance({ reservationId, checkoutToken, onAccepted }: {
  reservationId: string; checkoutToken: string; onAccepted: () => void | Promise<void>;
}) {
  const [status, setStatus] = useState<PolicyStatus | null>(null);
  const [agreed, setAgreed] = useState(false);
  const [typedName, setTypedName] = useState("");
  const [eConsent, setEConsent] = useState(false);
  const [expanded, setExpanded] = useState({ property: false, platform: false });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const completedRef = useRef(false);
  const complete = useCallback(async () => {
    if (completedRef.current) return;
    completedRef.current = true;
    await onAccepted();
  }, [onAccepted]);

  const load = useCallback(async () => {
    const response = await fetch("/api/booking/policies/status", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reservationId, checkoutToken }),
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "Unable to load booking policies.");
    const next = payload as PolicyStatus;
    setStatus(next);
    if (next.ready) await complete();
    return next;
  }, [checkoutToken, complete, reservationId]);
  useEffect(() => { void load().catch(e => setError(e instanceof Error ? e.message : "Unable to load booking policies.")); }, [load]);

  async function markOpened(kind: "property" | "platform") {
    const wasOpened = kind === "property" ? Boolean(status?.propertyOpened) : Boolean(status?.platformOpened);
    setExpanded(v => ({ ...v, [kind]: !v[kind] }));
    if (wasOpened) return;
    setBusy(true); setError(null);
    try {
      const response = await fetch("/api/booking/policies/open", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reservationId, checkoutToken, kind }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Unable to record policy review.");
      await load();
    } catch (e) {
      setExpanded(v => ({ ...v, [kind]: false }));
      setError(e instanceof Error ? e.message : "Unable to record review.");
    } finally { setBusy(false); }
  }

  async function accept() {
    if (!status?.propertyOpened || !status?.platformOpened || !agreed || busy ||
      (status.signatureRequired && (!eConsent || typedName.trim().length < 3))) return;
    setBusy(true); setError(null);
    try {
      const response = await fetch("/api/booking/policies/accept", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reservationId, checkoutToken, typedSignatureName: typedName.trim(), electronicSignatureConsent: eConsent }),
      });
      const payload = await response.json();
      if (!response.ok || !payload.accepted) throw new Error(payload.error || "Unable to accept booking policies.");
      await complete();
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to save agreement."); }
    finally { setBusy(false); }
  }
  if (!status) return <div className={styles.card}><strong>Loading booking policies…</strong>{error ? <p role="alert">{error}</p> : null}</div>;
  const reviewed = status.propertyOpened && status.platformOpened;
  const canSubmit = reviewed && agreed && !busy && (!status.signatureRequired || (eConsent && typedName.trim().length >= 3));

  return <div className={styles.card}>
    <div className={styles.heading}>
      <div><p className="eyebrow dark">Review &amp; agree</p><h2>Know the rules before you pay.</h2></div>
      <span className={styles.status}>Required</span>
    </div>
    <p className={styles.intro}>Review your host's house rules, cancellation terms and rental agreement where one is attached, then Find A Place's booking terms.</p>

    <div className={styles.reviewList}>
      <section className={`${styles.reviewCard} ${status.propertyOpened ? styles.reviewed : ""}`}>
        <button type="button" className={styles.reviewToggle} disabled={busy} aria-expanded={expanded.property} onClick={() => void markOpened("property")}>
          <span className={styles.reviewIcon}>{status.propertyOpened ? "✓" : "1"}</span>
          <span className={styles.reviewCopy}><strong>Host property policies</strong><small>House rules, check-in/out, cancellation and any rental agreement PDF</small></span>
          <span className={styles.reviewState}>{status.propertyOpened ? "Reviewed" : "Review"}</span>
          <span className={styles.chevron}>{expanded.property ? "−" : "+"}</span>
        </button>
        {expanded.property ? <div className={styles.reviewBody}>
          <div className={styles.compactFacts}>
            {status.propertyPolicies.checkIn ? <div><span>Check-in</span><strong>{status.propertyPolicies.checkIn.slice(0,5)}</strong></div> : null}
            {status.propertyPolicies.checkout ? <div><span>Checkout</span><strong>{status.propertyPolicies.checkout.slice(0,5)}</strong></div> : null}
          </div>
          {status.propertyPolicies.policies.length ? <div className={styles.policyBlock}><strong>House rules</strong><ul>{status.propertyPolicies.policies.map(rule => <li key={rule}>{rule}</li>)}</ul></div> : null}
          {status.propertyPolicies.customPolicies ? <div className={styles.policyBlock}><strong>Additional host rules</strong><p>{status.propertyPolicies.customPolicies}</p></div> : null}
          <div className={styles.policyBlock}><strong>Cancellation / refund terms</strong><p>{status.propertyPolicies.cancellationPolicy || "This host has not provided specific cancellation terms. Contact the host before booking."}</p></div>
          {status.propertyDocument?.url ? <a className={styles.documentLink} href={status.propertyDocument.url} target="_blank" rel="noreferrer">Open host rental / policy PDF {status.propertyDocument.originalName ? ` · ${status.propertyDocument.originalName}` : ""}</a> : null}
        </div> : null}
      </section>
      <section className={`${styles.reviewCard} ${status.platformOpened ? styles.reviewed : ""}`}>
        <button type="button" className={styles.reviewToggle} disabled={busy} aria-expanded={expanded.platform} onClick={() => void markOpened("platform")}>
          <span className={styles.reviewIcon}>{status.platformOpened ? "✓" : "2"}</span>
          <span className={styles.reviewCopy}><strong>Find A Place booking terms</strong><small>Marketplace role, guest service fee, payments and changes</small></span>
          <span className={styles.reviewState}>{status.platformOpened ? "Reviewed" : "Review"}</span>
          <span className={styles.chevron}>{expanded.platform ? "−" : "+"}</span>
        </button>
        {expanded.platform ? <div className={styles.reviewBody}>
          <div className={styles.platformSummary}>
            <p>Your reservation is with the host. Find A Place provides booking, payment-routing and messaging tools.</p>
            <p>The host's cancellation rules govern refunds subject to law. Guests pay the disclosed Find A Place service fee on eligible new bookings, and Stripe processes the charge on the host's account.</p>
          </div>
          <div className={styles.links}>
            <a href={status.platform.termsUrl} target="_blank" rel="noreferrer">Full booking terms</a>
            <a href={status.platform.cancellationUrl} target="_blank" rel="noreferrer">Cancellation policy</a>
            <a href={status.platform.privacyUrl} target="_blank" rel="noreferrer">Privacy notice</a>
          </div>
        </div> : null}
      </section>
    </div>

    {status.securityDeposit ? <div className={styles.policyBlock} style={{ marginTop: 16, padding: 12, border: "1px solid var(--line)", borderRadius: 10 }}>
      <strong>Separate refundable deposit: ${(status.securityDeposit.amountCents / 100).toFixed(2)}</strong>
      <p>Paid separately to your host after booking. Not included in this checkout total, tax or Find A Place's guest service fee. Refunds depend on the host's conditions and applicable law.</p>
      {status.securityDeposit.terms ? <p style={{ whiteSpace: "pre-wrap" }}>{status.securityDeposit.terms}</p> : null}
    </div> : null}

    <div className={styles.acceptArea}>
      <div className={styles.reviewProgress}>
        <span>{status.propertyOpened ? "✓" : "○"} Host policies reviewed</span>
        <span>{status.platformOpened ? "✓" : "○"} Find A Place terms reviewed</span>
      </div>
      {status.signatureRequired ? <div className={styles.policyBlock} style={{ display: "grid", gap: 10 }}>
        <strong>Sign the host's rental / policy agreement electronically</strong>
        <p>Opening the host PDF above is part of the review. By typing your legal name you sign the attached PDF version for this reservation. An electronic signature record is kept with your booking.</p>
        <label><span>Full legal name</span><input autoComplete="name" name="rental_signature" type="text" maxLength={120} value={typedName} disabled={busy || !reviewed} onChange={e => setTypedName(e.target.value)} required /></label>
        <label className={styles.agreement}><input type="checkbox" checked={eConsent} disabled={busy || !reviewed} onChange={e => setEConsent(e.target.checked)} /><span>I consent to sign this host agreement electronically, and I intend the typed name above to serve as my signature.</span></label>
      </div> : null}
      <label className={`${styles.agreement} ${reviewed ? "" : styles.agreementDisabled}`}>
        <input type="checkbox" checked={agreed} disabled={!reviewed || busy} onChange={e => setAgreed(e.target.checked)} />
        <span>I reviewed and agree to the host's property policies and Find A Place's booking terms for this reservation.</span>
      </label>
      {error ? <div className={styles.error} role="alert">{error}</div> : null}
      <button type="button" className="button button-full" disabled={!canSubmit} onClick={() => void accept()}>
        {busy ? "Saving agreement…" : status.signatureRequired ? "Sign agreement & continue to payment" : "Agree & continue to payment"}
      </button>
    </div>
  </div>;
}
