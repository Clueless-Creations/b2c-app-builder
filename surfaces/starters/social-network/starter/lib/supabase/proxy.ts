import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Session refresh for the Next.js proxy (proxy.ts at the project root).
// Keeps Auth tokens fresh for Server Components and the browser.
export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        supabaseResponse = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => supabaseResponse.cookies.set(name, value, options));
      },
    },
  });

  // Do not run code between createServerClient and getClaims(); skipping the
  // refresh call can randomly log users out.
  await supabase.auth.getClaims();

  // You MUST return the supabaseResponse object as-is (or copy its cookies
  // onto any replacement response) so browser and server sessions stay in sync.
  return supabaseResponse;
}
