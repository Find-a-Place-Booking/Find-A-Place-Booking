"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

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

function addDays(value: string, days: number) {
  const date = new Date(`${value}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function displayDate(value: string) {
  const date = new Date(`${value}T12:00:00Z`);
  return date.toLocaleDateString("en-US", {
    weekday: "short",
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

function providerTone(provider: string) {
  switch (provider) {
    case "AIRBNB":
      return styles.airbnb;
    case "VRBO":
      return styles.vrbo;
    case "RESNEXUS":
      return styles.resnexus;
    case "THINKRESERVATIONS":
      return styles.think;
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

function connectionMethodLabel(
  kind: CalendarConnectionRecord["connection_kind"],
) {
  if (kind === "PMS_API") return "API";
  if (kind === "BROWSER_WORKER") return "browser sync";
  return "iCal";
}

function blockTone(
  block: AvailabilityBlockRecord,
  connections: Map<string, CalendarConnectionRecord>,
) {
  if (block.block_type === "OWNER_BLOCK") return styles.manual;
  if (block.block_type === "INTERNAL_RESERVATION") return styles.fap;
  if (block.block_type === "INTERNAL_HOLD") return styles.hold;

  const connection = block.connection_id
    ? connections.get(block.connection_id)
    : null;

  return providerTone(connection?.provider || "");
}

function blockLabel(
  block: AvailabilityBlockRecord,
  connections: Map<string, CalendarConnectionRecord>,
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
    ? connections.get(block.connection_id)
    : null;

  return connection
    ? providerLabel(connection.provider)
    : block.label || "External calendar";
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
  const [openDate, setOpenDate] = useState<string | null>(null);
  const [blockStart, setBlockStart] = useState("");
  const [blockEnd, setBlockEnd] = useState("");
  const [label, setLabel] = useState("");

  const connectionById = useMemo(
    () =>
      new Map(
        connections.map((connection) => [connection.id, connection]),
      ),
    [connections],
  );

  const pricingByDate = useMemo(
    () =>
      new Map(pricingDays.map((pricing) => [pricing.stay_date, pricing])),
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

  useEffect(() => {
    if (!openDate) return;

    const oldOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpenDate(null);
    }

    window.addEventListener("keydown", onKeyDown);

    return () => {
      document.body.style.overflow = oldOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [openDate]);

  function openDay(date: string) {
    setOpenDate(date);
    setBlockStart(date);
    setBlockEnd(addDays(date, 1));
    setLabel("");
  }

  const selectedBlocks = openDate
    ? blocksByDate.get(openDate) ?? []
    : [];

  const selectedPricing = openDate
    ? pricingByDate.get(openDate) ?? null
    : null;

  const manualCount = blocks.filter(
    (block) => block.block_type === "OWNER_BLOCK",
  ).length;

  const legendItems = [
    { key: "manual", label: "Manual blocks", tone: styles.manual },
    { key: "fap", label: "Find A Place", tone: styles.fap },
    { key: "hold", label: "Checkout holds", tone: styles.hold },
    ...connections.map((connection) => ({
      key: connection.id,
      label: providerLabel(connection.provider),
      tone: providerTone(connection.provider),
    })),
  ];

  return (
    <>
      <section className={styles.panel}>
        <div className={styles.header}>
          <div>
            <span className={styles.eyebrow}>Availability calendar</span>
            <h2>{monthLabel}</h2>
            <p>{unitLabel}</p>
          </div>

          <div className={styles.headerActions}>
            <Link
              className="button button-small button-quiet"
              href="/host/reservations"
            >
              Reservations
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

        <div className={styles.legendArea}>
          <div className={styles.legendIntro}>
            <strong>Calendar sources</strong>
            <span>
              Click any date to open it, see what is there, or block it.
            </span>
          </div>

          <div className={styles.legend}>
            {legendItems.map((item) => (
              <span key={item.key}>
                <i className={item.tone} />
                {item.label}
              </span>
            ))}
          </div>
        </div>

        <div className={styles.statusBar}>
          <span>
            <strong>{connections.length}</strong> connected source
            {connections.length === 1 ? "" : "s"}
          </span>
          <span>
            <strong>{manualCount}</strong> manual block
            {manualCount === 1 ? "" : "s"} in view
          </span>
          <b>Click a day to manage it</b>
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

            return (
              <button
                className={[
                  styles.day,
                  day.inMonth ? "" : styles.outside,
                  dayBlocks.length > 1 ? styles.conflict : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                type="button"
                key={day.date}
                onClick={() => openDay(day.date)}
                aria-label={`Open ${displayDate(day.date)}`}
              >
                <div className={styles.dayHead}>
                  <strong>{day.dayNumber}</strong>
                  {price ? <span>{price}</span> : null}
                </div>

                {pricing?.special_label ? (
                  <em>{pricing.special_label}</em>
                ) : null}

                {(pricing?.minimum_stay_nights ?? 1) > 1 ? (
                  <small>
                    min {pricing?.minimum_stay_nights} nights
                  </small>
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
                      {blockLabel(block, connectionById)}
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

        <div className={styles.footer}>
          <span>
            Checkout dates are exclusive. A block ending Oct 10 leaves the
            night of Oct 10 open.
          </span>
          <Link href="/host/reservations">
            Manage Find A Place reservations →
          </Link>
        </div>
      </section>

      {openDate ? (
        <div
          className={styles.backdrop}
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setOpenDate(null);
          }}
        >
          <section
            className={styles.drawer}
            role="dialog"
            aria-modal="true"
            aria-labelledby="calendar-day-title"
          >
            <div className={styles.drawerHead}>
              <div>
                <span className={styles.eyebrow}>Calendar day</span>
                <h2 id="calendar-day-title">{displayDate(openDate)}</h2>
                <p>{unitLabel}</p>
              </div>

              <button
                className={styles.close}
                type="button"
                aria-label="Close day"
                onClick={() => setOpenDate(null)}
              >
                ×
              </button>
            </div>

            <div className={styles.dayStats}>
              <div>
                <span>Nightly rate</span>
                <strong>
                  {money(
                    selectedPricing?.nightly_cents,
                    selectedPricing?.currency || "USD",
                  ) || "—"}
                </strong>
              </div>
              <div>
                <span>Minimum stay</span>
                <strong>
                  {selectedPricing?.minimum_stay_nights ?? 1} night
                  {(selectedPricing?.minimum_stay_nights ?? 1) === 1
                    ? ""
                    : "s"}
                </strong>
              </div>
              <div>
                <span>Status</span>
                <strong>
                  {selectedBlocks.length ? "Unavailable" : "Open"}
                </strong>
              </div>
            </div>

            <div className={styles.drawerBody}>
              <section>
                <div className={styles.sectionHead}>
                  <h3>What is on this date</h3>
                  <p>
                    You can see exactly which source is blocking the date.
                  </p>
                </div>

                {selectedBlocks.length ? (
                  <div className={styles.blockList}>
                    {selectedBlocks.map((block) => {
                      const connection = block.connection_id
                        ? connectionById.get(block.connection_id)
                        : null;

                      return (
                        <div className={styles.blockRow} key={block.id}>
                          <i className={blockTone(block, connectionById)} />

                          <div>
                            <strong>
                              {blockLabel(block, connectionById)}
                            </strong>
                            <span>
                              {displayDate(block.start_date)} →{" "}
                              {displayDate(block.end_date)} checkout
                            </span>
                            {block.block_type === "INTERNAL_RESERVATION" &&
                            block.reservation ? (
                              <>
                                <small>
                                  {block.reservation.guest_name} ·{" "}
                                  {block.reservation.confirmation_code} ·{" "}
                                  {block.reservation.guest_count} guest
                                  {block.reservation.guest_count === 1 ? "" : "s"}
                                  {block.reservation.pet_count
                                    ? ` · ${block.reservation.pet_count} pet${block.reservation.pet_count === 1 ? "" : "s"}`
                                    : ""}
                                </small>
                                <small>
                                  {block.reservation.status
                                    .replaceAll("_", " ")
                                    .toLowerCase()} · payment{" "}
                                  {block.reservation.payment_status
                                    .replaceAll("_", " ")
                                    .toLowerCase()}
                                </small>
                                <small>
                                  {block.reservation.guest_email || "No email"} ·{" "}
                                  {block.reservation.guest_phone || "No phone"}
                                </small>
                                <Link href={`/host/reservations/${block.reservation.id}`}>
                                  Open reservation →
                                </Link>
                              </>
                            ) : null}
                            {connection ? (
                              <small>
                                {providerLabel(connection.provider)} ·{" "}
                                {connectionMethodLabel(
                                  connection.connection_kind,
                                )}{" "}
                                ·{" "}
                                {connection.sync_status
                                  .replaceAll("_", " ")
                                  .toLowerCase()}
                              </small>
                            ) : null}
                          </div>

                          {block.block_type === "OWNER_BLOCK" ? (
                            <form action={cancelOwnerBlock}>
                              <input
                                type="hidden"
                                name="unitId"
                                value={unitId}
                              />
                              <input
                                type="hidden"
                                name="month"
                                value={month}
                              />
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
                      );
                    })}
                  </div>
                ) : (
                  <div className={styles.openState}>
                    <strong>This night is open.</strong>
                    <span>
                      No active reservation, synced block, checkout hold, or
                      manual block is on this date.
                    </span>
                  </div>
                )}
              </section>

              <section>
                <div className={styles.sectionHead}>
                  <h3>Block dates / offline booking</h3>
                  <p>
                    The clicked date is already filled in. Adjust the range
                    only if you need more nights.
                  </p>
                </div>

                <form action={createOwnerBlock} className={styles.blockForm}>
                  <input type="hidden" name="unitId" value={unitId} />
                  <input type="hidden" name="month" value={month} />

                  <div className={styles.two}>
                    <label>
                      <span>Start / check-in</span>
                      <input
                        type="date"
                        name="start"
                        value={blockStart}
                        onChange={(event) => {
                          const next = event.target.value;
                          setBlockStart(next);
                          if (next && (!blockEnd || blockEnd <= next)) {
                            setBlockEnd(addDays(next, 1));
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
                        min={
                          blockStart ? addDays(blockStart, 1) : undefined
                        }
                        value={blockEnd}
                        onChange={(event) =>
                          setBlockEnd(event.target.value)
                        }
                        required
                      />
                    </label>
                  </div>

                  <div className={styles.presets}>
                    <button
                      type="button"
                      onClick={() => setLabel("Owner stay")}
                    >
                      Owner stay
                    </button>
                    <button
                      type="button"
                      onClick={() => setLabel("Maintenance")}
                    >
                      Maintenance
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setLabel("Direct / offline booking")
                      }
                    >
                      Direct booking
                    </button>
                    <button
                      type="button"
                      onClick={() => setLabel("Unavailable")}
                    >
                      Other
                    </button>
                  </div>

                  <label>
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
                    className="button"
                    type="submit"
                    disabled={
                      !blockStart ||
                      !blockEnd ||
                      blockEnd <= blockStart
                    }
                  >
                    Block these dates
                  </button>
                </form>

                <div className={styles.offlineNote}>
                  <strong>Direct / offline booking</strong>
                  <span>
                    Use this when a guest booked somewhere else and you only
                    need the dates protected. It blocks availability but does
                    not create a Find A Place payment or guest reservation.
                  </span>
                </div>

                <Link
                  className={`button button-quiet ${styles.reservationLink}`}
                  href="/host/reservations"
                >
                  Open Find A Place reservations
                </Link>
              </section>
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}
