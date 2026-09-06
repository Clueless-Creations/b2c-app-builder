"use client";

import posthog from "posthog-js";
import { EVENTS, type EventName } from "./events";

let initialized = false;

// Browser PostHog client. Initialized once from the analytics provider.
export function initPostHog() {
  if (initialized || typeof window === "undefined" || !process.env.NEXT_PUBLIC_POSTHOG_KEY) {
    return;
  }
  posthog.init(process.env.NEXT_PUBLIC_POSTHOG_KEY, {
    api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://us.i.posthog.com",
    capture_pageview: true,
  });
  initialized = true;
}

// Typed capture: only catalog events compile.
export function capture(event: EventName, properties?: Record<string, unknown>) {
  if (!initialized) {
    return;
  }
  posthog.capture(event, properties);
}

export { EVENTS };
