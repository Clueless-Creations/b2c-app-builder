import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { strings } from "@/lib/strings";

// Today view stub (prompt 03 replaces this with the full core loop: one-tap
// optimistic check-ins, streak display with the recovery escape hatch, and
// the habit_checked_in / streak_extended events).
export default async function TodayPage() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) {
    redirect("/login");
  }

  const { data: habits } = await supabase.from("habits").select("id, name, cadence").is("archived_at", null).order("created_at");

  return (
    <main>
      <h1>{strings.today.title}</h1>
      <ul>
        {(habits ?? []).map((habit) => (
          <li key={habit.id}>{habit.name}</li>
        ))}
      </ul>
    </main>
  );
}
