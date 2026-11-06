import "server-only";
import OpenAI from "openai";
import { keywordVector } from "./text";

export const EMBEDDING_MODEL = "text-embedding-3-small";
export const CHAT_MODEL = "gpt-4.1-mini";

// The key is read on the server only. "server-only" makes the build fail if this file is ever imported into the browser.
export const hasOpenAI = () => Boolean(process.env.OPENAI_API_KEY);
let client: OpenAI | null = null;
export const openai = () => (client ??= new OpenAI({ maxRetries: 1, timeout: 30_000 }));

export async function embed(texts: string[]): Promise<number[][]> {
  if (!hasOpenAI()) return texts.map((t) => keywordVector(t));
  // 256 dimensions keeps vectors small enough to send back and forth, with little loss in quality.
  const res = await openai().embeddings.create({ model: EMBEDDING_MODEL, input: texts, dimensions: 256 });
  return res.data.map((d) => d.embedding);
}
