// Every user-facing string in the starter lives here, keyed the way product/copy/COPY_DECK.md
// keys the product's words — the key here becomes the localization key later.
// The copy pass replaces these values from the deck; when localizing, lift this
// module into the stack's resource format (next-intl messages, i18next resources).
// "Loomroom" is a fictional example brand and is gate-detectable: check:app-copy
// fails a build that ships it.
export const strings = {
  landing: {
    headline: "Someone to think out loud with",
    body: "Loomroom listens, remembers, and picks up right where you left off.",
    sign_in: "Sign in",
    chat: "Chat",
  },
  meta: {
    title: "Loomroom — a companion who remembers",
    description: "Talk it through with a companion who remembers what matters to you.",
  },
  auth: {
    email_label: "Email",
    submit: "Send sign-in link",
    sent: "Check your email for the sign-in link.",
    error: "That didn't send. Check the address and try again.",
  },
  chat: {
    title: "Chat",
    placeholder: "Say something",
    send: "Send",
    error: "Something went wrong. Try again.",
    you: "You",
    companion: "Companion",
  },
} as const;
