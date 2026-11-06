import "server-only";
import OpenAI from "openai";
import { limits, models } from "./config";

let client: OpenAI | null = null;
const openai = () => (client ??= new OpenAI({ maxRetries: 1, timeout: limits.timeoutMs }));

/** Turns texts into vectors. 256 dimensions keeps them small enough to send to the browser and back. */
export async function embed(texts: string[]): Promise<number[][]> {
  const res = await openai().embeddings.create({ model: models.embedding, input: texts, dimensions: limits.embeddingDims });
  return res.data.map((d) => d.embedding);
}

/** Streams an answer as plain text pieces. Throws before the first piece if the request fails. */
export async function streamAnswer(system: string, question: string): Promise<AsyncIterable<string>> {
  const stream = await openai().chat.completions.create({
    model: models.openaiChat,
    stream: true,
    temperature: 0,
    max_tokens: limits.maxAnswerTokens,
    messages: [
      { role: "system", content: system },
      { role: "user", content: question },
    ],
  });
  return (async function* () {
    for await (const part of stream) {
      const t = part.choices[0]?.delta?.content;
      if (t) yield t;
    }
  })();
}
