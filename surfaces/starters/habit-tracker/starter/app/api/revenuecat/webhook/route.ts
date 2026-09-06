import { NextResponse } from "next/server";
import { projectEntitlement, type RevenueCatEvent } from "@/lib/billing/revenuecat";

// RevenueCat webhook endpoint. Authenticates with the shared
// REVENUECAT_WEBHOOK_AUTH_TOKEN configured in the RevenueCat dashboard.
export async function POST(request: Request) {
  const expected = process.env.REVENUECAT_WEBHOOK_AUTH_TOKEN;
  if (!expected) {
    return NextResponse.json({ error: "webhook_not_configured" }, { status: 503 });
  }
  if (request.headers.get("authorization") !== `Bearer ${expected}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = (await request.json()) as { event?: RevenueCatEvent };
  if (body.event) {
    await projectEntitlement(body.event);
  }

  return NextResponse.json({ received: true });
}
