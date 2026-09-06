import type { ContextBudget } from "./receipt.js";

export const DEFAULT_CONTEXT_BUDGET: ContextBudget = { maxBytes: 32_000, maxTokens: 8_000 };

export function measureBytes(text: string): number {
  return Buffer.byteLength(text, "utf8");
}

// An approximation, not an exact count: chars/4 undercounts code and non-English text against
// Claude's real tokenizer. The 1.25x margin keeps a budget check from under-reserving on exactly
// the content types this repo's knowledge base is full of. For an exact count before a hard
// budget decision, use Anthropic's token-counting endpoint:
// https://platform.claude.com/docs/en/build-with-claude/token-counting
export function measureTokens(text: string): number {
  return Math.ceil((text.length / 4) * 1.25);
}
