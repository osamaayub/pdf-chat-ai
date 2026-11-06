import { z } from "zod";
import { buildContext, NOT_FOUND, quoteAnswer, SYSTEM_PROMPT } from "@/lib/answer";
import { guard } from "@/lib/guard";
import { topChunks, unpackVectors, type StoredChunk } from "@/lib/store";
import { bm25, keywordVector } from "@/lib/text";
import { CHAT_MODEL, CLAUDE_MODEL, claude, embed, hasOpenAI, openai, provider } from "@/lib/vectors";

const Body = z.object({
  question: z.string().trim().min(2).max(500),
  chunks: z.array(z.object({ page: z.number().int().min(1), text: z.string().max(2000) })).min(1).max(400),
  vectors: z.string().max(2_000_000).nullable(),
}).refine((b) => b.chunks.reduce((n, c) => n + c.text.length, 0) <= 400_000, "Document too large");

export async function POST(req: Request) {
  const blocked = guard(req, "chat");
  if (blocked) return blocked;

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Ask a question between 2 and 500 characters." }, { status: 400 });
  const { question, chunks: raw, vectors } = parsed.data;

  // Claude: BM25 keyword search picks the chunks, Claude writes the answer.
  if (provider() === "anthropic") return answerWithClaude(question, raw);

  // OpenAI mode only when the server has a key AND this PDF was embedded with it. Otherwise demo mode.
  const ai = hasOpenAI() && vectors !== null;

  // The browser sent the chunks back. Rebuild their vectors: unpack OpenAI's, or recompute demo ones.
  let chunks: StoredChunk[];
  try {
    const vecs = ai ? unpackVectors(vectors!, raw.length) : raw.map((c) => keywordVector(c.text));
    chunks = raw.map((c, i) => ({ id: i, ...c, vector: vecs[i] }));
  } catch {
    return Response.json({ error: "Upload the PDF again." }, { status: 409 });
  }

  // 4. Find the chunks closest to the question.
  let q: number[];
  try {
    [q] = ai ? await embed([question]) : [keywordVector(question)];
  } catch (err) {
    console.error("embedding failed", err);
    return Response.json({ error: "The AI service didn't answer. Try again in a minute." }, { status: 502 });
  }
  const found = topChunks(chunks, q, 4);
  const encoder = new TextEncoder();

  if (!ai) {
    const a = quoteAnswer(question, found, chunks);
    return new Response(streamWords(a.text), { headers: { "X-Sources": JSON.stringify(a.pages), "Content-Type": "text/plain; charset=utf-8" } });
  }

  // 5. Send only those chunks to the model, with a strict prompt, and stream the answer back.
  let stream;
  try {
    stream = await openai().chat.completions.create({
      model: CHAT_MODEL,
      stream: true,
      temperature: 0,
      max_tokens: 500, // caps the cost of every answer
      messages: [
        { role: "system", content: `${SYSTEM_PROMPT}\n\nContext:\n${buildContext(found)}` },
        { role: "user", content: question },
      ],
    });
  } catch (err) {
    console.error("openai failed", err instanceof Error ? err.message : err);
    return Response.json({ error: "The AI service didn't answer. Try again in a minute." }, { status: 502 });
  }
  const pages = [...new Set(found.map((c) => c.page))];
  const body = new ReadableStream({
    async start(ctl) {
      let text = "";
      try {
        for await (const part of stream) {
          const t = part.choices[0]?.delta?.content ?? "";
          text += t;
          ctl.enqueue(encoder.encode(t));
        }
      } catch (err) {
        console.error("stream failed", err);
        if (!text) ctl.enqueue(encoder.encode("The answer was cut off. Try again."));
      }
      if (!text) ctl.enqueue(encoder.encode(NOT_FOUND));
      ctl.close();
    },
  });
  return new Response(body, { headers: { "X-Sources": JSON.stringify(pages), "Content-Type": "text/plain; charset=utf-8" } });
}

async function answerWithClaude(question: string, raw: { page: number; text: string }[]) {
  const found = bm25(raw, question, 6);
  const pages = [...new Set(found.filter((c) => c.score > 0).map((c) => c.page))];
  let stream;
  try {
    stream = await claude().messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 500, // caps the cost of every answer
      stream: true,
      system: `${SYSTEM_PROMPT}\n\nContext:\n${buildContext(found)}`,
      messages: [{ role: "user", content: question }],
    });
  } catch (err) {
    console.error("claude failed", err instanceof Error ? err.message : err);
    return Response.json({ error: "The AI service didn't answer. Try again in a minute." }, { status: 502 });
  }
  const encoder = new TextEncoder();
  const body = new ReadableStream({
    async start(ctl) {
      let text = "";
      try {
        for await (const ev of stream) {
          if (ev.type === "content_block_delta" && ev.delta.type === "text_delta") {
            text += ev.delta.text;
            ctl.enqueue(encoder.encode(ev.delta.text));
          }
        }
      } catch (err) {
        console.error("claude stream failed", err instanceof Error ? err.message : err);
        if (!text) ctl.enqueue(encoder.encode("The answer was cut off. Try again."));
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
