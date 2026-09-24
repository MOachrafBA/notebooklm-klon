"use client";

import { useState } from "react";
import { ChatPanel } from "@/app/components/ChatPanel";
import { Sidebar } from "@/app/components/Sidebar";
import type { DocumentSource } from "@/lib/rag/types";

interface IngestResponse {
  content: string;
}

function isIngestResponse(value: unknown): value is IngestResponse {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const response = value as { content?: unknown };
  return typeof response.content === "string" && response.content.trim().length > 0;
}

export default function Home() {
  const [sources, setSources] = useState<DocumentSource[]>([]);

  async function addSource(
    source: Pick<DocumentSource, "id" | "name" | "type">,
    file: File,
  ) {
    const formData = new FormData();
    formData.append("id", source.id);
    formData.append("name", source.name);
    formData.append("type", source.type);
    formData.append("file", file);

    const response = await fetch("/api/documents/ingest", {
      method: "POST",
      body: formData,
    });
    const payload: unknown = await response.json();
    if (!response.ok) {
      const message =
        typeof payload === "object" &&
        payload !== null &&
        "error" in payload &&
        typeof payload.error === "string"
          ? payload.error
          : "Die Quelle konnte nicht gespeichert werden.";
      throw new Error(message);
    }
    if (!isIngestResponse(payload)) {
      throw new Error("Die Datei enthält keinen lesbaren Text.");
    }
    setSources((current) => [...current, { ...source, content: payload.content }]);
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
