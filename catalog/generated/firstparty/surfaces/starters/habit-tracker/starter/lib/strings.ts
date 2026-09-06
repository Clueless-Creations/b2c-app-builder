// Every user-facing string in the starter lives here, keyed the way product/copy/COPY_DECK.md
// keys the product's words — the key here becomes the localization key later.
// The copy pass replaces these values from the deck; when localizing, lift this
// module into the stack's resource format (next-intl messages, i18next resources).
// "Fernpath" is a fictional example brand and is gate-detectable: check:app-copy
// fails a build that ships it.
export const strings = {
  landing: {
    headline: "Small wins, every day",
    body: "Fernpath turns one small daily check-in into a streak you can watch grow.",
    sign_in: "Sign in",
    today: "Today",
  },
  meta: {
    title: "Fernpath — daily habits",
    description: "One small check-in a day. A streak you can watch grow.",
  },
  auth: {
    email_label: "Email",
    submit: "Send sign-in link",
    sent: "Check your email for the sign-in link.",
    error: "That didn't send. Check the address and try again.",
  },
  today: {
    title: "Today",
  },
} as const;
