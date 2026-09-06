import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Generation pipeline entrypoint (prompt 04). Deliberately provider-agnostic:
// the AI media provider is a founder-gated decision (paid-tool-routing.md,
// recorded in strategy/TOOL_DECISIONS.md) and its key stays server-side as
// MEDIA_GENERATION_API_KEY, routed per secrets-management.md. This route
// records the generation row + usage event; the actual inference call is
// wired in by prompt 04 once the provider is approved.
// Prompt 06 adds real quota enforcement; prompt 08 adds the content-safety
// pass on input and output (a launch gate for any public media product).
export async function POST(request: Request) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  if (!userId) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }
  if (!process.env.MEDIA_GENERATION_API_KEY) {
    return NextResponse.json({ error: "generation_not_configured" }, { status: 503 });
  }

  const { sourceAssetId, prompt } = (await request.json()) as { sourceAssetId?: string; prompt?: string };
  if (!sourceAssetId && !prompt) {
    return NextResponse.json({ error: "source_or_prompt_required" }, { status: 400 });
  }

  // TODO(prompt 06): sum usage_events for this user and reject over-quota
  // requests before paying for inference.
  // TODO(prompt 08): run the input moderation pass before inference and the
  // output pass before the asset becomes visible (emit moderation_flagged).

  const { data: generation, error } = await supabase
    .from("generations")
    .insert({ owner_id: userId, source_asset_id: sourceAssetId ?? null, prompt: prompt ?? null })
    .select("id, status")
    .single();
  if (error) {
    return NextResponse.json({ error: "generation_insert_failed" }, { status: 500 });
  }

  await supabase.from("usage_events").insert({ owner_id: userId, kind: "generation", amount: 1 });

  // TODO(prompt 04): dispatch the founder-approved provider job here and
  // update generations.status via the job callback/poller.
  return NextResponse.json({ id: generation.id, status: generation.status }, { status: 202 });
}
