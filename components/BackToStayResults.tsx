"use client";

import { useRouter } from "next/navigation";

const STAY_BROWSE_KEY = "find-a-place:stay-browse-state";

type SavedBrowseState = {
  url?: string;
  target?: string;
  savedAt?: number;
};

function readSavedState(): SavedBrowseState | null {
  try {
    const parsed = JSON.parse(
      window.sessionStorage.getItem(STAY_BROWSE_KEY) || "null",
    );
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

export function BackToStayResults() {
  const router = useRouter();

  function goBack() {
    const saved = readSavedState();
    const current = window.location.pathname;
    const isRecent =
      typeof saved?.savedAt === "number" &&
      Date.now() - saved.savedAt < 12 * 60 * 60 * 1000;
    const matchesThisStay =
      typeof saved?.target === "string" &&
      saved.target.split("?")[0] === current;

    if (isRecent && matchesThisStay && window.history.length > 1) {
      router.back();
      return;
    }

    if (isRecent && matchesThisStay && saved?.url?.startsWith("/stays")) {
      router.push(saved.url);
      return;
    }

    router.push("/stays");
  }

  return (
    <button
      type="button"
      className="stay-back-button"
      onClick={goBack}
      aria-label="Back to stay results"
    >
      <span aria-hidden="true">←</span>
      Back to results
    </button>
  );
}
