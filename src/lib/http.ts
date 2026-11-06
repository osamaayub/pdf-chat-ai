/** Sends an async stream of text pieces as a streaming HTTP response. */
export function streamResponse(pieces: AsyncIterable<string>, headers: Record<string, string>, fallback: string) {
  const encoder = new TextEncoder();
  const body = new ReadableStream({
    async start(ctl) {
      let sent = false;
      try {
        for await (const p of pieces) {
          sent = true;
          ctl.enqueue(encoder.encode(p));
        }
      } catch (err) {
        console.error("stream failed:", err instanceof Error ? err.message : err);
        if (!sent) ctl.enqueue(encoder.encode("The answer was cut off. Try again."));
        sent = true;
      }
      if (!sent) ctl.enqueue(encoder.encode(fallback));
      ctl.close();
    },
  });
  return new Response(body, { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store", ...headers } });
}

export const jsonError = (error: string, status: number, headers?: Record<string, string>) => Response.json({ error }, { status, headers });
