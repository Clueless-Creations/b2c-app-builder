import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getStripe } from "@/lib/billing/stripe";

// Creates a Stripe Checkout session for the signed-in user (prompt 07).
// Emits purchase_started from the client before redirecting here.
export async function POST() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  if (!userId) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }
  if (!process.env.STRIPE_PRICE_ID) {
    return NextResponse.json({ error: "billing_not_configured" }, { status: 503 });
  }

  const stripe = getStripe();
  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    line_items: [{ price: process.env.STRIPE_PRICE_ID, quantity: 1 }],
    client_reference_id: String(userId),
    success_url: `${process.env.NEXT_PUBLIC_SITE_URL}/chat?checkout=success`,
    cancel_url: `${process.env.NEXT_PUBLIC_SITE_URL}/chat?checkout=cancelled`,
  });

  return NextResponse.json({ url: session.url });
}
