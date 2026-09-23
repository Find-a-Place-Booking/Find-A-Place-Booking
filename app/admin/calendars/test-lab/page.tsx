import Link from "next/link";
import { redirect } from "next/navigation";

import { AdminShell } from "@/components/AdminShell";
import { CalendarCopyButton } from "@/components/CalendarCopyButton";
import {
  getAdminContext,
  hasAnyAdminRole,
} from "@/lib/admin/context";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  createTestEvent,
  createTestFeed,
  deleteTestEvent,
  deleteTestFeed,
  updateTestEvent,
  updateTestFeed,
} from "./actions";
import styles from "./test-lab.module.css";

type Feed = {
  id: string;
  token: string;
  provider: string;
  label: string;
  mode: string;
  time_zone: string;
  is_enabled: boolean;
  created_at: string;
};

type Event = {
  id: string;
  feed_id: string;
  uid: string;
  summary: string;
  start_date: string;
  end_date: string;
  event_style: string;
  status: string;
};

const providerLabels: Record<string, string> = {
  AIRBNB: "Airbnb",
  VRBO: "Vrbo",
  BOOKING_COM: "Booking.com",
  RESNEXUS: "ResNexus",
  OWNEREZ: "OwnerRez",
  LODGIFY: "Lodgify",
  GOOGLE: "Google Calendar",
  OTHER_ICAL: "Other iCal / ICS",
};

const providers = Object.keys(providerLabels);

function resultMessage(result?: string, detail?: string) {
  if (detail) return detail;
  const messages: Record<string, string> = {
    "feed-created": "Simulator feed created.",
    "feed-updated": "Simulator feed updated.",
    "feed-deleted": "Simulator feed deleted.",
    "event-created": "Test reservation added.",
    "event-updated": "Test reservation updated.",
    "event-deleted": "Test reservation removed.",
    error: "The requested test-calendar change could not be completed.",
  };
  return result ? messages[result] ?? "Test lab updated." : null;
}

function feedUrl(token: string) {
  const base = (
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.NEXT_PUBLIC_CANONICAL_SITE_URL ||
    "https://findaplacebooking.com"
  ).replace(/\/+$/, "");

  return `${base}/test-ical/${token}.ics`;
}

