import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { strings } from "@/lib/strings";

// Library stub (prompt 03 replaces this with the full capture/library flow:
// upload to the owner-scoped storage bucket, signed-URL thumbnails, asset
// detail, and the before/after reveal surface).
export default async function LibraryPage() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) {
    redirect("/login");
  }

  const { data: assets } = await supabase.from("media_assets").select("id, kind, storage_path, created_at").order("created_at", { ascending: false }).limit(50);

  return (
    <main>
      <h1>{strings.library.title}</h1>
      <ul>
        {(assets ?? []).map((asset) => (
          <li key={asset.id}>
            {asset.kind}: {asset.storage_path}
          </li>
        ))}
      </ul>
    </main>
  );
}
