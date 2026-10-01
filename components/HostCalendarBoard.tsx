"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import {
  cancelOwnerBlock,
  createOwnerBlock,
} from "@/app/host/calendar/actions";
import type {
  AvailabilityBlockRecord,
  CalendarConnectionRecord,
  CalendarDay,
  CalendarPricingDay,
} from "@/lib/host/calendar";

import styles from "./HostCalendarBoard.module.css";

const weekDays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

type Props = {
  unitId: string;
  month: string;
  monthLabel: string;
  unitLabel: string;
  previousMonthHref: string;
  nextMonthHref: string;
  days: CalendarDay[];
  blocks: AvailabilityBlockRecord[];
  connections: CalendarConnectionRecord[];
  pricingDays: CalendarPricingDay[];
};

type SourceDescriptor = {
  key: string;
  label: string;
  detail?: string;
  tone: string;
};

function addDays(value: string, days: number) {
  const date = new Date(`${value}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function displayDate(value: string) {
  const date = new Date(`${value}T12:00:00Z`);
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

function money(cents: number | null | undefined, currency = "USD") {
  if (cents == null) return null;

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: cents % 100 ? 2 : 0,
  }).format(cents / 100);
}

function providerTone(provider: string) {
  switch (provider) {
    case "AIRBNB":
      return styles.airbnb;
    case "VRBO":
      return styles.vrbo;
    case "RESNEXUS":
      return styles.resnexus;
    case "THINKRESERVATIONS":
      return styles.thinkReservations;
    case "GUESTY":
      return styles.guesty;
    case "HOSTIFY":
      return styles.hostify;
    case "BOOKING_COM":
      return styles.booking;
    case "OWNEREZ":
      return styles.ownerRez;
    case "LODGIFY":
      return styles.lodgify;
    case "GOOGLE":
      return styles.google;
    default:
      return styles.external;
  }
}

function providerLabel(provider: string) {
  const labels: Record<string, string> = {
    AIRBNB: "Airbnb",
    VRBO: "Vrbo",
    BOOKING_COM: "Booking.com",
    GOOGLE: "Google Calendar",
    LODGIFY: "Lodgify",
    OWNEREZ: "OwnerRez",
    RESNEXUS: "ResNexus",
    GUESTY: "Guesty",
    HOSTIFY: "Hostify",
    THINKRESERVATIONS: "ThinkReservations",
    OTHER_ICAL: "Other iCal",
  };

  return labels[provider] ?? provider.replaceAll("_", " ");
}

function blockTone(
  block: AvailabilityBlockRecord,
  connectionById: Map<string, CalendarConnectionRecord>,
) {
  if (block.block_type === "OWNER_BLOCK") return styles.manual;
  if (block.block_type === "INTERNAL_RESERVATION") return styles.findAPlace;
  if (block.block_type === "INTERNAL_HOLD") return styles.checkoutHold;

  const connection = block.connection_id
    ? connectionById.get(block.connection_id)
    : null;

  return providerTone(connection?.provider || "");
}

function blockSourceLabel(
  block: AvailabilityBlockRecord,
  connectionById: Map<string, CalendarConnectionRecord>,
) {
  if (block.block_type === "OWNER_BLOCK") {
    return block.label || "Manual block";
  }

  if (block.block_type === "INTERNAL_RESERVATION") {
    return "Find A Place reservation";
  }

  if (block.block_type === "INTERNAL_HOLD") {
    return "Checkout hold";
  }

  const connection = block.connection_id
    ? connectionById.get(block.connection_id)
    : null;

  if (!connection) return block.label || "External calendar";

  const provider = providerLabel(connection.provider);
  const label = block.label?.trim() || connection.label?.trim();

  return label && label !== provider ? `${provider} · ${label}` : provider;
}

function sourceDetail(connection: CalendarConnectionRecord) {
  const kind =
    connection.connection_kind === "PMS_API" ? "API" : "iCal";
  const status =
    connection.sync_status === "HEALTHY"
      ? "synced"
      : connection.sync_status.replaceAll("_", " ").toLowerCase();

  return `${kind} · ${status}`;
}

export function HostCalendarBoard({
  unitId,
  month,
  monthLabel,
  unitLabel,
  previousMonthHref,
  nextMonthHref,
  days,
  blocks,
  connections,
  pricingDays,
}: Props) {
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [rangeAnchor, setRangeAnchor] = useState<string | null>(null);
  const [label, setLabel] = useState("");
  const [focusedDate, setFocusedDate] = useState<string | null>(null);

  const connectionById = useMemo(
    () =>
      new Map(
        connections.map((connection) => [connection.id, connection]),
      ),
    [connections],
  );

  const pricingByDate = useMemo(
    () => new Map(pricingDays.map((day) => [day.stay_date, day])),
    [pricingDays],
  );

  const blocksByDate = useMemo(() => {
    const map = new Map<string, AvailabilityBlockRecord[]>();

    for (const day of days) {
      map.set(
        day.date,
        blocks.filter(
          (block) =>
            block.start_date <= day.date && block.end_date > day.date,
        ),
      );
    }

    return map;
  }, [blocks, days]);

  const ownerBlocks = useMemo(
    () => blocks.filter((block) => block.block_type === "OWNER_BLOCK"),
    [blocks],
  );

  const activeSources = useMemo(() => {
    const sources: SourceDescriptor[] = [];

    if (ownerBlocks.length) {
      sources.push({
        key: "manual",
        label: "Manual blocks",
        detail: `${ownerBlocks.length} on this view`,
        tone: styles.manual,
      });
    }

    if (blocks.some((block) => block.block_type === "INTERNAL_RESERVATION")) {
      sources.push({
        key: "fap",
        label: "Find A Place reservations",
        tone: styles.findAPlace,
      });
    }

    if (blocks.some((block) => block.block_type === "INTERNAL_HOLD")) {
      sources.push({
        key: "holds",
        label: "Checkout holds",
        tone: styles.checkoutHold,
      });
    }

    for (const connection of connections) {
      sources.push({
        key: connection.id,
        label: providerLabel(connection.provider),
        detail: sourceDetail(connection),
        tone: providerTone(connection.provider),
      });
    }

    if (!sources.length) {
      sources.push({
        key: "open",
        label: "No external sources connected",
        detail: "Find A Place availability only",
        tone: styles.neutral,
      });
    }

    return sources;
  }, [blocks, connections, ownerBlocks.length]);

  const focusedBlocks = focusedDate
    ? blocksByDate.get(focusedDate) ?? []
    : [];

  function selectDate(date: string) {
    setFocusedDate(date);

    if (!rangeAnchor) {
      setRangeAnchor(date);
      setStart(date);
      setEnd(addDays(date, 1));
      return;
    }

    const first = date < rangeAnchor ? date : rangeAnchor;
    const last = date < rangeAnchor ? rangeAnchor : date;

    setStart(first);
    setEnd(addDays(last, 1));
    setRangeAnchor(null);
  }

  function clearSelection() {
    setRangeAnchor(null);
    setStart("");
    setEnd("");
    setFocusedDate(null);
  }

  function preset(nextLabel: string) {
    setLabel(nextLabel);
  }

  function selected(date: string) {
    return Boolean(start && end && date >= start && date < end);
  }

  return (
    <section className={styles.panel}>
      <div className={styles.top}>
        <div>
          <span className={styles.eyebrow}>Availability calendar</span>
          <h2>{monthLabel}</h2>
          <p>{unitLabel}</p>
        </div>

        <div className={styles.topActions}>
          <Link
            className="button button-small button-quiet"
            href="/host/reservations"
          >
            Manage reservations
          </Link>

          <div className={styles.monthNav}>
            <Link aria-label="Previous month" href={previousMonthHref}>
              ‹
            </Link>
            <Link aria-label="Next month" href={nextMonthHref}>
              ›
            </Link>
          </div>
        </div>
      </div>

      <div className={styles.sourceBar}>
        <div className={styles.sourceHeading}>
          <strong>What the colors mean</strong>
          <span>
            Each connected source is labeled so it is clear why a date is
            unavailable.
          </span>
        </div>

        <div className={styles.sourceList}>
          {activeSources.map((source) => (
            <div className={styles.sourceItem} key={source.key}>
              <i className={source.tone} />
              <div>
                <strong>{source.label}</strong>
                {source.detail ? <span>{source.detail}</span> : null}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className={styles.controlDeck}>
        <div className={styles.quickBlock}>
          <div className={styles.controlHeading}>
            <div>
              <strong>Block dates</strong>
              <span>
                Click one date for one night, or click the first and last
                night to select a range.
              </span>
            </div>

            {start || end ? (
              <button
                className={styles.clearButton}
                type="button"
                onClick={clearSelection}
              >
                Clear
              </button>
            ) : null}
          </div>

          <form action={createOwnerBlock} className={styles.blockForm}>
            <input type="hidden" name="unitId" value={unitId} />
            <input type="hidden" name="month" value={month} />

            <div className={styles.dateFields}>
              <label>
                <span>Start / check-in</span>
                <input
                  type="date"
                  name="start"
                  value={start}
                  onChange={(event) => {
                    const value = event.target.value;
                    setStart(value);
                    setRangeAnchor(null);
                    if (value && (!end || end <= value)) {
                      setEnd(addDays(value, 1));
                    }
                  }}
                  required
                />
              </label>

              <label>
                <span>End / checkout</span>
                <input
                  type="date"
                  name="end"
                  value={end}
                  min={start ? addDays(start, 1) : undefined}
                  onChange={(event) => {
                    setEnd(event.target.value);
                    setRangeAnchor(null);
                  }}
                  required
                />
              </label>
            </div>

            <div className={styles.presets}>
              <button type="button" onClick={() => preset("Owner stay")}>
                Owner stay
              </button>
              <button type="button" onClick={() => preset("Maintenance")}>
                Maintenance
              </button>
              <button
                type="button"
                onClick={() => preset("Direct / offline booking")}
              >
                Direct booking
              </button>
              <button type="button" onClick={() => preset("Unavailable")}>
                Other
              </button>
            </div>

            <label className={styles.labelField}>
              <span>Reason / label</span>
              <input
                name="label"
                maxLength={180}
                value={label}
                onChange={(event) => setLabel(event.target.value)}
                placeholder="Owner stay, maintenance, direct booking…"
              />
            </label>

            <button
              className="button button-small"
              type="submit"
              disabled={!start || !end || end <= start}
            >
              Block selected dates
            </button>
          </form>

          <p className={styles.directNote}>
            <strong>Direct / offline booking:</strong> this marks the dates
            unavailable on the shared calendar. It does not create a Find A
            Place guest reservation or payment record.
          </p>
        </div>

        <div className={styles.dayInspector}>
          <div className={styles.controlHeading}>
            <div>
              <strong>
                {focusedDate
                  ? displayDate(focusedDate)
                  : "Click any calendar date"}
              </strong>
              <span>
                {focusedDate
                  ? focusedBlocks.length
                    ? `${focusedBlocks.length} availability source${
                        focusedBlocks.length === 1 ? "" : "s"
                      } on this date`
                    : "No blocks or reservations on this date"
                  : "Inspect exactly what is blocking a date."}
              </span>
            </div>
          </div>

          {focusedDate ? (
            focusedBlocks.length ? (
              <div className={styles.inspectorList}>
                {focusedBlocks.map((block) => (
                  <div className={styles.inspectorRow} key={block.id}>
                    <i className={blockTone(block, connectionById)} />
                    <div>
                      <strong>
                        {blockSourceLabel(block, connectionById)}
                      </strong>
                      <span>
                        {displayDate(block.start_date)} →{" "}
                        {displayDate(block.end_date)} checkout
                      </span>
                    </div>

                    {block.block_type === "OWNER_BLOCK" ? (
                      <form action={cancelOwnerBlock}>
                        <input
                          type="hidden"
                          name="unitId"
                          value={unitId}
                        />
                        <input type="hidden" name="month" value={month} />
                        <input
                          type="hidden"
                          name="blockId"
                          value={block.id}
                        />
                        <button
                          className="button button-small button-quiet"
                          type="submit"
                        >
                          Remove
                        </button>
                      </form>
                    ) : null}
                  </div>
                ))}
              </div>
            ) : (
              <div className={styles.openDate}>
                <strong>Open</strong>
                <span>
                  This date has no active calendar block in Find A Place.
                </span>
              </div>
            )
          ) : (
            <div className={styles.inspectorHint}>
              Click a date below to inspect it. Click a second date to finish
              a multi-night selection.
            </div>
          )}
        </div>
      </div>

      <div className={styles.week}>
        {weekDays.map((day) => (
          <span key={day}>{day}</span>
        ))}
      </div>

      <div className={styles.grid}>
        {days.map((day) => {
          const dayBlocks = blocksByDate.get(day.date) ?? [];
          const pricing = pricingByDate.get(day.date);
          const price = money(
            pricing?.nightly_cents,
            pricing?.currency || "USD",
          );
          const isSelected = selected(day.date);
          const isFocused = focusedDate === day.date;

          return (
            <button
              type="button"
              className={[
                styles.day,
                day.inMonth ? "" : styles.outside,
                dayBlocks.length > 1 ? styles.conflict : "",
                isSelected ? styles.selected : "",
                isFocused ? styles.focused : "",
              ]
                .filter(Boolean)
                .join(" ")}
              key={day.date}
              onClick={() => selectDate(day.date)}
              aria-pressed={isSelected}
              title={
                dayBlocks.length > 1
                  ? `${dayBlocks.length} availability sources overlap on this date`
                  : "Click to inspect or select this date"
              }
            >
              <div className={styles.dayHead}>
                <b>{day.dayNumber}</b>
                {price ? <span className={styles.price}>{price}</span> : null}
              </div>

              {pricing?.special_label ? (
                <span className={styles.special}>
                  {pricing.special_label}
                </span>
              ) : null}

              {(pricing?.minimum_stay_nights ?? 1) > 1 ? (
                <span className={styles.minStay}>
                  min {pricing?.minimum_stay_nights} nights
                </span>
              ) : null}

              <div className={styles.chips}>
                {dayBlocks.slice(0, 3).map((block) => (
                  <span
                    className={`${styles.chip} ${blockTone(
                      block,
                      connectionById,
                    )}`}
                    key={block.id}
                  >
                    {blockSourceLabel(block, connectionById)}
                  </span>
                ))}

                {dayBlocks.length > 3 ? (
                  <span className={styles.more}>
                    +{dayBlocks.length - 3} more
                  </span>
                ) : null}
              </div>
            </button>
          );
        })}
      </div>

      <div className={styles.bottomBar}>
        <div>
          <strong>
            {rangeAnchor
              ? "Choose the last night"
              : start && end
                ? `${displayDate(start)} → ${displayDate(end)} checkout`
                : "Click the calendar to select dates"}
          </strong>
          <span>
            Checkout dates are exclusive: the checkout date itself is not
            blocked.
          </span>
        </div>

        <Link href="/host/reservations">
          Find A Place reservations →
        </Link>
      </div>

      {ownerBlocks.length ? (
        <details className={styles.manualList}>
          <summary>
            Manual blocks in this calendar view ({ownerBlocks.length})
          </summary>

          <div>
            {ownerBlocks.map((block) => (
              <div className={styles.manualRow} key={block.id}>
                <div>
                  <strong>{block.label || "Manual block"}</strong>
                  <span>
                    {displayDate(block.start_date)} →{" "}
                    {displayDate(block.end_date)} checkout
                  </span>
                </div>

                <form action={cancelOwnerBlock}>
                  <input
                    type="hidden"
                    name="unitId"
                    value={unitId}
                  />
                  <input type="hidden" name="month" value={month} />
                  <input
                    type="hidden"
                    name="blockId"
                    value={block.id}
                  />
                  <button
                    className="button button-small button-quiet"
                    type="submit"
                  >
                    Remove
                  </button>
                </form>
              </div>
            ))}
          </div>
        </details>
      ) : null}
    </section>
  );
}