export default async function IcalTestLabPage({
  searchParams,
}: {
  searchParams: Promise<{ result?: string; detail?: string }>;
}) {
  const [context, params] = await Promise.all([
    getAdminContext(),
    searchParams,
  ]);

  if (
    !hasAnyAdminRole(context, [
      "SUPER_ADMIN",
      "OPERATIONS_ADMIN",
    ])
  ) {
    redirect("/admin/calendars");
  }

  const admin = createAdminClient();
  const [feedResult, eventResult] = await Promise.all([
    admin
      .from("ical_test_feeds")
      .select("id,token,provider,label,mode,time_zone,is_enabled,created_at")
      .order("created_at", { ascending: true }),
    admin
      .from("ical_test_events")
      .select(
        "id,feed_id,uid,summary,start_date,end_date,event_style,status",
      )
      .order("start_date", { ascending: true }),
  ]);

  if (feedResult.error || eventResult.error) {
    throw new Error(
      "Unable to load the iCal Test Lab. Apply the ical_test_lab migration and refresh.",
    );
  }

  const feeds = (feedResult.data ?? []) as Feed[];
  const events = (eventResult.data ?? []) as Event[];
  const message = resultMessage(params.result, params.detail);
  const isError = params.result === "error";

  return (
    <AdminShell
      active="calendars"
      eyebrow="Calendar testing"
      title="iCal Test Lab"
      context={context}
    >
      {message ? (
        <div className={`auth-message ${isError ? "auth-error" : ""}`}>
          {message}
        </div>
      ) : null}

      <section className="panel">
        <div className={styles.pageIntro}>
          <div>
            <p className="eyebrow dark">Synthetic channel feeds</p>
            <h2>Change a fake reservation, then watch Find A Place reconcile it.</h2>
            <p className="muted">
              These are provider-like test calendars for exercising the real
              Airbnb, Vrbo, ResNexus and generic iCal import path without needing
              a live reservation on another platform.
            </p>
          </div>
          <Link
            className="button button-small button-quiet"
            href="/admin/calendars"
          >
            ← Calendar health
          </Link>
        </div>

        <div className={styles.warning}>
          <strong>Use a test property or clearly unused future dates.</strong>
          <span>
            Once a generated URL is connected to a host unit, its synthetic
            events become real EXTERNAL_BLOCK availability on that unit until
            the feed changes, the event is removed or the calendar is
            disconnected.
          </span>
        </div>

        <p className="muted">
          Best first test: create a feed → copy its URL into Host Calendar →
          Test, connect &amp; sync → change the event dates here → press Sync now
          on the host calendar. The imported block should move without creating
          a duplicate.
        </p>
      </section>

      <section className="panel">
        <div className="panel-head">
          <div>
            <p className="eyebrow dark">New simulator</p>
            <h2>Create a provider-like feed</h2>
          </div>
        </div>

        <form action={createTestFeed} className={styles.createFeed}>
          <label>
            <span>Provider style</span>
            <select name="provider" defaultValue="AIRBNB">
              {providers.map((provider) => (
                <option value={provider} key={provider}>
                  {providerLabels[provider]}
                </option>
              ))}
            </select>
          </label>

          <label>
            <span>Label</span>
            <input name="label" maxLength={120} placeholder="Airbnb simulator" />
          </label>

          <label>
            <span>Property timezone</span>
            <input
              name="timeZone"
              defaultValue="America/Chicago"
              maxLength={100}
            />
          </label>

          <button className="button" type="submit">
            Create test feed
          </button>
        </form>
      </section>

      <div className={styles.feedGrid}>
        {feeds.map((feed) => {
          const url = feedUrl(feed.token);
          const feedEvents = events.filter((event) => event.feed_id === feed.id);

          return (
            <section className={styles.feedCard} key={feed.id}>
              <div className={styles.feedHead}>
                <div>
                  <p className="eyebrow dark">
                    {providerLabels[feed.provider] ?? feed.provider}
                  </p>
                  <h2>{feed.label}</h2>
                  <p>
                    {feedEvents.length} synthetic event
                    {feedEvents.length === 1 ? "" : "s"}
                  </p>
                </div>

                <div className={styles.badges}>
                  <span className={styles.badge}>{feed.mode}</span>
                  <span className={styles.badge}>
                    {feed.is_enabled ? "ENABLED" : "DISABLED"}
                  </span>
                </div>
              </div>

              <div className={styles.feedUrl}>
                <code>{url}</code>
                <div className={styles.rowActions}>
                  <CalendarCopyButton value={url} label="Copy feed URL" />
                  <a
                    className="button button-small button-quiet"
                    href={url}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Open raw .ics ↗
                  </a>
                </div>
              </div>

              <form action={updateTestFeed} className={styles.configGrid}>
                <input type="hidden" name="feedId" value={feed.id} />

                <label>
                  <span>Label</span>
                  <input name="label" defaultValue={feed.label} maxLength={120} />
                </label>

                <label>
                  <span>Provider style</span>
                  <select name="provider" defaultValue={feed.provider}>
                    {providers.map((provider) => (
                      <option value={provider} key={provider}>
                        {providerLabels[provider]}
                      </option>
                    ))}
                  </select>
                </label>

                <label>
                  <span>Feed behavior</span>
                  <select name="mode" defaultValue={feed.mode}>
                    <option value="NORMAL">Normal</option>
                    <option value="EMPTY">Empty feed</option>
                    <option value="INVALID">Invalid response</option>
                    <option value="RECURRING_UNSAFE">
                      Unsafe recurring event
                    </option>
                  </select>
                </label>

                <label>
                  <span>Timezone</span>
                  <input
                    name="timeZone"
                    defaultValue={feed.time_zone}
                    maxLength={100}
                  />
                </label>

                <label className={styles.enabled}>
                  <input
                    type="checkbox"
                    name="enabled"
                    defaultChecked={feed.is_enabled}
                  />
                  <span>Feed enabled</span>
                </label>

                <button className="button button-small" type="submit">
                  Save feed
                </button>
              </form>

              <p className={styles.help}>
                Normal returns the events below. Empty returns a valid calendar
                with zero events. Invalid deliberately stops being iCalendar.
                Unsafe recurring returns an RRULE event that the importer should
                reject rather than guess at.
              </p>

              <div className={styles.sectionHead}>
                <div>
                  <h3>Test reservations</h3>
                  <p>
                    Dates are checkout-exclusive, the same as the real
                    availability engine.
                  </p>
                </div>
              </div>

              <div className={styles.events}>
                {feedEvents.map((event) => (
                  <form
                    action={updateTestEvent}
                    className={styles.eventForm}
                    key={event.id}
                  >
                    <input type="hidden" name="eventId" value={event.id} />

                    <label>
                      <span>Label</span>
                      <input
                        name="summary"
                        defaultValue={event.summary}
                        maxLength={180}
                      />
                    </label>

                    <label>
                      <span>Check-in / start</span>
                      <input
                        name="start"
                        type="date"
                        defaultValue={event.start_date}
                        required
                      />
                    </label>

                    <label>
                      <span>Checkout / end</span>
                      <input
                        name="end"
                        type="date"
                        defaultValue={event.end_date}
                        required
                      />
                    </label>

                    <label>
                      <span>Event style</span>
                      <select
                        name="eventStyle"
                        defaultValue={event.event_style}
                      >
                        <option value="ALL_DAY">All-day reservation</option>
                        <option value="TIMED_LOCAL">Timed local event</option>
                      </select>
                    </label>

                    <label>
                      <span>Status</span>
                      <select name="status" defaultValue={event.status}>
                        <option value="CONFIRMED">Confirmed / blocking</option>
                        <option value="CANCELLED">Cancelled</option>
                      </select>
                    </label>

                    <div className={styles.rowActions}>
                      <button className="button button-small" type="submit">
                        Save
                      </button>
                      <button
                        className="button button-small button-quiet"
                        formAction={deleteTestEvent}
                        type="submit"
                      >
                        Delete
                      </button>
                    </div>
                  </form>
                ))}

                {!feedEvents.length ? (
                  <div className={styles.empty}>
                    No synthetic reservations in this feed. A normal sync should
                    see an empty calendar.
                  </div>
                ) : null}
              </div>

              <div className={styles.sectionHead}>
                <div>
                  <h3>Add another reservation</h3>
                  <p>
                    Use overlapping or separated dates to test multiple imported
                    blocks.
                  </p>
                </div>
              </div>

              <form action={createTestEvent} className={styles.addEvent}>
                <input type="hidden" name="feedId" value={feed.id} />

                <label>
                  <span>Label</span>
                  <input
                    name="summary"
                    defaultValue="Test reservation"
                    maxLength={180}
                  />
                </label>

                <label>
                  <span>Start</span>
                  <input name="start" type="date" required />
                </label>

                <label>
                  <span>End</span>
                  <input name="end" type="date" required />
                </label>

                <label>
                  <span>Event style</span>
                  <select name="eventStyle" defaultValue="ALL_DAY">
                    <option value="ALL_DAY">All-day reservation</option>
                    <option value="TIMED_LOCAL">Timed local event</option>
                  </select>
                </label>

                <label>
                  <span>Status</span>
                  <select name="status" defaultValue="CONFIRMED">
                    <option value="CONFIRMED">Confirmed / blocking</option>
                    <option value="CANCELLED">Cancelled</option>
                  </select>
                </label>

                <button className="button button-small" type="submit">
                  Add event
                </button>
              </form>

              <div className={styles.dangerRow}>
                <form action={deleteTestFeed}>
                  <input type="hidden" name="feedId" value={feed.id} />
                  <button
                    className="button button-small button-quiet"
                    type="submit"
                  >
                    Delete simulator
                  </button>
                </form>
              </div>
            </section>
          );
        })}
      </div>

      {!feeds.length ? (
        <section className="panel">
          <div className="panel-empty">
            <strong>No test feeds yet.</strong>
            <span>
              Create one above. It starts with one reservation about 30 days
              out.
            </span>
          </div>
        </section>
      ) : null}
    </AdminShell>
  );
}
