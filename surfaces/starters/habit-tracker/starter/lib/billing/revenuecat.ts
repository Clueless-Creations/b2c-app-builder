/**
 * RevenueCat stub — the native-app entitlement path.
 *
 * When the founder ships native iOS/Android, digital subscriptions go through
 * StoreKit/Play Billing via RevenueCat (revenue-monetization.md), and this app
 * consumes RevenueCat webhooks to project entitlements into the database so
 * web and native agree on who is entitled.
 *
 * The webhook route (app/api/revenuecat/webhook/route.ts) authenticates with
 * REVENUECAT_WEBHOOK_AUTH_TOKEN and calls projectEntitlement. Provider proof
 * (sandbox purchase, entitlement grant, restore) is required before the
 * revenue lane is done — see provider-proof.md.
 */

export interface RevenueCatEvent {
  type: string;
  app_user_id: string;
  entitlement_ids?: string[];
  expiration_at_ms?: number;
}

export async function projectEntitlement(event: RevenueCatEvent): Promise<void> {
  // TODO(prompt 07 / revenue lane): upsert into an entitlements table keyed by
  // app_user_id so RLS policies can gate premium features. Keep this
  // idempotent — RevenueCat retries webhooks.
  void event;
}
