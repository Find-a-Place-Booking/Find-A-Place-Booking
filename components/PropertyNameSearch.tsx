"use client";

import { track } from "@vercel/analytics";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import styles from "./PropertyNameSearch.module.css";

type Match = {
  slug: string;
  name: string;
  location: string;
};

export function PropertyNameSearch({
  compact = false,
}: {
  compact?: boolean;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [matches, setMatches] = useState<Match[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const requestId = useRef(0);

  useEffect(() => {
    const value = query.trim();
    if (value.length < 2) {
      setMatches([]);
      setOpen(false);
      setLoading(false);
      return;
    }

    const currentRequest = ++requestId.current;
    const timer = window.setTimeout(async () => {
      setLoading(true);
      try {
        const response = await fetch(
          `/api/public/property-name-search?q=${encodeURIComponent(value)}`,
          { cache: "no-store" },
        );
        const payload = await response.json().catch(() => null);
        if (currentRequest !== requestId.current) return;
        setMatches(Array.isArray(payload?.matches) ? payload.matches : []);
        setOpen(true);
      } catch {
        if (currentRequest === requestId.current) {
          setMatches([]);
          setOpen(true);
        }
      } finally {
        if (currentRequest === requestId.current) setLoading(false);
      }
    }, 160);

    return () => window.clearTimeout(timer);
  }, [query]);

  return (
    <div className={`${styles.wrap} ${compact ? styles.compact : ""}`}>
      <div className={styles.copy}>
        <strong>Already know the place?</strong>
        <span>Search the property name and go straight to it.</span>
      </div>

      <form
        className={styles.control}
        onSubmit={(event) => {
          event.preventDefault();
          const first = matches[0];
          if (!first) return;
          track("property_name_search_selected", {
            slug: first.slug,
            surface: compact ? "stays" : "home",
            trigger: "submit",
          });
          router.push(`/stays/${encodeURIComponent(first.slug)}`);
        }}
      >
        <label className={styles.field}>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onFocus={() => {
              if (query.trim().length >= 2) setOpen(true);
            }}
            onBlur={() => {
              window.setTimeout(() => setOpen(false), 140);
            }}
            placeholder="Search Lil' Rustic, Whitetail, Lucky Star…"
            autoComplete="off"
            aria-label="Search by property name"
            aria-autocomplete="list"
            aria-expanded={open}
          />
          <button type="submit" aria-label="Open first matching property">
            ⌕
          </button>
        </label>

        {open ? (
          <div className={styles.results}>
            {loading ? (
              <div className={styles.status}>Searching stays…</div>
            ) : matches.length ? (
              matches.map((match) => (
                <Link
                  key={match.slug}
                  href={`/stays/${encodeURIComponent(match.slug)}`}
                  className={styles.result}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() =>
                    track("property_name_search_selected", {
                      slug: match.slug,
                      surface: compact ? "stays" : "home",
                    })
                  }
                >
                  <span>
                    <strong>{match.name}</strong>
                    <small>{match.location}</small>
                  </span>
                  <b aria-hidden="true">→</b>
                </Link>
              ))
            ) : (
              <div className={styles.status}>
                No published stay matches that name yet.
              </div>
            )}
          </div>
        ) : null}
      </form>
    </div>
  );
}
