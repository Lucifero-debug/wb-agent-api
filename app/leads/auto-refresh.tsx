"use client";

// app/leads/auto-refresh.tsx
//
// Re-fetches the page's server data every few seconds, so new leads and
// new customer messages appear without anyone pressing reload.
//
// router.refresh() re-renders server components in place: scroll
// position and anything typed into a client component (like the reply
// box) survive it. Skipped while the tab is in the background, so a
// dashboard left open all day doesn't hammer the database.

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export function AutoRefresh({ seconds = 20 }: { seconds?: number }) {
  const router = useRouter();

  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState === "visible") {
        router.refresh();
      }
    }, seconds * 1000);

    return () => clearInterval(id);
  }, [router, seconds]);

  return null;
}
