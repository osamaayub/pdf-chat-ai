import "server-only";

/**
 * Which AI the app uses.
 * - "openai":    embeddings for search + GPT for answers
 * - "anthropic": BM25 keyword search + Claude for answers (Anthropic has no embeddings API)
 * - "demo":      no key, keyword search and quoted answers, no AI calls
 *
 * Set AI_PROVIDER to pick one. Otherwise the app uses OpenAI if its key is set, then Claude, then demo.
 * Keys are only read here, on the server. "server-only" fails the build if this reaches the browser.
 */
export type Mode = "openai" | "anthropic" | "demo";

export const models = {
  embedding: process.env.OPENAI_EMBEDDING_MODEL || "text-embedding-3-small",
  openaiChat: process.env.OPENAI_MODEL || "gpt-4.1-mini",
  claude: process.env.CLAUDE_MODEL || "claude-haiku-5-5",
};

/** Hard limits that keep every request cheap. */
export const limits = { maxAnswerTokens: 500, embeddingDims: 256, timeoutMs: 30_000 };

const has = (name: string) => Boolean(process.env[name]?.trim());

export const available = (mode: Mode) =>
  mode === "demo" || (mode === "openai" ? has("OPENAI_API_KEY") : has("ANTHROPIC_API_KEY"));

/** The provider to try first. Falls back down the list if the chosen one has no key. */
export function preferredMode(): Mode {
  const chosen = process.env.AI_PROVIDER?.trim().toLowerCase() as Mode | undefined;
  if (chosen && ["openai", "anthropic", "demo"].includes(chosen) && available(chosen)) return chosen;
  if (available("openai")) return "openai";
  if (available("anthropic")) return "anthropic";
  return "demo";
}

/** The order to try when a provider fails (no credits, outage): the preferred one, then any other with a key, then demo. */
export function fallbackChain(start: Mode): Mode[] {
  const order: Mode[] = [start, "anthropic", "openai", "demo"];
  return [...new Set(order)].filter(available);
}
