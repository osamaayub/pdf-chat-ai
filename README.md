# DocChat: AI PDF Chatbot (Next.js + OpenAI, RAG)

Upload a PDF, ask questions, and get short answers with the page they came from. If the answer is not in the document, it says so instead of making something up.

![DocChat answering from a company handbook with a source page tag](docs/screenshot.jpg)

Built step by step on YouTube: **Build an AI PDF Chatbot with Next.js and OpenAI (RAG Tutorial)** on [@osamaayubdev](https://www.youtube.com/@osamaayubdev).

## How it works (RAG in 5 steps)

1. **Read** the PDF page by page with `unpdf` (`src/app/api/upload/route.ts`).
2. **Split** each page into ~800-character chunks with 150 characters of overlap; chunks never cross pages, so each one knows its page (`src/lib/chunk.ts`).
3. **Embed** every chunk with OpenAI `text-embedding-3-small` (`src/lib/vectors.ts`).
4. **Retrieve** the 4 chunks closest to the question by cosine similarity (`src/lib/store.ts`).
5. **Answer** with `gpt-4.1-mini`, a strict "context only, otherwise say I don't know" prompt, temperature 0, streamed to the page with source page tags (`src/app/api/chat/route.ts`, `src/components/chat.tsx`).

### Demo mode (no API key)

Without `OPENAI_API_KEY` the app still runs: it uses a keyword vector instead of embeddings and quotes the best matching sentence instead of calling a model. It is free to try, but it matches words, not meaning. Example: "Does the studio pay for internet?" picks a co-working sentence because it shares "studio" and "pay". Embeddings fix that.

## Run it

```bash
npm install
cp .env.example .env.local   # optional: add OPENAI_API_KEY for real embeddings and answers
npm run dev
```

Open http://localhost:3000 and upload `sample/brightline-handbook.pdf` (a fictional 4-page handbook made for testing).

| Command | What it does |
| --- | --- |
| `npm run dev` | Start the dev server |
| `npm test` | Vitest: chunking, overlap, page tags, the "I don't know" path |
| `npm run typecheck` | TypeScript check |
| `npm run build` | Production build |

## Limits and next steps

- No server-side storage: on Vercel each request can hit a different server, so the browser keeps the chunks (and packed OpenAI vectors) and sends them with each question. For production, store them in Postgres with **pgvector**.
- PDFs up to 4 MB (Vercel's request body limit is 4.5 MB) and about 120 pages.
- One PDF at a time, no login. Add auth and per-user documents.
- Scanned PDFs have no text layer; add OCR to support them.
- Set a monthly spending limit in your OpenAI account before deploying. A public deployment with your key lets anyone spend it, so add rate limiting or login first. Without a key the app runs in free demo mode.

## Stack

Next.js 16 (App Router, Route Handlers), React 19, TypeScript, Tailwind CSS 4, OpenAI SDK, unpdf, Zod, Vitest.

## Author

Built by [Osama Ayub](https://github.com/osamaayub), full-stack developer (React, Next.js, Node.js, AI integration). Need an AI chatbot in your product? [Hire me on Upwork](https://www.upwork.com/freelancers/~01c0c3cf471b66a427).

## License

MIT
