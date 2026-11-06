import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { limits, models } from "./config";

let client: Anthropic | null = null;
const claude = () => (client ??= new Anthropic({ maxRetries: 1, timeout: limits.timeoutMs }));

/** Streams Claude's answer as plain text pieces. Throws before the first piece if the request fails. */
export async function streamAnswer(system: string, question: string): Promise<AsyncIterable<string>> {
  const stream = await claude().messages.create({
    model: models.claude,
    max_tokens: limits.maxAnswerTokens,
    stream: true,
    system,
    messages: [{ role: "user", content: question }],
  });
  return (async function* () {
    for await (const ev of stream) {
      if (ev.type === "content_block_delta" && ev.delta.type === "text_delta") yield ev.delta.text;
    }
  })();
}
