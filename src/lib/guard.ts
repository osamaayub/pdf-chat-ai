import "server-only";
import { createLimiter } from "./rate-limit";

const limiters = {
  upload: createLimiter(10, 60 * 60 * 1000), // 10 PDFs per hour per IP
  chat: createLimiter(30, 10 * 60 * 1000), // 30 questions per 10 minutes per IP
};

const clientIp = (req: Request) => req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";

/**
 * Runs before every API route. Returns an error Response to send, or null to continue.
 * 1. Same-origin only: other websites can't call this API from their pages with your key.
 * 2. Rate limit per IP, so one visitor can't run up your OpenAI bill.
 */
export function guard(req: Request, kind: keyof typeof limiters): Response | null {
  const origin = req.headers.get("origin");
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  let originHost = "";
  try {
    originHost = origin ? new URL(origin).host : "";
  } catch {}
  if (!originHost || originHost !== host) {
    return Response.json({ error: "Requests must come from this site." }, { status: 403 });
  }
  const { ok, retryAfter } = limiters[kind](`${kind}:${clientIp(req)}`);
  if (!ok) {
    return Response.json({ error: `Too many requests. Try again in ${Math.ceil(retryAfter / 60)} min.` }, { status: 429, headers: { "Retry-After": String(retryAfter) } });
  }
  return null;
}
