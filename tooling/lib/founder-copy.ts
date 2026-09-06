/**
 * founder-copy.ts — the only sanctioned path from machine state to founder-visible text.
 *
 * Every founder-facing renderer and every founder-facing template goes through this
 * module. Internal state keeps its machine shape (lane ids, status enums, phase codes,
 * route enums) because ~55 validators, the JSON schema, and the shipped business repos
 * depend on those exact values. What a human reads is a translation of them, produced
 * here.
 *
 * Internal identifiers are not human explanations. This dictionary keeps
 * labels consistent across session updates, handoffs, and retained artifacts.
 *
 * Rules for editing this file:
 * - Adding a lane, status, phase, autonomy mode, or tool route means adding its label
 *   here in the same commit. check-founder-copy.ts fails when a value in
 *   lib/launch-state.ts has no label here, so the two cannot drift.
 * - Labels are sentence case, plain language, and free of internal vocabulary. They are
 *   read by a founder who may know nothing about stores, providers, or launch sequencing.
 * - Never put an identifier, enum value, phase code, or tool name in a label.
 * - Keep labels short enough for a table cell. Put the explanation in the blurb.
 */

import { phaseOrder, requiredLanes, statusValues } from "./launch-state.js";

/** A founder-visible label plus the one line that says why the area matters. */
export interface LaneCopy {
  label: string;
  blurb: string;
  /** Milestone this lane rolls up into on the founder's progress view. */
  milestone: MilestoneId;
}

export type MilestoneId =
  "foundation" | "know_the_market" | "decide_the_product" | "look_and_feel" | "build_it" | "store_ready" | "money_and_legal" | "go_live" | "keep_growing";

/**
 * The founder's progress spine. Nine named milestones replace a 22-row table of lane
 * ids, because a person describes their own progress in stages, not in system keys.
 * Order is the order a founder experiences them.
 */
export const milestones: { id: MilestoneId; label: string; blurb: string }[] = [
  { id: "foundation", label: "Setting up the basics", blurb: "Accounts, secure storage for keys, and the tools we will use." },
  { id: "know_the_market", label: "Learning the market", blurb: "What people already search for, pay for, and complain about." },
  { id: "decide_the_product", label: "Deciding what to build", blurb: "The one thing your app does better than anything else." },
  { id: "look_and_feel", label: "Designing the look and feel", blurb: "Your brand, your screens, and how the app should feel to use." },
  { id: "build_it", label: "Building the app", blurb: "Writing the app, wiring the data, and testing it on a real device." },
  { id: "store_ready", label: "Getting store-ready", blurb: "Screenshots, your store listing, and everything Apple and Google require." },
  { id: "money_and_legal", label: "Payments and paperwork", blurb: "Subscriptions, purchase testing, privacy policy, and terms." },
  { id: "go_live", label: "Going live", blurb: "Your landing page, the launch announcement, and submitting for review." },
  { id: "keep_growing", label: "Growing after launch", blurb: "Reviews, updates, marketing, and watching what actually works." },
];

/**
 * Lane id → founder copy. Keys are the machine lane ids from launch-state.ts
 * requiredLanes; the values are what a founder reads.
 */
