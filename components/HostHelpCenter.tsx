"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import {
  HOST_HELP_ARTICLES,
  type HostHelpArticle,
} from "@/lib/host/help-content";
import styles from "./HostHelpCenter.module.css";

const categories = [
  "All",
  "Getting started",
  "Listing setup",
  "Calendars & integrations",
  "Payments & taxes",
  "Reservations & guest tools",
  "Troubleshooting",
] as const;

function articleMatches(article: HostHelpArticle, query: string) {
  if (!query) return true;

  const haystack = [
    article.title,
    article.summary,
    ...article.paragraphs,
    ...(article.bullets ?? []),
    ...article.keywords,
  ]
    .join(" ")
    .toLowerCase();

  return query
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((term) => haystack.includes(term));
}

export function HostHelpCenter({
  initialTopic,
}: {
  initialTopic?: string | null;
}) {
  const [query, setQuery] = useState("");
  const [category, setCategory] =
    useState<(typeof categories)[number]>("All");

  const articles = useMemo(
    () =>
      HOST_HELP_ARTICLES.filter(
        (article) =>
          (category === "All" || article.category === category) &&
          articleMatches(article, query.trim()),
      ),
    [category, query],
  );

  useEffect(() => {
    if (!initialTopic) return;

    const target = document.getElementById(
      initialTopic,
    ) as HTMLDetailsElement | null;

    if (!target) return;

    target.open = true;

    window.requestAnimationFrame(() => {
      target.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    });
  }, [initialTopic]);

  return (
    <div className={styles.helpShell}>
      <section className={styles.hero}>
        <div>
          <p className="eyebrow dark">Host job aid</p>
          <h2>Find the answer without leaving your host workflow.</h2>
          <p>
            Search setup, calendars, Stripe, taxes, photos,
            integrations and common problems.
          </p>
        </div>

        <div className={styles.quickLinks}>
          <Link href="/host/onboarding">Property setup</Link>
          <Link href="/host/calendar">Calendar</Link>
          <Link href="/host/payments">Payments &amp; taxes</Link>
          <Link href="/contact#host">Contact support</Link>
        </div>
      </section>

      <section className={styles.searchPanel}>
        <label>
          <span>Search the host FAQ</span>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Try: Lodgify, Stripe website, blocked dates, photos…"
          />
        </label>

        <div className={styles.categories} aria-label="FAQ categories">
          {categories.map((item) => (
            <button
              type="button"
              className={category === item ? styles.active : ""}
              onClick={() => setCategory(item)}
              key={item}
            >
              {item}
            </button>
          ))}
        </div>
      </section>

      <div className={styles.resultCount}>
        {articles.length} {articles.length === 1 ? "answer" : "answers"}
      </div>

      <section className={styles.articles}>
        {articles.map((article) => (
          <details
            className={styles.article}
            key={article.id}
            id={article.id}
          >
            <summary>
              <span>
                <small>{article.category}</small>
                <strong>{article.title}</strong>
                <em>{article.summary}</em>
              </span>
              <b aria-hidden="true">+</b>
            </summary>

            <div className={styles.articleBody}>
              {article.paragraphs.map((paragraph) => (
                <p key={paragraph}>{paragraph}</p>
              ))}

              {article.bullets?.length ? (
                <ul>
                  {article.bullets.map((bullet) => (
                    <li key={bullet}>{bullet}</li>
                  ))}
                </ul>
              ) : null}
            </div>
          </details>
        ))}

        {!articles.length ? (
          <div className={styles.empty}>
            <strong>No FAQ answer matched that search.</strong>
            <span>
              Try fewer words or contact Find A Place host support.
            </span>
          </div>
        ) : null}
      </section>

      <section className={styles.support}>
        <div>
          <strong>Still stuck?</strong>
          <p>
            Send the property name, affected dates and what you expected to
            happen. For calendar problems, include the outside platform or
            PMS name.
          </p>
        </div>
        <Link className="button button-small" href="/contact#host">
          Contact host support
        </Link>
      </section>
    </div>
  );
}
