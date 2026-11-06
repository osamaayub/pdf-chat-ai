import { ingest, readPdf } from "@/lib/rag/pipeline";
import { guard } from "@/lib/security/guard";
import { jsonError } from "@/lib/http";

// Vercel functions accept request bodies up to 4.5 MB.
const MAX_BYTES = 4 * 1024 * 1024;
const MAX_PAGES = 120;
const MAX_CHUNKS = 400;

/** POST a PDF as form data ("file"). Returns its chunks (and vectors with OpenAI) for the browser to keep. */
export async function POST(req: Request) {
  const blocked = guard(req, "upload");
  if (blocked) return blocked;

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File) || file.type !== "application/pdf") return jsonError("Upload a PDF file.", 400);
  if (file.size > MAX_BYTES) return jsonError("PDF must be 4 MB or smaller.", 413);

  const bytes = new Uint8Array(await file.arrayBuffer());
  // Check the real file signature, not just the name or the type the browser sent.
  if (new TextDecoder().decode(bytes.subarray(0, 5)) !== "%PDF-") return jsonError("That file is not a real PDF.", 400);

  try {
    const pages = await readPdf(bytes); // the file is never saved anywhere
    if (pages.length > MAX_PAGES) return jsonError(`PDF must have ${MAX_PAGES} pages or fewer.`, 413);
    const doc = await ingest(pages);
    if (doc.chunks.length === 0) return jsonError("No text found. Is this a scanned PDF?", 422);
    if (doc.chunks.length > MAX_CHUNKS) return jsonError("This PDF has too much text. Try a shorter one.", 413);
    const name = file.name.replace(/[^\w.\- ]/g, "_").slice(0, 100);
    return Response.json({ name, ...doc });
  } catch (err) {
    console.error("upload failed:", err instanceof Error ? err.message : err);
    return jsonError("Could not read this PDF. Try another file.", 500);
  }
}
