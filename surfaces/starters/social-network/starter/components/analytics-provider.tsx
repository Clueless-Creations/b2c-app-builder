"use client";

import { useEffect } from "react";
import { initPostHog, capture, EVENTS } from "@/lib/analytics/posthog-client";

// Mounts once in the root layout; initializes PostHog and fires app_opened.
export function AnalyticsProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    initPostHog();
    capture(EVENTS.app_opened);
  }, []);

  return <>{children}</>;
}
