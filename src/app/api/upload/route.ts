import { extractText, getDocumentProxy } from "unpdf";
import { splitIntoChunks } from "@/lib/chunk";
import { packVectors } from "@/lib/store";
import { embed, hasOpenAI } from "@/lib/vectors";

// Vercel functions accept request bodies up to 4.5 MB.
const MAX_BYTES = 4 * 1024 * 1024;
const MAX_CHUNKS = 400;

export async function POST(req: Request) {
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File) || file.type !== "application/pdf") return Response.json({ error: "Upload a PDF file." }, { status: 400 });
  if (file.size > MAX_BYTES) return Response.json({ error: "PDF must be 4 MB or smaller." }, { status: 413 });

  // 1. Read the text of every page.
  const pdf = await getDocumentProxy(new Uint8Array(await file.arrayBuffer()));
  const { text } = await extractText(pdf, { mergePages: false });
  const pages = text.map((t, i) => ({ page: i + 1, text: t }));

  // 2. Split into overlapping chunks.
  const chunks = splitIntoChunks(pages);
  if (chunks.length === 0) return Response.json({ error: "No text found. Is this a scanned PDF?" }, { status: 422 });
  if (chunks.length > MAX_CHUNKS) return Response.json({ error: "This PDF is too long for the demo. Try one under about 120 pages." }, { status: 413 });

  // 3. With OpenAI, turn each chunk into a vector once, here. Demo mode rebuilds its keyword vectors on each question.
  const vectors = hasOpenAI() ? packVectors(await embed(chunks.map((c) => c.text))) : null;

  return Response.json({ name: file.name, pages: pages.length, chunks: chunks.map(({ page, text }) => ({ page, text })), vectors, mode: hasOpenAI() ? "openai" : "demo" });
}
