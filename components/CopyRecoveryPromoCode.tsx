"use client";

import { useState } from "react";

export function CopyRecoveryPromoCode({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  }

  return (
    <button className="button button-small button-quiet" type="button" onClick={copy}>
      {copied ? "Copied" : "Copy code"}
    </button>
  );
}
