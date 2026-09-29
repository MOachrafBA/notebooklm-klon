"use client";

import { useEffect, useState } from "react";
import { AccessGate } from "@/app/components/AccessGate";
import { ChatPanel } from "@/app/components/ChatPanel";
import { Sidebar } from "@/app/components/Sidebar";
import type { DocumentSource } from "@/lib/rag/types";

interface IngestResponse { documentId: string; content: string; duplicate?: boolean }
interface DocumentSourcesResponse { sources: DocumentSource[] }
interface AccessStatusResponse { configured: boolean; authenticated: boolean }
interface YouTubeIngestResponse {
  documentId: string;
  name: string;
  type: "youtube";
  sourceUrl: string;
  videoId: string;
}

type AccessStatus = "checking" | "ready" | "login" | "unconfigured" | "error";

function isAccessStatusResponse(value: unknown): value is AccessStatusResponse {
  return (
    typeof value === "object" &&
    value !== null &&
    "configured" in value &&
    typeof value.configured === "boolean" &&
    "authenticated" in value &&
    typeof value.authenticated === "boolean"
  );
}

function isDocumentSourcesResponse(value: unknown): value is DocumentSourcesResponse {
  if (typeof value !== "object" || value === null || !("sources" in value)) {
    return false;
  }

  const sources = value.sources;
  return (
    Array.isArray(sources) &&
    sources.every(
      (source) =>
        typeof source === "object" &&
        source !== null &&
        "id" in source &&
        typeof source.id === "string" &&
        "name" in source &&
        typeof source.name === "string" &&
        "type" in source &&
        (source.type === "text" || source.type === "pdf" || source.type === "youtube") &&
        "content" in source &&
        typeof source.content === "string",
    )
  );
}

function isIngestResponse(value: unknown): value is IngestResponse {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const response = value as { documentId?: unknown; content?: unknown };
  return (
    typeof response.documentId === "string" &&
    response.documentId.length > 0 &&
    typeof response.content === "string" &&
    response.content.trim().length > 0
  );
}

function isYouTubeIngestResponse(value: unknown): value is YouTubeIngestResponse {
  if (typeof value !== "object" || value === null) return false;
  const response = value as Partial<YouTubeIngestResponse>;
  return (
    typeof response.documentId === "string" &&
    typeof response.name === "string" &&
    response.type === "youtube" &&
    typeof response.sourceUrl === "string" &&
    typeof response.videoId === "string"
  );
}

function getApiError(value: unknown, fallback: string): string {
  if (typeof value !== "object" || value === null) {
    return fallback;
  }

  const error = "error" in value && typeof value.error === "string" ? value.error : fallback;
  const details = "details" in value && typeof value.details === "string" ? value.details : null;
  return details ? `${error} (${details})` : error;
}

