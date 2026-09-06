import Stripe from "stripe";

// Server-only Stripe client. STRIPE_SECRET_KEY is injected via Doppler
// (`doppler run -- npm run dev`); it must never be NEXT_PUBLIC_*.
// Web monetization route per revenue-monetization.md: Stripe for web,
// StoreKit/IAP via RevenueCat for native digital subscriptions.
let stripeClient: Stripe | undefined;

export function getStripe(): Stripe {
  if (!process.env.STRIPE_SECRET_KEY) {
    throw new Error("STRIPE_SECRET_KEY is not set. Route it through SECRETS.md before enabling billing.");
  }
  stripeClient ??= new Stripe(process.env.STRIPE_SECRET_KEY);
  return stripeClient;
}
