import { extractText, getDocumentProxy } from "unpdf";
import { splitIntoChunks } from "@/lib/chunk";
import { guard } from "@/lib/guard";
import { packVectors } from "@/lib/store";
import { embed, hasOpenAI } from "@/lib/vectors";

// Vercel functions accept request bodies up to 4.5 MB.
const MAX_BYTES = 4 * 1024 * 1024;
const MAX_PAGES = 120;
const MAX_CHUNKS = 400;

export async function POST(req: Request) {
  const blocked = guard(req, "upload");
  if (blocked) return blocked;

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File) || file.type !== "application/pdf") return Response.json({ error: "Upload a PDF file." }, { status: 400 });
  if (file.size > MAX_BYTES) return Response.json({ error: "PDF must be 4 MB or smaller." }, { status: 413 });

  const bytes = new Uint8Array(await file.arrayBuffer());
  // Check the real file signature, not just the name or the type the browser sent.
  if (new TextDecoder().decode(bytes.subarray(0, 5)) !== "%PDF-") return Response.json({ error: "That file is not a real PDF." }, { status: 400 });

  try {
    // 1. Read the text of every page. The file is never saved anywhere.
    const pdf = await getDocumentProxy(bytes);
    if (pdf.numPages > MAX_PAGES) return Response.json({ error: `PDF must have ${MAX_PAGES} pages or fewer.` }, { status: 413 });
    const { text } = await extractText(pdf, { mergePages: false });
    const pages = text.map((t, i) => ({ page: i + 1, text: t }));

    // 2. Split into overlapping chunks.
    const chunks = splitIntoChunks(pages);
    if (chunks.length === 0) return Response.json({ error: "No text found. Is this a scanned PDF?" }, { status: 422 });
    if (chunks.length > MAX_CHUNKS) return Response.json({ error: "This PDF has too much text. Try a shorter one." }, { status: 413 });

    // 3. With OpenAI, turn each chunk into a vector once, here. Demo mode rebuilds its keyword vectors on each question.
    const vectors = hasOpenAI() ? packVectors(await embed(chunks.map((c) => c.text))) : null;
    const name = file.name.replace(/[^\w.\- ]/g, "_").slice(0, 100);
    return Response.json({ name, pages: pages.length, chunks: chunks.map(({ page, text }) => ({ page, text })), vectors, mode: hasOpenAI() ? "openai" : "demo" });
  } catch (err) {
    console.error("upload failed", err);
    return Response.json({ error: "Could not read this PDF. Try another file." }, { status: 500 });
  }
}