export const laneCopy: Record<string, LaneCopy> = {
  paid_tool_routing: {
    label: "Choosing your tools and services",
    blurb: "Which paid or free services this business runs on, and what we do when one is unavailable.",
    milestone: "foundation",
  },
  secrets: {
    label: "Keeping your keys safe",
    blurb: "Passwords and API keys live in secure storage, never in your code or our chat.",
    milestone: "foundation",
  },
  security: {
    label: "Protecting the app and its data",
    blurb: "What could go wrong, and what we put in place so it does not.",
    milestone: "build_it",
  },
  research: {
    label: "Researching the market",
    blurb: "What competing apps charge, what users say about them, and the words people search for.",
    milestone: "know_the_market",
  },
  traceability: {
    label: "Keeping decisions connected",
    blurb: "Every design and build decision traces back to something we actually learned.",
    milestone: "decide_the_product",
  },
  experience: {
    label: "Designing the standout moment",
    blurb: "The one experience that makes someone tell a friend about your app.",
    milestone: "decide_the_product",
  },
  product: {
    label: "Deciding what ships first",
    blurb: "What version one does, what waits for later, and what we agreed not to build.",
    milestone: "decide_the_product",
  },
  design: {
    label: "Your brand and screens",
    blurb: "Name, colors, type, and what every screen looks like.",
    milestone: "look_and_feel",
  },
  emotional_design: {
    label: "How the app should feel",
    blurb: "The moments that make the app satisfying to use, and the limits we hold ourselves to.",
    milestone: "look_and_feel",
  },
  content_assets: {
    label: "Videos and images",
    blurb: "Store previews, demo clips, and the images for ads and social posts.",
    milestone: "store_ready",
  },
  analytics_attribution: {
    label: "Measuring what happens",
    blurb: "Which actions we track, so you can see what works instead of guessing.",
    milestone: "build_it",
  },
  paid_user_acquisition: {
    label: "Paid advertising",
    blurb: "Where ad money goes, what it costs to get a customer, and when to stop or scale.",
    milestone: "keep_growing",
  },
  onboarding: {
    label: "The first-run experience",
    blurb: "What a new user sees in their first minute, and when we ask them to subscribe.",
    milestone: "look_and_feel",
  },
  revenue: {
    label: "Subscriptions and payments",
    blurb: "Your prices, the purchase flow, and proof that a real payment works end to end.",
    milestone: "money_and_legal",
  },
  store_console: {
    label: "Your App Store listing",
    blurb: "Title, description, screenshots, and the privacy answers Apple and Google require.",
    milestone: "store_ready",
  },
  apple_signing: {
    label: "Apple developer setup",
    blurb: "Your developer account, the certificates that sign the app, and TestFlight.",
    milestone: "store_ready",
  },
  privacy_legal: {
    label: "Privacy policy and terms",
    blurb: "The legal pages you are required to publish, and what they promise your users.",
    milestone: "money_and_legal",
  },
  email: {
    label: "Email to your users",
    blurb: "Welcome emails, receipts, and the domain setup that keeps them out of spam.",
    milestone: "go_live",
  },
  orchestration: {
    label: "How the work is split up",
    blurb: "Which agent owns which part of the build, so nothing gets done twice or missed.",
    milestone: "build_it",
  },
  engineering: {
    label: "Building the app",
    blurb: "The build plan, the code, and proof it runs on a real device.",
    milestone: "build_it",
  },
  growth: {
    label: "Getting the word out",
    blurb: "Your launch announcement, social posts, referrals, and creator partnerships.",
    milestone: "go_live",
  },
  post_launch_ops: {
    label: "Running the app after launch",
    blurb: "Answering reviews, fixing crashes, shipping updates, and checking what retained users.",
    milestone: "keep_growing",
  },
};

/**
 * Status enum → what a founder reads. The enum values themselves stay in the CSS class
 * so the existing status colors keep working.
 */
export const statusCopy: Record<string, string> = {
  pending: "Not started yet",
  ready: "Ready to begin",
  running: "In progress",
  waiting_founder: "Waiting on you",
  blocked: "Blocked",
  orphaned: "Needs an owner",
  needs_readback: "Needs verification",
  succeeded: "Done",
  failed: "Needs repair",
  stale: "Needs a fresh check",
  skipped: "Skipped",
  not_needed: "Not needed for this app",
  deferred: "Deliberately postponed",
  cancelled: "Cancelled",
};

/**
 * Business-access sub-status enum → what a founder reads in the account card.
 *
 * This belongs beside the rest of the founder-visible vocabulary so every renderer
 * shares the same presentation boundary. The founder-operator fixtures pin the
 * shipped enum values to literal expectations independently of this table.
 */
