// Every user-facing string in the starter lives here, keyed the way product/copy/COPY_DECK.md
// keys the product's words — the key here becomes the localization key later.
// The copy pass replaces these values from the deck; when localizing, lift this
// module into the stack's resource format (next-intl messages, i18next resources).
// "Glimmerjar" is a fictional example brand and is gate-detectable: check:app-copy
// fails a build that ships it.
export const strings = {
  landing: {
    headline: "Everyday photos, gallery looks",
    body: "Glimmerjar turns the shots already on your camera roll into art you'll want to share.",
    sign_in: "Sign in",
    library: "Library",
  },
  meta: {
    title: "Glimmerjar — a photo studio in your pocket",
    description: "Turn everyday shots into art you'll want to share.",
  },
  auth: {
    email_label: "Email",
    submit: "Send sign-in link",
    sent: "Check your email for the sign-in link.",
    error: "That didn't send. Check the address and try again.",
  },
  library: {
    title: "Library",
  },
} as const;
