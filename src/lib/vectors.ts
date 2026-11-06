import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { keywordVector } from "./text";

export const EMBEDDING_MODEL = "text-embedding-3-small";
export const CHAT_MODEL = "gpt-4.1-mini";
export const CLAUDE_MODEL = process.env.CLAUDE_MODEL || "claude-haiku-5-5";

/**
 * Which AI the app uses, picked from the keys you set:
 * - "openai": embeddings for search + GPT for answers
 * - "anthropic": BM25 keyword search + Claude for answers (Anthropic has no embeddings API)
 * - "demo": no key, keyword search and quoted answers, no AI calls
 * Keys are read on the server only. "server-only" makes the build fail if this file reaches the browser.
 */
export type Provider = "openai" | "anthropic" | "demo";
export const provider = (): Provider => (process.env.OPENAI_API_KEY ? "openai" : process.env.ANTHROPIC_API_KEY ? "anthropic" : "demo");
export const hasOpenAI = () => provider() === "openai";

let client: OpenAI | null = null;
export const openai = () => (client ??= new OpenAI({ maxRetries: 1, timeout: 30_000 }));
let claudeClient: Anthropic | null = null;
export const claude = () => (claudeClient ??= new Anthropic({ maxRetries: 1, timeout: 30_000 }));

export async function embed(texts: string[]): Promise<number[][]> {
  if (!hasOpenAI()) return texts.map((t) => keywordVector(t));
  // 256 dimensions keeps vectors small enough to send back and forth, with little loss in quality.
  const res = await openai().embeddings.create({ model: EMBEDDING_MODEL, input: texts, dimensions: 256 });
  return res.data.map((d) => d.embedding);
}
