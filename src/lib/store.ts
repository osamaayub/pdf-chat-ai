import type { Chunk } from "./chunk";
import { cosine } from "./vectors";

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
