"use client";

import { useState } from "react";
import { ChatPanel } from "@/app/components/ChatPanel";
import { Sidebar } from "@/app/components/Sidebar";
import type { DocumentSource } from "@/lib/rag/types";

export default function Home() {
  const [sources, setSources] = useState<DocumentSource[]>([]);

  async function addSource(source: DocumentSource) {
    const response = await fetch("/api/documents/ingest", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(source),
    });
    if (!response.ok) {
      throw new Error("Die Quelle konnte nicht gespeichert werden.");
    }
    setSources((current) => [...current, source]);
  }

  function removeSource(sourceId: string) {
    setSources((current) => current.filter((source) => source.id !== sourceId));
  }

  return (
    <main className="flex min-h-screen flex-col bg-white md:flex-row">
      <Sidebar sources={sources} onSourceAdded={addSource} onSourceRemoved={removeSource} />
      <ChatPanel sources={sources} />
    </main>
  );
}