export const accessCopy: Record<string, string> = {
  not_started: "Not set up yet",
  active: "Active",
  partial: "Partly set up",
  blocked: "Waiting on you",
  founder_action_needed: "Needs your help",
  access_pending: "Waiting for access",
  access_ready: "Ready",
  deferred: "Postponed on purpose",
  not_needed: "Not needed",
  done: "Ready",
  ready: "Ready",
};

/** Founder-visible label for a business-access sub-status. */
export function accessLabel(value: unknown): string {
  return accessCopy[String(value ?? "")] ?? "Not set up yet";
}

/**
 * Phase code → the stage name a founder would use. Sub-phases share their parent's
 * plain name where a founder would not distinguish them; the code still identifies
 * them precisely for the agent.
 */
export const phaseCopy: Record<string, string> = {
  phase_0_orient: "Getting set up",
  phase_0a: "Getting set up",
  phase_0b: "Choosing tools and services",
  phase_0c: "Securing your keys and passwords",
  phase_1: "Researching the market",
  phase_1b: "Planning what to measure",
  phase_1c: "Designing the standout moment",
  phase_1d: "Planning paid advertising",
  phase_1e: "Planning how it spreads",
  phase_1f: "Writing the technical build plan",
  phase_1g: "Planning security",
  phase_2: "Designing brand and screens",
  phase_3: "Preparing your store listing",
  phase_3b: "Setting up subscriptions",
  phase_4: "Building the landing page",
  phase_5: "Handing off to the builders",
  phase_5b: "Building and hardening the app",
  phase_5c: "Final security check",
  phase_6: "Growing after launch",
  phase_6b: "Running the live app",
};

/** Autonomy mode → one sentence on how much the agent will do without asking. */
export const modeCopy: Record<string, string> = {
  scout: "I am only looking around, not changing anything",
  draft: "I am writing drafts for you to review",
  prepare: "I am preparing everything and pausing before anything public or paid",
  apply: "I am making the changes we agreed on",
  mutate: "I am changing live settings you approved",
  ship: "I am cleared to publish and release",
};

/**
 * Tool route enum → plain language. The underlying enum values are long compound
 * identifiers; a founder only needs to know who is doing the work and whether it costs
 * anything.
 */
export const routeCopy: Record<string, string> = {
  paid: "Paid service, you approved it",
  free_tier: "Free plan",
  free_fallback: "Free alternative, because the paid one was not available",
  built_in: "Built in, nothing to set up",
  blocked: "Blocked, waiting on access",
  not_needed: "Not needed for this app",
};

/**
 * Agent role id → plain language.
 *
 * These ids are the role-prompt filenames in the generated business repo's
 * `agents/` directory, and they are legitimate vocabulary between agents. They
 * are not enough to explain an owner in a human handoff. Translate known ids
 * before reporting who owns a result or decision.
 *
 * Unknown values fall through unchanged rather than being blanked: a role this
 * map has not learned yet is still more useful to a founder than an empty cell,
 * and check-founder-copy will flag it.
 */
export const ownerCopy: Record<string, string> = {
  orchestrator: "Me, coordinating the work",
  "marketing-guru": "Me, on marketing",
  "engineering-leader": "Me, on the build",
  "product-leader": "Me, on product decisions",
  "design-guru": "Me, on design",
  "customer-success": "Me, on support and user trust",
  "security-architect": "Me, on security",
  founder: "You",
  "Founder or team": "You",
};

/** Shared founder-facing empty states. Never leave a blank cell or a bare "unknown". */
export const emptyCopy = {
  nothing: "Nothing yet",
  noBlockers: "Nothing in your way right now",
  notCheckedYet: "Not checked yet",
  noneNeeded: "Nothing needed here",
  noDecision: "No founder decision is pending",
  notRecorded: "Not recorded yet",
} as const;

