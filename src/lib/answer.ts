import { words } from "./vectors";

export const SYSTEM_PROMPT = `You answer questions about one document.
Use ONLY the context below. If the answer is not in the context, reply exactly: "I don't know. That isn't in this document."
Keep answers short and cite pages like (page 2).`;

export const NOT_FOUND = "I don't know. That isn't in this document.";

export const buildContext = (chunks: { page: number; text: string }[]) =>
  chunks.map((c) => `[page ${c.page}] ${c.text}`).join("\n\n");

type Passage = { page: number; text: string };

/**
 * Demo mode: quote the one sentence that best matches the question. No AI call, nothing made up.
 * Rare words count more than common ones (like "studio" in a studio handbook), the idea behind BM25.
 */
export function quoteAnswer(question: string, found: Passage[], all: Passage[] = found) {
  const q = new Set(words(question));
  const df = new Map<string, number>();
  for (const c of all) for (const w of new Set(words(c.text))) df.set(w, (df.get(w) ?? 0) + 1);
  const weight = (w: string) => Math.log(1 + all.length / (df.get(w) ?? all.length));

  let best = { sentence: "", page: 0, score: 0, hits: 0 };
  for (const c of found) {
    for (const s of c.text.split(/(?<=[.!?])\s+/)) {
      const matched = [...new Set(words(s))].filter((w) => q.has(w));
      const score = matched.reduce((sum, w) => sum + weight(w), 0);
      if (score > best.score) best = { sentence: s, page: c.page, score, hits: matched.length };
    }
  }
  if (best.hits < Math.min(2, q.size)) return { text: NOT_FOUND, pages: [] as number[] };
  return { text: `${best.sentence} (page ${best.page})`, pages: [best.page] };
}
