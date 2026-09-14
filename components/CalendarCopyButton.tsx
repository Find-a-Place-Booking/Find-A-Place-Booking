"use client";

import { useState } from "react";

export function CalendarCopyButton({ value, label = "Copy URL" }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  }

  return <button className="button button-small button-quiet" type="button" onClick={copy}>{copied ? "Copied" : label}</button>;
}