/**
 * Progress acknowledgment, keyed by the phase whose exit earns it. The launch had zero
 * of these before: the agent moved from a passing purchase test straight to the next
 * requirement without ever telling the founder something good had happened.
 *
 * Say the beat when the named milestone genuinely completes and never otherwise. An
 * unearned celebration is worse than silence.
 */
export const celebrationBeats: { phase: string; earnedBy: string; say: string }[] = [
  {
    phase: "phase_0c",
    earnedBy: "Doppler holds a real secret and an injected command ran without printing values",
    say: "Your keys are locked down properly now. That is the part most people get wrong, and it is done.",
  },
  {
    phase: "phase_1",
    earnedBy: "strategy/RESEARCH.md carries real competitor pricing, review quotes, and keyword demand",
    say: "We now know what this market actually pays for, in numbers rather than guesses. Everything we design from here rests on that.",
  },
  {
    phase: "phase_1c",
    earnedBy: "the 11-star ladder picked one magical version-one moment",
    say: "You have a single standout moment worth building the app around. That decision is what most apps never make.",
  },
  {
    phase: "phase_2",
    earnedBy: "strategy/BRAND.md and DESIGN.md are accepted and rendered",
    say: "Your app has a name, a look, and screens you can point at. It stopped being an idea today.",
  },
  {
    phase: "phase_3b",
    earnedBy: "a sandbox and a production purchase both validated",
    say: "I just tested a real purchase end to end, and it works. Your app can take money.",
  },
  {
    phase: "phase_5b",
    earnedBy: "the app ran a full flow on a device or simulator with evidence attached",
    say: "The app runs a complete flow on a real device. You can hold it in your hand now.",
  },
  {
    phase: "phase_5c",
    earnedBy: "the store submission was accepted for review",
    say: "It is submitted. Apple has your app in review, and there is nothing more to do but wait.",
  },
  {
    phase: "phase_6",
    earnedBy: "the app is approved for sale and live on a store",
    say: "Your app is live. People who have never met you can download it right now.",
  },
];

/** Founder-visible label for a lane id. Unknown ids fall back to a readable form. */
export function laneLabel(id: string): string {
  return laneCopy[id]?.label ?? humanizeIdentifier(id);
}

/** One line on why a lane matters, for a founder who has not seen it before. */
export function laneBlurb(id: string): string {
  return laneCopy[id]?.blurb ?? "";
}

/** Milestone a lane rolls up into on the founder's progress view. */
export function laneMilestone(id: string): MilestoneId | undefined {
  return laneCopy[id]?.milestone;
}

/** Founder-visible label for a lane status enum value. */
export function statusLabel(status: string): string {
  return statusCopy[status] ?? humanizeIdentifier(status);
}

/** Founder-visible stage name for a phase code. */
export function phaseLabel(phase: string): string {
  return phaseCopy[phase] ?? humanizeIdentifier(phase);
}

/** Founder-visible sentence for an autonomy mode. */
export function modeLabel(mode: string): string {
  return modeCopy[mode] ?? humanizeIdentifier(mode);
}

/** Founder-visible description of who owns a piece of work. */
export function ownerLabel(owner: string): string {
  return ownerCopy[owner] ?? humanizeIdentifier(owner);
}

/** Founder-visible label for a provider route value. */
export function routeLabel(route: string): string {
  const exact = routeCopy[route];
  if (exact) return exact;
  // Long compound routes (e.g. built_in_agent_simulator_when_local_mac,
  // optional_open_source_cli_preview_proof) predate the collapsed enum and still appear
  // in existing state files. Classify by keyword so no raw identifier reaches the page,
  // in priority order: a blocker outranks a cost, and a cost outranks optionality.
  const normalized = route.toLowerCase();
  if (normalized.includes("blocked")) return routeCopy.blocked as string;
  if (normalized.includes("not_needed")) return routeCopy.not_needed as string;
  if (normalized.includes("built_in")) return routeCopy.built_in as string;
  if (normalized.includes("free")) return routeCopy.free_tier as string;
  if (normalized.includes("paid")) return routeCopy.paid as string;
  if (normalized.includes("intended")) return "Planned, not set up yet";
  if (normalized.includes("optional")) return "Optional, only if we need it";
  return humanizeIdentifier(route);
}

