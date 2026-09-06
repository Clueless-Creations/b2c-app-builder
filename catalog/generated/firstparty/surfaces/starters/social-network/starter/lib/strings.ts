// Every user-facing string in the starter lives here, keyed the way product/copy/COPY_DECK.md
// keys the product's words — the key here becomes the localization key later.
// The copy pass replaces these values from the deck; when localizing, lift this
// module into the stack's resource format (next-intl messages, i18next resources).
// "Wrenfeed" is a fictional example brand and is gate-detectable: check:app-copy
// fails a build that ships it.
export const strings = {
  landing: {
    headline: "Your people, in one place",
    body: "Wrenfeed is a calm feed for the people you already know.",
    sign_in: "Sign in",
    feed: "Feed",
  },
  meta: {
    title: "Wrenfeed — your people's feed",
    description: "A calm feed for the people you already know.",
  },
  auth: {
    email_label: "Email",
    submit: "Send sign-in link",
    sent: "Check your email for the sign-in link.",
    error: "That didn't send. Check the address and try again.",
  },
  feed: {
    title: "Feed",
  },
} as const;
