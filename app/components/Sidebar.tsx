"use client";

import { useRef, useState } from "react";
import type { DocumentSource, DocumentType } from "@/lib/rag/types";

const ACCEPTED_FILE_TYPES = ".txt,.md,.pdf";
const MAX_UPLOAD_SIZE_BYTES = 5_000_000;

interface SidebarProps {
  sources: DocumentSource[];
  onSourceAdded: (source: DocumentSource) => void;
  onSourceRemoved: (sourceId: string) => void;
}

function getDocumentType(fileName: string): DocumentType {
  return fileName.toLocaleLowerCase().endsWith(".pdf") ? "pdf" : "text";
}

export function Sidebar({ sources, onSourceAdded, onSourceRemoved }: SidebarProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  async function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) {
      return;
    }
    if (file.size > MAX_UPLOAD_SIZE_BYTES) {
      setUploadError("Dateien dürfen maximal 5 MB groß sein.");
      return;
    }

    try {
      const content = await file.text();
      if (!content.trim()) {
        setUploadError("Die Datei enthält keinen lesbaren Text.");
        return;
      }
      onSourceAdded({
        id: crypto.randomUUID(),
        name: file.name,
        type: getDocumentType(file.name),
        content,
      });
      setUploadError(null);
    } catch (error) {
      console.error("File upload failed:", error);
      setUploadError("Die Datei konnte nicht gelesen werden.");
    }
  }

  return (
    <aside className="flex w-full flex-col border-b border-slate-200 bg-white p-5 md:w-80 md:border-b-0 md:border-r">
      <div className="mb-8">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-indigo-600">Notebook</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">Sourcewise</h1>
        <p className="mt-2 text-sm leading-6 text-slate-500">Deine Dokumente, dein Kontext.</p>
      </div>

      <button
        type="button"
        onClick={() => fileInputRef.current?.click()}
        className="rounded-xl bg-slate-950 px-4 py-3 text-sm font-medium text-white transition hover:bg-indigo-700"
      >
        + Quelle hinzufügen
      </button>
      <input
        ref={fileInputRef}
        type="file"
        accept={ACCEPTED_FILE_TYPES}
        onChange={handleFileChange}
        className="hidden"
      />
      <p className="mt-3 text-xs leading-5 text-slate-400">TXT, MD oder PDF mit lesbarem Text · max. 5 MB</p>
      {uploadError && <p className="mt-3 text-sm text-rose-600">{uploadError}</p>}

      <div className="mt-8">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">Aktive Quellen</h2>
          <span className="rounded-full bg-slate-100 px-2 py-1 text-xs text-slate-500">{sources.length}</span>
        </div>
        <ul className="mt-4 space-y-2">
          {sources.length === 0 && <li className="text-sm leading-6 text-slate-400">Noch keine Quellen geladen.</li>}
          {sources.map((source) => (
            <li key={source.id} className="group flex items-center gap-3 rounded-xl border border-slate-100 p-3">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-indigo-50 text-xs font-semibold text-indigo-600">
                {source.type === "pdf" ? "PDF" : "TXT"}
              </span>
              <span className="min-w-0 flex-1 truncate text-sm text-slate-700">{source.name}</span>
              <button
                type="button"
                aria-label={`${source.name} entfernen`}
                onClick={() => onSourceRemoved(source.id)}
                className="text-slate-300 opacity-0 transition hover:text-rose-500 group-hover:opacity-100"
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      </div>
    </aside>
  );
}
