"use client";

import { useRef, useState } from "react";

type Doc = { name: string; pages: number; chunks: { page: number; text: string }[]; vectors: string | null; mode: "openai" | "demo" };
type Msg = { role: "user" | "ai"; text: string; pages?: number[] };

const pagesIn = (text: string) => [...new Set([...text.matchAll(/page (\d+)/gi)].map((m) => Number(m[1])))];

export function Chat() {
  const [doc, setDoc] = useState<Doc | null>(null);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [busy, setBusy] = useState<"upload" | "answer" | null>(null);
  const [error, setError] = useState("");
  const input = useRef<HTMLInputElement>(null);

  async function upload(file: File) {
    setError("");
    setBusy("upload");
    const form = new FormData();
    form.append("file", file);
    const res = await fetch("/api/upload", { method: "POST", body: form });
    const data = await res.json().catch(() => ({ error: "Upload failed. Try a smaller PDF." }));
    setBusy(null);
    if (!res.ok) return setError(data.error);
    setDoc(data);
    setMsgs([]);
  }

  async function ask(question: string) {
    if (!doc || !question.trim()) return;
    setError("");
    setBusy("answer");
    setMsgs((m) => [...m, { role: "user", text: question }, { role: "ai", text: "" }]);
    const res = await fetch("/api/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question, chunks: doc.chunks, vectors: doc.vectors }) });
    if (!res.ok || !res.body) {
      setBusy(null);
      setMsgs((m) => m.slice(0, -2));
      return setError((await res.json().catch(() => ({}))).error ?? "Something went wrong.");
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let text = "";
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      text += decoder.decode(value, { stream: true });
      setMsgs((m) => [...m.slice(0, -1), { role: "ai", text }]);
    }
    setMsgs((m) => [...m.slice(0, -1), { role: "ai", text, pages: pagesIn(text) }]);
    setBusy(null);
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
      <section className="rounded-2xl border border-line bg-panel p-5">
        <h2 className="font-semibold">1. Upload a PDF</h2>
        <label className="mt-4 flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed border-line px-4 py-8 text-center hover:border-brand">
          <span className="text-3xl" aria-hidden>📄</span>
          <span className="font-medium">{busy === "upload" ? "Reading your PDF..." : "Choose a PDF"}</span>
          <span className="text-xs text-muted">Up to 4 MB</span>
          <input type="file" accept="application/pdf" className="sr-only" data-testid="file" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
        </label>
        {doc && (
          <dl className="mt-5 space-y-2 text-sm" data-testid="doc-info">
            <div className="flex justify-between gap-3"><dt className="text-muted">File</dt><dd className="truncate font-medium">{doc.name}</dd></div>
            <div className="flex justify-between"><dt className="text-muted">Pages</dt><dd>{doc.pages}</dd></div>
            <div className="flex justify-between"><dt className="text-muted">Chunks</dt><dd>{doc.chunks.length}</dd></div>
          </dl>
        )}
      </section>

      <section className="flex min-h-[520px] flex-col rounded-2xl border border-line bg-panel">
        <h2 className="border-b border-line px-5 py-4 font-semibold">2. Ask questions</h2>
        <ol className="flex-1 space-y-4 overflow-y-auto p-5" aria-live="polite">
          {!doc && <li className="text-muted">Upload a PDF to start.</li>}
          {doc && msgs.length === 0 && <li className="text-muted">Ask anything about {doc.name}.</li>}
          {msgs.map((m, i) => (
            <li key={i} className={m.role === "user" ? "ml-auto max-w-[80%] rounded-2xl bg-brand px-4 py-2.5 text-white" : "max-w-[85%] rounded-2xl border border-line px-4 py-3"}>
              <p className="whitespace-pre-wrap">{m.text || "..."}</p>
              {m.pages && m.pages.length > 0 && (
                <p className="mt-2 flex flex-wrap gap-2">
                  {m.pages.map((p) => <span key={p} className="rounded-md bg-ok/15 px-2 py-0.5 text-xs font-semibold text-ok">Source: page {p}</span>)}
                </p>
              )}
            </li>
          ))}
        </ol>
        {error && <p className="px-5 pb-2 text-sm text-red-300" role="alert">{error}</p>}
        <form
          className="flex gap-3 border-t border-line p-4"
          onSubmit={(e) => {
            e.preventDefault();
            const q = input.current?.value ?? "";
            if (input.current) input.current.value = "";
            ask(q);
          }}
        >
          <input ref={input} name="q" disabled={!doc || busy !== null} placeholder={doc ? "Ask a question about your PDF" : "Upload a PDF first"} className="flex-1 rounded-xl border border-line bg-bg px-4 py-3 outline-none focus:border-brand disabled:opacity-50" />
          <button disabled={!doc || busy !== null} className="rounded-xl bg-brand px-5 py-3 font-semibold text-white disabled:opacity-50">{busy === "answer" ? "Answering" : "Ask"}</button>
        </form>
      </section>
    </div>
  );
}
