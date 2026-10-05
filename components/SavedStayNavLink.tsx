"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import {
  readSavedStaySlugs,
  subscribeToSavedStays,
} from "@/lib/client/saved-stays";

import styles from "./SavedStayNavLink.module.css";

export function SavedStayNavLink({
  mobile = false,
  onNavigate,
}: {
  mobile?: boolean;
  onNavigate?: () => void;
}) {
  const [count, setCount] = useState(0);

  useEffect(() => {
    setCount(readSavedStaySlugs().length);
    return subscribeToSavedStays((slugs) => setCount(slugs.length));
  }, []);

  return (
    <Link
      className={mobile ? styles.mobileLink : styles.desktopLink}
      href="/saved"
      onClick={onNavigate}
    >
      <span>{mobile ? "Saved stays" : "Saved"}</span>
      {count > 0 ? (
        <b aria-label={`${count} saved stay${count === 1 ? "" : "s"}`}>
          {count > 99 ? "99+" : count}
        </b>
      ) : null}
      {mobile ? <i aria-hidden="true">→</i> : null}
    </Link>
  );
}
