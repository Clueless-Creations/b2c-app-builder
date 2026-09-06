import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Server-side Claude inference (prompts 03/04). The API key never reaches the
// client; the model id comes from env — resolve the current id via the
// claude-api skill, never from memory. Prompt 06 adds real quota enforcement
// here; prompt 08 adds the input/output moderation pass (a launch gate for
// any public chat product).
export async function POST(request: Request) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  if (!userId) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }
  if (!process.env.ANTHROPIC_API_KEY || !process.env.ANTHROPIC_MODEL) {
    return NextResponse.json({ error: "inference_not_configured" }, { status: 503 });
  }

  const { messages } = (await request.json()) as {
    messages: Array<{ role: "user" | "assistant"; content: string }>;
  };
  if (!Array.isArray(messages) || messages.length === 0) {
    return NextResponse.json({ error: "messages_required" }, { status: 400 });
  }

  // TODO(prompt 06): check usage_events quota for this user before inference
  // and emit usage_limit_reached when exceeded.
  // TODO(prompt 08): run the input moderation pass before inference.

  // Claude Opus 5 runs adaptive thinking by default, and max_tokens caps
  // thinking plus reply text together. A chat turn needs a fast reply, not
  // deep reasoning, so this route keeps thinking on at low effort: turning
  // thinking off on Opus 5 can leak reasoning tags into the visible reply.
  // The ceiling leaves room for a short thinking pass before the text.
  const anthropic = new Anthropic();
  const stream = anthropic.messages.stream({
    model: process.env.ANTHROPIC_MODEL,
    max_tokens: 8192,
    thinking: { type: "adaptive" },
    output_config: { effort: "low" },
    messages,
  });

  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      stream.on("text", (delta) => controller.enqueue(encoder.encode(delta)));
      // Claude Opus 5 can decline a reply. It returns stop_reason "refusal"
      // on a normal message, not an SDK error. Surface that to the client.
      stream.on("message", (message) => {
        if (message.stop_reason === "refusal") {
          controller.enqueue(
            encoder.encode("\n\n[The assistant declined to continue this reply.]")
          );
        }
      });
      stream.on("end", () => controller.close());
      stream.on("error", (error) => controller.error(error));
    },
    cancel() {
      stream.abort();
    },
  });

  return new Response(body, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
