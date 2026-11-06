import "server-only";
import { extractText, getDocumentProxy } from "unpdf";
import * as anthropic from "@/lib/ai/anthropic";
import { available, fallbackChain, preferredMode, type Mode } from "@/lib/ai/config";
import * as openai from "@/lib/ai/openai";
import { splitIntoChunks, type Page } from "./chunk";
import { buildContext, NOT_FOUND, quoteAnswer, SYSTEM_PROMPT } from "./prompt";
import { bm25, keywordVector, packVectors, topChunks, unpackVectors } from "./search";

/**
 * The whole RAG flow in one place:
 *   ingest():  1. read the PDF  2. split into chunks  3. embed (OpenAI only)
 *   answer():  4. retrieve the best chunks  5. answer from them only, streamed
 * Route handlers stay thin: they check the request, call these, and send the result.
 */

export type Passage = { page: number; text: string };
export type IngestResult = { pages: number; chunks: Passage[]; vectors: string | null; mode: Mode; notice?: string };
export type Answer = { mode: Mode; pages: number[]; stream: AsyncIterable<string> };

const errorText = (err: unknown) => (err instanceof Error ? err.message : String(err));

export async function readPdf(bytes: Uint8Array): Promise<Page[]> {
  const pdf = await getDocumentProxy(bytes);
  const { text } = await extractText(pdf, { mergePages: false });
  return text.map((t, i) => ({ page: i + 1, text: t }));
}

export async function ingest(pages: Page[]): Promise<IngestResult> {
  const chunks = splitIntoChunks(pages).map(({ page, text }) => ({ page, text }));
  const mode = preferredMode();
  if (mode !== "openai") return { pages: pages.length, chunks, vectors: null, mode };

  try {
    const vectors = packVectors(await openai.embed(chunks.map((c) => c.text)));
    return { pages: pages.length, chunks, vectors, mode: "openai" };
  } catch (err) {
    // No credits, bad key or outage: keep working with the next provider instead of failing the upload.
    const next = available("anthropic") ? "anthropic" : "demo";
    console.error(`embeddings failed, using ${next}:`, errorText(err));
    return {
      pages: pages.length, chunks, vectors: null, mode: next,
      notice: next === "anthropic" ? "OpenAI is unavailable, so this PDF uses Claude with keyword search." : "The AI service is unavailable right now, so this PDF uses demo mode (keyword search).",
    };
  }
}

/** Picks the chunks for a question. OpenAI uses vectors; Claude and demo use keyword ranking. */
async function retrieve(mode: Mode, question: string, chunks: Passage[], vectors: string | null) {
  if (mode === "openai" && vectors) {
    const vecs = unpackVectors(vectors, chunks.length);
    const [q] = await openai.embed([question]);
    return topChunks(chunks.map((c, i) => ({ id: i, ...c, vector: vecs[i] })), q, 4);
  }
  if (mode === "anthropic") return bm25(chunks, question, 6).filter((c) => c.score > 0);
  const q = keywordVector(question);
  return topChunks(chunks.map((c, i) => ({ id: i, ...c, vector: keywordVector(c.text) })), q, 4);
}

export async function answer(question: string, chunks: Passage[], vectors: string | null, requested: Mode): Promise<Answer> {
  // Use the mode the PDF was prepared with if the server can still serve it, then fall back.
  // OpenAI needs the vectors made at upload; without them, Claude (keyword search) is the next best.
  const start: Mode = requested === "openai" && !vectors ? "anthropic" : requested;
  for (const mode of fallbackChain(start)) {
    if (mode === "openai" && !vectors) continue;
    try {
      const found = await retrieve(mode, question, chunks, vectors);
      if (mode === "demo") {
        const a = quoteAnswer(question, found, chunks);
        return { mode, pages: a.pages, stream: typeOut(a.text) };
      }
      if (found.length === 0) return { mode, pages: [], stream: typeOut(NOT_FOUND) };
      const system = `${SYSTEM_PROMPT}\n\nContext:\n${buildContext(found)}`;
      const stream = mode === "openai" ? await openai.streamAnswer(system, question) : await anthropic.streamAnswer(system, question);
      return { mode, pages: [...new Set(found.map((c) => c.page))], stream };
    } catch (err) {
      console.error(`${mode} failed, trying the next provider:`, errorText(err));
    }
  }
  const a = quoteAnswer(question, (await retrieve("demo", question, chunks, null)), chunks);
  return { mode: "demo", pages: a.pages, stream: typeOut(a.text) };
}

/** A fixed answer, streamed word by word so it behaves like a real AI stream. */
async function* typeOut(text: string) {
  for (const part of text.split(/(\s+)/)) {
    yield part;
    await new Promise((r) => setTimeout(r, 35));
  }
}
