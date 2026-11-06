import { Chat } from "@/components/chat";
import { hasOpenAI } from "@/lib/vectors";

export const dynamic = "force-dynamic";

export default function Home() {
  return (
    <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <header className="mb-8 flex flex-wrap items-center gap-3">
        <span className="grid h-10 w-10 place-items-center rounded-xl bg-brand font-bold text-white">D</span>
        <div>
          <h1 className="text-xl font-bold">DocChat</h1>
          <p className="text-sm text-muted">Chat with your PDF. Every answer shows the page it came from.</p>
        </div>
        <span className={`ml-auto rounded-full border px-3 py-1 text-xs font-semibold ${hasOpenAI() ? "border-ok/40 text-ok" : "border-amber-400/40 text-amber-300"}`}>
          {hasOpenAI() ? "OpenAI mode" : "Demo mode: no API key, keyword search"}
        </span>
      </header>
      <Chat />
    </main>
  );
}
