export const ROOT_STACK_SCREENS = ["(tabs)", "modal", "detail/[id]", "sign-in"] as const;
export const TAB_SCREENS = ["index", "settings"] as const;

export const ROUTE_HREFS = {
  home: "/",
  settings: "/settings",
  modal: "/modal",
  signIn: "/sign-in",
  detail: (id: string) => `/detail/${id}` as const,
} as const;

/** Known static-export params. Notification restore uses id `1`. Not a CMS. */
export const STATIC_DETAIL_IDS = ["1"] as const;

export const STATIC_EXPORT_REQUIRED_HREFS = [
  ROUTE_HREFS.home,
  ROUTE_HREFS.settings,
  ROUTE_HREFS.signIn,
  ROUTE_HREFS.modal,
  ...STATIC_DETAIL_IDS.map((id) => ROUTE_HREFS.detail(id)),
] as const;

export const rootStackLayout = {
  kind: "stack" as const,
  screens: ROOT_STACK_SCREENS,
  modal: { name: "modal" as const, presentation: "modal" as const },
  deepLinkAnchor: "(tabs)" as const,
};

export const tabsLayout = {
  kind: "tabs" as const,
  screens: TAB_SCREENS,
};

export type ExpoRouteGraph = {
  stack: typeof rootStackLayout;
  tabs: typeof tabsLayout;
  detail: "detail/[id]";
};

export const expoRouteGraph: ExpoRouteGraph = {
  stack: rootStackLayout,
  tabs: tabsLayout,
  detail: "detail/[id]",
};
