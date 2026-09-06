import { installedPublicDeclarations } from "../business-primitives.js";

/** RevenueCat is a selected default recipe binding, not a validator-wide vendor requirement. */
export const DEFAULT_MONETIZATION_RECIPE = "b2c/subscription-app@1.0.0";
export function defaultMonetizationProviderContract(): string {
  const binding = installedPublicDeclarations().defaults[DEFAULT_MONETIZATION_RECIPE]?.["b2c/monetization.read-entitlement"];
  if (!binding) throw new Error("The default monetization recipe has no entitlement provider binding.");
  return binding.provider.id.replace(/^b2c\//, "");
}
