import { rootStackLayout } from "./route-graph.js";

/**
 * Deep-link recovery contract. Not runtime-verified: no Expo Router binary was executed.
 */
export const deepLinkRecovery = {
  restoreColdStart: true,
  restoreWarmLink: true,
  preserveAnchorOnModal: true,
  anchor: rootStackLayout.deepLinkAnchor,
  runtimeVerified: false as const,
};
