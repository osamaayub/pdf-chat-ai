import type { Chunk } from "./chunk";

// Pure search helpers: no network, no keys. Safe to use anywhere, easy to test.

const STOP = new Set("a an and are as at be by can do does for from has have how i if in is it its me my of on or our so that the their them there this to was we what when where which who why will with you your".split(" "));

export const words = (text: string) =>
  text.toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(" ").filter((w) => w.length > 1 && !STOP.has(w)).map((w) => w.replace(/(ies|es|s)$/, ""));

/** Demo-mode vector: a hashed bag of words. No API key needed, but it only matches on shared words. */
export function keywordVector(text: string, dims = 512): number[] {
  const v = new Array<number>(dims).fill(0);
  for (const w of words(text)) {
    let h = 2166136261;
    for (const ch of w) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
    v[Math.abs(h) % dims] += 1;
  }
  const n = Math.hypot(...v) || 1;
  return v.map((x) => x / n);
}

export const cosine = (a: number[], b: number[]) => a.reduce((s, x, i) => s + x * (b[i] ?? 0), 0);

/**
 * BM25 keyword ranking: the classic search-engine formula. Rare words that appear in a chunk
 * count more than common ones, and long chunks don't win just by being long.
 * Used with Claude, because Anthropic has no embeddings API.
 */
export function bm25<T extends { text: string }>(chunks: T[], query: string, k = 6, k1 = 1.2, b = 0.75) {
  const docs = chunks.map((c) => words(c.text));
  const avg = docs.reduce((n, d) => n + d.length, 0) / (docs.length || 1);
  const df = new Map<string, number>();
  for (const d of docs) for (const w of new Set(d)) df.set(w, (df.get(w) ?? 0) + 1);
  const q = [...new Set(words(query))];
  return chunks
    .map((c, i) => {
      const d = docs[i];
      const tf = new Map<string, number>();
      for (const w of d) tf.set(w, (tf.get(w) ?? 0) + 1);
      let score = 0;
      for (const w of q) {
        const f = tf.get(w) ?? 0;
        if (!f) continue;
        const idf = Math.log(1 + (docs.length - (df.get(w) ?? 0) + 0.5) / ((df.get(w) ?? 0) + 0.5));
        score += idf * ((f * (k1 + 1)) / (f + k1 * (1 - b + (b * d.length) / avg)));
      }
      return { ...c, score };
    })
    .sort((a, b2) => b2.score - a.score)
    .slice(0, k);
}


export type StoredChunk = Chunk & { vector: number[] };

/**
 * No server-side store. On Vercel every request can land on a different server,
 * so memory on the server is not shared. The browser keeps the chunks (and, with
 * OpenAI, their vectors packed as base64) and sends them with each question.
 * For a real product, save them in Postgres with pgvector instead.
 */
export function packVectors(vectors: number[][]): string {
  const flat = new Float32Array(vectors.flat());
  return Buffer.from(flat.buffer).toString("base64");
}

export function unpackVectors(packed: string, count: number): number[][] {
  const buf = Buffer.from(packed, "base64");
  const flat = new Float32Array(buf.buffer, buf.byteOffset, Math.floor(buf.byteLength / 4));
  const dims = count ? flat.length / count : 0;
  if (!Number.isInteger(dims) || dims === 0) throw new Error("Bad vectors");
  return Array.from({ length: count }, (_, i) => Array.from(flat.subarray(i * dims, (i + 1) * dims)));
}

/** The k chunks closest to the question vector, best first. */
export function topChunks(chunks: StoredChunk[], q: number[], k = 4) {
  return chunks
    .map((c) => ({ ...c, score: cosine(c.vector, q) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, k);
}
