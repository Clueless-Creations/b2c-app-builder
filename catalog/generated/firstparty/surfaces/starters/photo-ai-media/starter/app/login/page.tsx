"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { capture, EVENTS } from "@/lib/analytics/posthog-client";
import { strings } from "@/lib/strings";

// Minimal email magic-link sign-in (prompt 02 replaces this with the full
// auth system: OAuth providers, profile setup, username claims).
export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function signIn(formEvent: React.FormEvent) {
    formEvent.preventDefault();
    setError(null);
    capture(EVENTS.signup_started);
    const supabase = createClient();
    const { error: signInError } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${process.env.NEXT_PUBLIC_SITE_URL ?? ""}/auth/confirm` },
    });
    if (signInError) {
      // The provider's message is for the console; the user reads authored copy.
      console.error(signInError.message);
      setError(strings.auth.error);
      return;
    }
    setSent(true);
  }

  if (sent) {
    return <p>{strings.auth.sent}</p>;
  }

  return (
    <form onSubmit={signIn}>
      <label>
        {strings.auth.email_label}
        <input type="email" value={email} onChange={(changeEvent) => setEmail(changeEvent.target.value)} required />
      </label>
      <button type="submit">{strings.auth.submit}</button>
      {error ? <p role="alert">{error}</p> : null}
    </form>
  );
}
