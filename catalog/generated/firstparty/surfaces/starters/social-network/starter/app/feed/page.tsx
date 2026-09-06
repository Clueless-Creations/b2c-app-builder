import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { strings } from "@/lib/strings";

// Chronological feed stub (prompt 03 replaces this with the full feed: post
// composer, optimistic likes/reposts, realtime arrivals, engagement events).
export default async function FeedPage() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) {
    redirect("/login");
  }

  const { data: posts } = await supabase
    .from("posts")
    .select("id, body, created_at, author_id")
    .order("created_at", { ascending: false })
    .limit(50);

  return (
    <main>
      <h1>{strings.feed.title}</h1>
      <ul>
        {(posts ?? []).map((post) => (
          <li key={post.id}>{post.body}</li>
        ))}
      </ul>
    </main>
  );
}