/**
 * Service key in `tools` → the name a founder would recognize. These keys are provider
 * and capability ids rather than a closed enum, so unknown ones fall back to a readable
 * form instead of failing the build; only the ones a founder actually sees need an entry.
 */
export const serviceCopy: Record<string, string> = {
  doppler: "Doppler (secure key storage)",
  posthog: "PostHog (product analytics)",
  revenuecat: "RevenueCat (subscriptions)",
  stripe: "Stripe (card payments)",
  resend: "Resend (email)",
  sentry: "Sentry (crash reporting)",
  refero: "Refero (design pattern research)",
  firecrawl: "Firecrawl (web research)",
  appkittie: "AppKittie (App Store research)",
  higgsfield: "Higgsfield (image and video generation)",
  mobai: "MobAI (device testing)",
  fastlane: "Fastlane (social publishing)",
  supabase: "Supabase (database and accounts)",
  app_store_connect: "App Store Connect (Apple)",
  google_play: "Google Play Console",
  app_store_screenshots: "Store screenshot builder",
  paid_ad_channels: "Ad platforms",
  security_review: "Security scanning",
  xpoz: "XPOZ (social listening)",
  remotion: "Remotion (code-rendered video)",
};

/** Founder-visible name for a service key in `tools`. */
export function serviceLabel(key: string): string {
  return serviceCopy[key] ?? humanizeIdentifier(key);
}

/** The celebration beat a phase exit earns, if any. */
export function celebrationFor(phase: string): string | undefined {
  return celebrationBeats.find((beat) => beat.phase === phase)?.say;
}

/**
 * Last-resort readable form for a value with no label. Turns "paid_tool_routing" into
 * "Paid tool routing" so an unlabeled value degrades to something a person can read
 * instead of leaking raw snake_case. check-founder-copy.ts still fails the build, so
 * this is a safety net and not a substitute for adding the label.
 */
