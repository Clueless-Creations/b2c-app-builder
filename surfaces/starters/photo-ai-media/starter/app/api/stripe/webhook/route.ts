import { NextResponse } from "next/server";
import { getStripe } from "@/lib/billing/stripe";

// Stripe webhook endpoint (prompt 07). Verifies the signature with
// STRIPE_WEBHOOK_SECRET, then projects subscription state into the database.
// Provider proof (test event received and verified) is required before the
// revenue lane is done.
export async function POST(request: Request) {
  const signature = request.headers.get("stripe-signature");
  if (!signature || !process.env.STRIPE_WEBHOOK_SECRET) {
    return NextResponse.json({ error: "webhook_not_configured" }, { status: 503 });
  }

  const payload = await request.text();
  let event;
  try {
    event = getStripe().webhooks.constructEvent(payload, signature, process.env.STRIPE_WEBHOOK_SECRET);
  } catch {
    return NextResponse.json({ error: "invalid_signature" }, { status: 400 });
  }

  switch (event.type) {
    case "checkout.session.completed":
    case "customer.subscription.updated":
    case "customer.subscription.deleted":
      // TODO(prompt 07): upsert subscription/entitlement state keyed by
      // client_reference_id. Keep idempotent — Stripe retries deliveries.
      break;
    default:
      break;
  }

  return NextResponse.json({ received: true });
}
