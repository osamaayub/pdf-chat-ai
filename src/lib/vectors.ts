import OpenAI from "openai";

export const EMBEDDING_MODEL = "text-embedding-3-small";
export const CHAT_MODEL = "gpt-4.1-mini";

export const hasOpenAI = () => Boolean(process.env.OPENAI_API_KEY);
let client: OpenAI | null = null;
export const openai = () => (client ??= new OpenAI());

const STOP = new Set("a an and are as at be by can do does for from has have how i if in is it its me my of on or our so that the their them there this to was we what when where which who why will with you your".split(" "));

export const words = (text: string) =>
  text.toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(" ").filter((w) => w.length > 1 && !STOP.has(w)).map((w) => w.replace(/(ies|es|s)$/, ""));

/** Demo-mode vector: a hashed bag of words. No API key needed, but it only matches on shared words. */
function keywordVector(text: string, dims = 512): number[] {
  const v = new Array<number>(dims).fill(0);
  for (const w of words(text)) {
    let h = 2166136261;
    for (const ch of w) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
    v[Math.abs(h) % dims] += 1;
  }
  return normalize(v);
}

function normalize(v: number[]) {
  const n = Math.hypot(...v) || 1;
  return v.map((x) => x / n);
}

export async function embed(texts: string[]): Promise<number[][]> {
  if (!hasOpenAI()) return texts.map((t) => keywordVector(t));
  // 256 dimensions keeps vectors small enough to send back and forth, with little loss in quality.
  const res = await openai().embeddings.create({ model: EMBEDDING_MODEL, input: texts, dimensions: 256 });
  return res.data.map((d) => d.embedding);
}

export const cosine = (a: number[], b: number[]) => a.reduce((s, x, i) => s + x * b[i], 0);