export function humanizeIdentifier(value: string): string {
  const words = String(value ?? "")
    .replace(/[_-]+/g, " ")
    .trim();
  if (words.length === 0) return emptyCopy.notRecorded;
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/**
 * Internal vocabulary that must never reach a founder, mapped to what to say instead.
 * check-founder-copy.ts reads this table, so adding a word here starts enforcing it.
 */
export const bannedFounderVocabulary: { term: string; sayInstead: string }[] = [
  { term: "AskUserQuestion", sayInstead: "nothing — never name the tool, just ask the question" },
  { term: "lane", sayInstead: "area of the launch, or name the specific area" },
  { term: "gate", sayInstead: "your call, or a decision I need from you" },
  { term: "founder-only gate", sayInstead: "something only you can decide" },
  { term: "protected gate", sayInstead: "something only you can decide" },
  { term: "artifact", sayInstead: "document, or name the file" },
  { term: "provider state", sayInstead: "your connected tools and services" },
  { term: "reducer", sayInstead: "nothing — describe the business change, not the state-writing mechanism" },
  { term: "change cascade", sayInstead: "where this change also needs to appear" },
  { term: "tooling", sayInstead: "tools, or name the result the tools produced" },
  { term: "failure card", sayInstead: "something I am watching" },
  { term: "proof", sayInstead: "how I checked my work" },
  { term: "evidence ledger", sayInstead: "what we learned and where it came from" },
  { term: "launch tier", sayInstead: "how much of the full launch we are doing" },
  { term: "token promotion", sayInstead: "moving your accepted design into the app" },
  { term: "control plane", sayInstead: "your business dashboard" },
  { term: "line of feasibility", sayInstead: "the line between what we can build now and what we cannot" },
  { term: "surface translation", sayInstead: "carrying the same idea into each screen and page" },
  { term: "state reconciled", sayInstead: "everything is written down and up to date" },
  { term: "autopilot run contract", sayInstead: "how I keep working without asking you to restart me" },
  { term: "beginner_assumed", sayInstead: "nothing — never show the setting" },
  { term: "business_operator", sayInstead: "nothing — never show the setting" },
];

/**
 * Experience-card technique names — the one vocabulary this file deliberately does
 * NOT translate, and the reasoning is here because it argues against the move every
 * other export above makes.
 *
 * docs/architecture.md carried this as an open decision: whether the twelve
 * engagement-technique names get plain-language founder equivalents, or stay
 * internal labels behind one umbrella term. The answer is neither half of that
 * framing.
 *
 * **No technique gets a founder alias.** Every other vocabulary here is a machine
 * enum whose only other reader is a validator, so inventing a human label for it
 * costs nothing and loses nothing. These twelve are not that. They are terms of art
 * with literature behind them, and they are the live key set of the Retention
 * Mechanics MCP (`retention_get_mechanic("peak-end")`). An alias would be a second
 * vocabulary for one concept — the twin-file failure this repo has already been
 * burned by — and it would take from the founder the one thing the real name gives
 * them: the ability to look the technique up, read its critics, and recognize it
 * when a designer says it out loud.
 *
 * **What a founder gets instead is one umbrella for the deck as a whole.** A
 * beginner skimming their own launch does not need twelve new words; they need to
 * know what this part of the work is. That phrase lives in the emotional_design
 * lane blurb, so the umbrella a founder reads and the lane they see it on cannot
 * drift apart.
 *
 * **The two HIGH-risk techniques stay literal where the founder attests to them.**
 * Softening the name of the thing being signed is the one move that would be
 * actively wrong: "Variable Reward" carries a warning that any friendlier synonym
 * launders away, and the founder is attesting to the mechanic, not to a description
 * of it. attestedTechniques is checked against the HIGH tier declared in the card
 * stubs, so promoting a thirteenth card to HIGH cannot leave this list behind.
 */
export const experienceCardUmbrella = "moments that make the app satisfying to use";

/** The HIGH-risk techniques a founder personally attests to, named as the literature names them. */
export const attestedTechniques: readonly { id: string; name: string }[] = [
  { id: "variable-reward", name: "Variable Reward" },
  { id: "streak-and-loss-aversion", name: "Streak & Loss Aversion" },
];

/**
 * Machine vocabularies this module must cover completely. check-founder-copy.ts uses
 * this to prove every enum value has founder copy, so a new lane cannot ship unlabeled.
 */
export function coverageGaps(): { vocabulary: string; missing: string[] }[] {
  const gaps: { vocabulary: string; missing: string[] }[] = [];
  const laneMissing = requiredLanes.filter((id) => !laneCopy[id]);
  if (laneMissing.length > 0) gaps.push({ vocabulary: "lanes", missing: laneMissing });
  const statusMissing = [...statusValues].filter((value) => !statusCopy[value]);
  if (statusMissing.length > 0) gaps.push({ vocabulary: "lane statuses", missing: statusMissing });
  const phaseMissing = phaseOrder.filter((value) => !phaseCopy[value]);
  if (phaseMissing.length > 0) gaps.push({ vocabulary: "phases", missing: phaseMissing });
  const milestoneIds = new Set(milestones.map((entry) => entry.id));
  const laneMilestoneMissing = Object.entries(laneCopy)
    .filter(([, copy]) => !milestoneIds.has(copy.milestone))
    .map(([id]) => id);
  if (laneMilestoneMissing.length > 0) gaps.push({ vocabulary: "lane milestones", missing: laneMilestoneMissing });
  return gaps;
}
