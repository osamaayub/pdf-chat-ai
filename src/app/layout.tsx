import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "DocChat: chat with your PDF",
  description: "Ask questions about a PDF and get answers with the page they came from. Next.js, OpenAI embeddings and RAG.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="min-h-screen font-sans antialiased">{children}</body>
    </html>
  );
}
