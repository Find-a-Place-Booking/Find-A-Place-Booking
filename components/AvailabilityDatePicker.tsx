"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import styles from "./AvailabilityDatePicker.module.css";

type BlockedRange = {
  start: string;
  end: string;
};

type Props = {
  unitId: string;
  minimumStayNights: number;
  checkIn: string;
  checkOut: string;
  onChange: (value: { checkIn: string; checkOut: string }) => void;
};

function isoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function utcDate(value: string) {
  return new Date(`${value}T00:00:00Z`);
}

function addDays(value: string, days: number) {
  const date = utcDate(value);
  date.setUTCDate(date.getUTCDate() + days);
  return isoDate(date);
}

function diffDays(start: string, end: string) {
  return Math.round(
    (utcDate(end).getTime() - utcDate(start).getTime()) / 86_400_000,
  );
}

function monthKey(date: Date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(
    2,
    "0",
  )}`;
}

function monthFrom(value: string) {
  const [year, month] = value.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, 1));
}

function moveMonth(value: string, amount: number) {
  const date = monthFrom(value);
  date.setUTCMonth(date.getUTCMonth() + amount);
  return monthKey(date);
}

function buildMonth(value: string) {
  const first = monthFrom(value);
  const year = first.getUTCFullYear();
  const month = first.getUTCMonth();
  const gridStart = new Date(first);
  gridStart.setUTCDate(gridStart.getUTCDate() - gridStart.getUTCDay());

  const days: Array<{
    date: string;
    day: number;
    inMonth: boolean;
  }> = [];

  for (let index = 0; index < 42; index += 1) {
    const date = new Date(gridStart);
    date.setUTCDate(gridStart.getUTCDate() + index);

    days.push({
      date: isoDate(date),
      day: date.getUTCDate(),
      inMonth:
        date.getUTCFullYear() === year && date.getUTCMonth() === month,
    });
  }

  return {
    label: first.toLocaleDateString("en-US", {
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    }),
    days,
  };
}

function friendly(value: string) {
  if (!value) return "Choose date";

  return utcDate(value).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function AvailabilityDatePicker({
  unitId,
  minimumStayNights,
  checkIn,
  checkOut,
  onChange,
}: Props) {
  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const maximumDate = useMemo(() => addDays(today, 730), [today]);

  const initialMonth = useMemo(
    () => (checkIn ? checkIn.slice(0, 7) : today.slice(0, 7)),
    [checkIn, today],
  );

  const [month, setMonth] = useState(initialMonth);
  const [activeField, setActiveField] = useState<"checkIn" | "checkOut">(
    checkIn && !checkOut ? "checkOut" : "checkIn",
  );
  const [blockedRanges, setBlockedRanges] = useState<BlockedRange[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const calendar = useMemo(() => buildMonth(month), [month]);

  const loadAvailability = useCallback(async () => {
    setLoading(true);
    setLoadError(null);

    try {
      const query = new URLSearchParams({
        unitId,
        from: today,
        to: maximumDate,
      });

      const response = await fetch(
        `/api/booking/availability?${query.toString()}`,
        { cache: "no-store" },
      );

      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(
          payload?.error || "Availability could not be refreshed.",
        );
      }

      setBlockedRanges(payload.blockedRanges ?? []);
    } catch (error) {
      setLoadError(
        error instanceof Error
          ? error.message
          : "Availability could not be refreshed.",
      );
    } finally {
      setLoading(false);
    }
  }, [maximumDate, today, unitId]);

  useEffect(() => {
    loadAvailability();

    function refreshOnFocus() {
      loadAvailability();
    }

    window.addEventListener("focus", refreshOnFocus);
    return () => window.removeEventListener("focus", refreshOnFocus);
  }, [loadAvailability]);

  const blockedNight = useCallback(
    (date: string) =>
      blockedRanges.some(
        (range) => range.start <= date && range.end > date,
      ),
    [blockedRanges],
  );

  const rangeAvailable = useCallback(
    (start: string, end: string) => {
      if (!start || !end || end <= start) return false;

      for (
        let night = start;
        night < end;
        night = addDays(night, 1)
      ) {
        if (blockedNight(night)) return false;
      }

      return true;
    },
    [blockedNight],
  );

  function dayState(date: string) {
    const past = date < today;
    const beyondHorizon = date > maximumDate;

    if (past || beyondHorizon) {
      return {
        disabled: true,
        title: past ? "Past date" : "Date not available yet",
      };
    }

    if (loading) {
      return {
        disabled: true,
        title: "Checking availability",
      };
    }

    if (loadError) {
      return {
        disabled: true,
        title: "Availability could not be verified",
      };
    }

    if (activeField === "checkIn") {
      if (blockedNight(date)) {
        return { disabled: true, title: "Unavailable" };
      }

      return { disabled: false, title: "Available" };
    }

    if (!checkIn) {
      return { disabled: true, title: "Choose check-in first" };
    }

    if (date <= checkIn) {
      return {
        disabled: true,
        title: "Checkout must be after check-in",
      };
    }

    const nights = diffDays(checkIn, date);

    if (nights < Math.max(1, minimumStayNights)) {
      return {
        disabled: true,
        title: `Minimum stay is ${Math.max(
          1,
          minimumStayNights,
        )} night${Math.max(1, minimumStayNights) === 1 ? "" : "s"}`,
      };
    }

    if (!rangeAvailable(checkIn, date)) {
      return { disabled: true, title: "Unavailable" };
    }

    if (blockedNight(date)) {
      return {
        disabled: false,
        title: "Available for checkout only",
      };
    }

    return { disabled: false, title: "Available checkout" };
  }

  function selectDate(date: string) {
    const state = dayState(date);
    if (state.disabled) return;

    if (activeField === "checkIn") {
      const existingCheckoutStillValid =
        checkOut &&
        diffDays(date, checkOut) >= Math.max(1, minimumStayNights) &&
        rangeAvailable(date, checkOut);

      onChange({
        checkIn: date,
        checkOut: existingCheckoutStillValid ? checkOut : "",
      });

      setActiveField("checkOut");

      if (date.slice(0, 7) !== month) {
        setMonth(date.slice(0, 7));
      }

      return;
    }

    onChange({
      checkIn,
      checkOut: date,
    });
  }

  function inSelectedRange(date: string) {
    return Boolean(
      checkIn &&
        checkOut &&
        date >= checkIn &&
        date < checkOut,
    );
  }

  const currentMonth = today.slice(0, 7);
  const maximumMonth = maximumDate.slice(0, 7);

  return (
    <div className={styles.wrap}>
      <div className={styles.fields}>
        <button
          type="button"
          className={`${styles.field} ${
            activeField === "checkIn" ? styles.fieldActive : ""
          }`}
          onClick={() => {
            setActiveField("checkIn");
            if (checkIn) setMonth(checkIn.slice(0, 7));
          }}
        >
          <span>Check in</span>
          <strong>{friendly(checkIn)}</strong>
        </button>

        <button
          type="button"
          className={`${styles.field} ${
            activeField === "checkOut" ? styles.fieldActive : ""
          }`}
          onClick={() => {
            setActiveField("checkOut");
            if (checkOut) {
              setMonth(checkOut.slice(0, 7));
            } else if (checkIn) {
              setMonth(checkIn.slice(0, 7));
            }
          }}
        >
          <span>Check out</span>
          <strong>{friendly(checkOut)}</strong>
        </button>
      </div>

      <div className={styles.calendar}>
        <div className={styles.calendarHead}>
          <button
            type="button"
            aria-label="Previous month"
            disabled={month <= currentMonth}
            onClick={() => setMonth(moveMonth(month, -1))}
          >
            ‹
          </button>

          <strong>{calendar.label}</strong>

          <button
            type="button"
            aria-label="Next month"
            disabled={month >= maximumMonth}
            onClick={() => setMonth(moveMonth(month, 1))}
          >
            ›
          </button>
        </div>

        <div className={styles.week}>
          {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((day) => (
            <span key={day}>{day}</span>
          ))}
        </div>

        <div className={styles.grid}>
          {calendar.days.map((day) => {
            const state = dayState(day.date);
            const selectedCheckIn = day.date === checkIn;
            const selectedCheckOut = day.date === checkOut;
            const selectedRange = inSelectedRange(day.date);
            const unavailable =
              blockedNight(day.date) &&
              !(
                activeField === "checkOut" &&
                checkIn &&
                !state.disabled &&
                day.date > checkIn
              );

            return (
              <button
                type="button"
                key={day.date}
                disabled={state.disabled}
                title={state.title}
                aria-label={`${day.date}: ${state.title}`}
                className={[
                  styles.day,
                  day.inMonth ? "" : styles.outside,
                  unavailable ? styles.unavailable : "",
                  selectedRange ? styles.range : "",
                  selectedCheckIn || selectedCheckOut
                    ? styles.selected
                    : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                onClick={() => selectDate(day.date)}
              >
                <span>{day.day}</span>
              </button>
            );
          })}
        </div>

        <div className={styles.legend}>
          <span>
            <i className={styles.legendUnavailable} />
            Unavailable
          </span>
          <span>
            <i className={styles.legendSelected} />
            Your dates
          </span>
        </div>

        <p className={styles.help}>
          {loading
            ? "Checking current availability…"
            : loadError
              ? loadError
              : activeField === "checkIn"
                ? "Choose an available check-in date."
                : `Choose checkout${
                    minimumStayNights > 1
                      ? ` · minimum ${minimumStayNights} nights`
                      : ""
                  }.`}
        </p>
      </div>
    </div>
  );
}