export default function Home() {
  const [sources, setSources] = useState<DocumentSource[]>([]);
  const [isSourcesLoading, setIsSourcesLoading] = useState(true);
  const [sourceLoadError, setSourceLoadError] = useState<string | null>(null);
  const [accessStatus, setAccessStatus] = useState<AccessStatus>("checking");

  useEffect(() => {
    let isMounted = true;

    async function checkAccess() {
      try {
        const response = await fetch("/api/auth", { cache: "no-store" });
        const payload: unknown = await response.json();
        if (!response.ok || !isAccessStatusResponse(payload)) {
          throw new Error("Der Demo-Zugang konnte nicht geprüft werden.");
        }
        if (isMounted) {
          setAccessStatus(
            !payload.configured
              ? "unconfigured"
              : payload.authenticated
                ? "ready"
                : "login",
          );
        }
      } catch (error) {
        console.error("Checking demo access failed:", error);
        if (isMounted) {
          setAccessStatus("error");
          setSourceLoadError(
            error instanceof Error ? error.message : "Der Demo-Zugang konnte nicht geprüft werden.",
          );
        }
      }
    }

    void checkAccess();
    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (accessStatus !== "ready") {
      return;
    }
    let isMounted = true;

    async function loadSavedSources() {
      try {
        const response = await fetch("/api/documents");
        const payload: unknown = await response.json();
        if (!response.ok) {
          throw new Error(getApiError(payload, "Gespeicherte Quellen konnten nicht geladen werden."));
        }
        if (!isDocumentSourcesResponse(payload)) {
          throw new Error("Die gespeicherten Quellen haben ein ungültiges Format.");
        }
        if (isMounted) {
          setSources((current) => {
            const merged = new Map(payload.sources.map((source) => [source.id, source]));
            for (const source of current) {
              if (merged.has(source.id)) {
                merged.set(source.id, source);
              }
            }
            return [...merged.values()];
          });
          setSourceLoadError(null);
        }
      } catch (error) {
        console.error("Loading saved sources failed:", error);
        if (isMounted) {
          setSourceLoadError(
            error instanceof Error ? error.message : "Gespeicherte Quellen konnten nicht geladen werden.",
          );
        }
      } finally {
        if (isMounted) {
          setIsSourcesLoading(false);
        }
      }
    }

    void loadSavedSources();
    return () => {
      isMounted = false;
    };
  }, [accessStatus]);

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
      throw new Error(getApiError(payload, "Die Quelle konnte nicht gespeichert werden."));
    }

    if (!isIngestResponse(payload)) {
      throw new Error("Die Datei enthält keinen lesbaren Text.");
    }
    setSources((current) => [
      ...current.filter((existing) => existing.id !== payload.documentId),
      { ...source, id: payload.documentId, content: payload.content },
    ]);
    setSourceLoadError(null);
  }

  async function addYouTubeSource(url: string) {
    const response = await fetch("/api/documents/ingest-youtube", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ url }),
    });
    const payload: unknown = await response.json();
    if (!response.ok || !isYouTubeIngestResponse(payload)) {
      throw new Error(getApiError(payload, "Die YouTube-Quelle konnte nicht gespeichert werden."));
    }
    setSources((current) => [
      ...current.filter((source) => source.id !== payload.documentId),
      {
        id: payload.documentId,
        name: payload.name,
        type: payload.type,
        content: "",
        sourceUrl: payload.sourceUrl,
        videoId: payload.videoId,
      },
    ]);
    setSourceLoadError(null);
  }

  function hideSourceFromContext(sourceId: string) {
    setSources((current) => current.filter((source) => source.id !== sourceId));
  }

  async function logout() {
    const response = await fetch("/api/auth", { method: "DELETE" });
    if (!response.ok) {
      throw new Error("Die Abmeldung ist fehlgeschlagen.");
    }
    setSources([]);
    setIsSourcesLoading(true);
    setAccessStatus("login");
  }

  function handleAuthenticated() {
    setIsSourcesLoading(true);
    setAccessStatus("ready");
  }

  if (accessStatus === "checking") {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#f8f9fc] text-sm text-slate-500">
        Demo-Zugang wird geprüft …
      </main>
    );
  }

  if (accessStatus === "unconfigured") {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#f8f9fc] px-5 text-center text-sm text-slate-600">
        Der Demo-Zugang ist nicht konfiguriert. Setze `SOURCE_ACCESS_PASSWORD` in den Server-Umgebungsvariablen.
      </main>
    );
  }

  if (accessStatus === "error") {
    return (
      <main role="alert" className="flex min-h-screen items-center justify-center bg-[#f8f9fc] px-5 text-center text-sm text-rose-600">
        {sourceLoadError ?? "Der Demo-Zugang konnte nicht geprüft werden."}
      </main>
    );
  }

  if (accessStatus === "login") {
    return <AccessGate onAuthenticated={handleAuthenticated} />;
  }

  return (
    <main className="flex min-h-screen flex-col bg-white md:flex-row">
      <Sidebar
        sources={sources}
        isSourcesLoading={isSourcesLoading}
        sourceLoadError={sourceLoadError}
        onLogout={logout}
        onSourceAdded={addSource}
        onYouTubeAdded={addYouTubeSource}
        onSourceHidden={hideSourceFromContext}
      />
      <ChatPanel sources={sources} />
    </main>
  );
}
