import { z } from "zod";
import { streamResponse, jsonError } from "@/lib/http";
import { answer } from "@/lib/rag/pipeline";
import { NOT_FOUND } from "@/lib/rag/prompt";
import { guard } from "@/lib/security/guard";

const Body = z
  .object({
    question: z.string().trim().min(2).max(500),
    chunks: z.array(z.object({ page: z.number().int().min(1).max(10_000), text: z.string().max(2000) })).min(1).max(400),
    vectors: z.string().max(2_000_000).nullable(),
    mode: z.enum(["openai", "anthropic", "demo"]).default("demo"),
  })
  .refine((b) => b.chunks.reduce((n, c) => n + c.text.length, 0) <= 400_000, "Document too large");

/** POST a question plus the PDF's chunks. Streams the answer; X-Sources and X-Mode say where it came from. */
export async function POST(req: Request) {
  const blocked = guard(req, "chat");
  if (blocked) return blocked;

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return jsonError("Ask a question between 2 and 500 characters.", 400);
  const { question, chunks, vectors, mode } = parsed.data;

  try {
    const a = await answer(question, chunks, vectors, mode);
    return streamResponse(a.stream, { "X-Sources": JSON.stringify(a.pages), "X-Mode": a.mode }, NOT_FOUND);
  } catch (err) {
    console.error("chat failed:", err instanceof Error ? err.message : err);
    return jsonError("Something went wrong. Upload the PDF again.", 500);
  }
}
