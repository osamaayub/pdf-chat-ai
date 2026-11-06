import { z } from "zod";
import { buildContext, NOT_FOUND, quoteAnswer, SYSTEM_PROMPT } from "@/lib/answer";
import { topChunks, unpackVectors, type StoredChunk } from "@/lib/store";
import { CHAT_MODEL, embed, hasOpenAI, openai } from "@/lib/vectors";

const Body = z.object({
  question: z.string().trim().min(2).max(500),
  chunks: z.array(z.object({ page: z.number().int().min(1), text: z.string().max(2000) })).min(1).max(400),
  vectors: z.string().max(2_000_000).nullable(),
});

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Ask a question between 2 and 500 characters." }, { status: 400 });
  const { question, chunks: raw, vectors } = parsed.data;

  // The browser sent the chunks back. Rebuild their vectors: unpack OpenAI's, or recompute demo ones.
  let chunks: StoredChunk[];
  try {
    const vecs = hasOpenAI() ? (vectors ? unpackVectors(vectors, raw.length) : null) : await embed(raw.map((c) => c.text));
    if (!vecs) return Response.json({ error: "Upload the PDF again." }, { status: 409 });
    chunks = raw.map((c, i) => ({ id: i, ...c, vector: vecs[i] }));
  } catch {
    return Response.json({ error: "Upload the PDF again." }, { status: 409 });
  }

  // 4. Find the chunks closest to the question.
  const [q] = await embed([question]);
  const found = topChunks(chunks, q, 4);
  const encoder = new TextEncoder();

  if (!hasOpenAI()) {
    const a = quoteAnswer(question, found, chunks);
    return new Response(streamWords(a.text), { headers: { "X-Sources": JSON.stringify(a.pages), "Content-Type": "text/plain; charset=utf-8" } });
  }

  // 5. Send only those chunks to the model, with a strict prompt, and stream the answer back.
  const stream = await openai().chat.completions.create({
    model: CHAT_MODEL,
    stream: true,
    temperature: 0,
    messages: [
      { role: "system", content: `${SYSTEM_PROMPT}\n\nContext:\n${buildContext(found)}` },
      { role: "user", content: question },
    ],
  });
  const pages = [...new Set(found.map((c) => c.page))];
  const body = new ReadableStream({
    async start(ctl) {
      let text = "";
      for await (const part of stream) {
        const t = part.choices[0]?.delta?.content ?? "";
        text += t;
        ctl.enqueue(encoder.encode(t));
      }
      if (!text) ctl.enqueue(encoder.encode(NOT_FOUND));
      ctl.close();
    },
  });
  return new Response(body, { headers: { "X-Sources": JSON.stringify(pages), "Content-Type": "text/plain; charset=utf-8" } });
}

/** Streams a fixed answer word by word, so demo mode looks and behaves like the real stream. */
function streamWords(text: string) {
  const encoder = new TextEncoder();
  const parts = text.split(/(\s+)/);
  return new ReadableStream({
    async start(ctl) {
      for (const p of parts) {
        ctl.enqueue(encoder.encode(p));
        await new Promise((r) => setTimeout(r, 35));
      }
      ctl.close();
    },
  });
}
