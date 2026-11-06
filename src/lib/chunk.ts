export type Page = { page: number; text: string };
export type Chunk = { id: number; page: number; text: string };

/**
 * Splits each page into chunks of about `size` characters that overlap by `overlap`,
 * so an answer that sits on a chunk boundary still appears whole in one chunk.
 * Chunks never cross pages, so every chunk can cite the page it came from.
 */
export function splitIntoChunks(pages: Page[], size = 800, overlap = 150): Chunk[] {
  const chunks: Chunk[] = [];
  for (const { page, text } of pages) {
    // A short line with no full stop, followed by a capitalised line, is a heading: end it like a sentence.
    const clean = text.replace(/^([^\n.!?]{1,60})\n(?=[A-Z])/gm, "$1. ").replace(/\s+/g, " ").trim();
    let start = 0;
    while (start < clean.length) {
      let end = Math.min(start + size, clean.length);
      // End on a sentence or word boundary when we can.
      if (end < clean.length) {
        const dot = clean.lastIndexOf(". ", end);
        const space = clean.lastIndexOf(" ", end);
        end = dot > start + size / 2 ? dot + 1 : space > start ? space : end;
      }
      chunks.push({ id: chunks.length, page, text: clean.slice(start, end).trim() });
      if (end >= clean.length) break;
      start = Math.max(end - overlap, start + 1);
    }
  }
  return chunks;
}
