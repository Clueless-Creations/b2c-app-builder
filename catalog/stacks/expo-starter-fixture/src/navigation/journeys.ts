import { ROUTE_HREFS } from "./route-graph.js";

export const NAVIGATION_RUNTIME_VERIFIED = false;

export type TabHref = typeof ROUTE_HREFS.home | typeof ROUTE_HREFS.settings;
export type RouteHref = TabHref | typeof ROUTE_HREFS.modal | typeof ROUTE_HREFS.signIn | `/detail/${string}`;

export type NavigationEvent =
  | { type: "cold-start" }
  | { type: "warm-link"; href: RouteHref }
  | { type: "tab"; href: TabHref }
  | { type: "open-modal" }
  | { type: "open-detail"; id: string }
  | { type: "back" }
  | { type: "offline-restart" };

export interface NavigationFrame {
  href: RouteHref;
  stack: readonly RouteHref[];
  modalPresented: boolean;
  tab: "index" | "settings";
  restoredFrom: "cold" | "warm-link" | "session" | "in-session";
}

const INITIAL: NavigationFrame = {
  href: ROUTE_HREFS.home,
  stack: [ROUTE_HREFS.home],
  modalPresented: false,
  tab: "index",
  restoredFrom: "cold",
};

function tabOf(href: RouteHref): "index" | "settings" {
  return href === ROUTE_HREFS.settings ? "settings" : "index";
}

function applyHref(frame: NavigationFrame, href: RouteHref, restoredFrom: NavigationFrame["restoredFrom"]): NavigationFrame {
  if (href === ROUTE_HREFS.home || href === ROUTE_HREFS.settings) {
    return {
      href,
      stack: [href],
      modalPresented: false,
      tab: tabOf(href),
      restoredFrom,
    };
  }
  if (href === ROUTE_HREFS.modal) {
    const base = frame.stack.filter((entry) => entry !== ROUTE_HREFS.modal);
    return {
      href,
      stack: [...base, href],
      modalPresented: true,
      tab: frame.tab,
      restoredFrom,
    };
  }
  const base = frame.stack.filter((entry) => entry !== href && entry !== ROUTE_HREFS.modal);
  return {
    href,
    stack: [...base, href],
    modalPresented: false,
    tab: frame.tab,
    restoredFrom,
  };
}

export function reduceNavigation(events: readonly NavigationEvent[]): NavigationFrame {
  let persisted = INITIAL;
  let frame = INITIAL;
  for (const event of events) {
    switch (event.type) {
      case "cold-start":
        frame = { ...INITIAL, restoredFrom: "cold" };
        persisted = frame;
        break;
      case "warm-link":
        frame = applyHref(frame, event.href, "warm-link");
        persisted = frame;
        break;
      case "tab":
        frame = applyHref(frame, event.href, "in-session");
        persisted = frame;
        break;
      case "open-modal":
        frame = applyHref(frame, ROUTE_HREFS.modal, "in-session");
        persisted = frame;
        break;
      case "open-detail":
        frame = applyHref(frame, ROUTE_HREFS.detail(event.id), "in-session");
        persisted = frame;
        break;
      case "back": {
        const stack = frame.stack.slice(0, -1);
        const href = stack[stack.length - 1] ?? ROUTE_HREFS.home;
        frame = {
          href,
          stack: stack.length > 0 ? stack : [ROUTE_HREFS.home],
          modalPresented: href === ROUTE_HREFS.modal,
          tab: href === ROUTE_HREFS.home || href === ROUTE_HREFS.settings ? tabOf(href) : frame.tab,
          restoredFrom: "in-session",
        };
        persisted = frame;
        break;
      }
      case "offline-restart":
        frame = { ...persisted, restoredFrom: "session" };
        break;
      default: {
        const exhaustive: never = event;
        throw new Error(`unhandled navigation event: ${JSON.stringify(exhaustive)}`);
      }
    }
  }
  return frame;
}
