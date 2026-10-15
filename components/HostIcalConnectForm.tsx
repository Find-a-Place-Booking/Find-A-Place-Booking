"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

import { connectIcalCalendarInline } from "@/app/host/calendar/actions";
import styles from "@/app/host/calendar/calendar.module.css";

type Props = {
  unitId: string;
  month: string;
};

type Feedback = {
  ok: boolean;
  saved: boolean;
  message: string;
};

export function HostIcalConnectForm({ unitId, month }: Props) {
  const router = useRouter();
  const [provider, setProvider] = useState("AIRBNB");
  const [label, setLabel] = useState("");
  const [feedUrl, setFeedUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<Feedback | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;

    setBusy(true);
    setFeedback(null);

    const form = new FormData();
    form.set("unitId", unitId);
    form.set("month", month);
    form.set("provider", provider);
    form.set("label", label);
    form.set("feedUrl", feedUrl);

    try {
      const result = await connectIcalCalendarInline(form);
      setFeedback(result);

      // Even a saved connection whose first sync failed must be shown below.
      // Never invite another submit that could create a duplicate connection.
      if (result.saved) {
        setFeedUrl("");
        setLabel("");
        router.refresh();
      }
    } catch {
      setFeedback({
        ok: false,
        saved: false,
        message:
          "The connection request could not finish. Your details are still here. Check your connection and try again.",
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <form onSubmit={submit} className={styles.connectForm}>
        <label>
          <span>Provider</span>
          <select
            name="provider"
            value={provider}
            disabled={busy}
            onChange={(event) => {
              setProvider(event.target.value);
              setFeedback(null);
            }}
          >
            <option value="AIRBNB">Airbnb</option>
            <option value="VRBO">Vrbo</option>
            <option value="HOSPITABLE">Hospitable</option>
            <option value="GUESTY">Guesty</option>
            <option value="HOSTIFY">Hostify</option>
            <option value="BOOKING_COM">Booking.com</option>
            <option value="LODGIFY">Lodgify</option>
            <option value="OWNEREZ">OwnerRez</option>
            <option value="GOOGLE">Google Calendar</option>
            <option value="OTHER_ICAL">Other iCal / ICS</option>
          </select>
        </label>

        <label>
          <span>Connection label (optional)</span>
          <input
            name="label"
            maxLength={120}
            value={label}
            onChange={(event) => setLabel(event.target.value)}
            placeholder="e.g. Carol's Cozy Cottage - Hospitable"
            autoComplete="off"
            disabled={busy}
          />
        </label>

        <label>
          <span>Private iCal feed URL</span>
          <input
            type="text"
            inputMode="url"
            name="feedUrl"
            required
            value={feedUrl}
            onChange={(event) => setFeedUrl(event.target.value)}
            placeholder="https://…/calendar.ics or webcal://…"
            autoComplete="off"
            disabled={busy}
            aria-describedby="ical-connection-url-help"
          />
        </label>

        <button className="button button-small" type="submit" disabled={busy}>
          {busy ? "Checking calendar and syncing…" : "Test, connect & sync"}
        </button>
      </form>

      <p id="ical-connection-url-help" className={styles.help}>
        For Hospitable, copy the private calendar export link for this exact listing.
        Only booked/blocked dates are imported; prices and fees stay on Find A Place.
      </p>

      {feedback ? (
        <div
          role={feedback.ok ? "status" : "alert"}
          aria-live={feedback.ok ? "polite" : "assertive"}
          className={`${styles.notice} ${feedback.ok ? "" : styles.noticeError}`}
          style={{ marginTop: 12 }}
        >
          <strong>{feedback.ok ? "Calendar connected" : feedback.saved ? "Connection saved; sync needs attention" : "Connection not saved"}</strong>
          <p style={{ marginTop: 5, marginBottom: 0 }}>{feedback.message}</p>
          {feedback.saved ? (
            <p style={{ marginTop: 5, marginBottom: 0 }}>
              See the connection status below. Do not paste the same feed a second time.
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
