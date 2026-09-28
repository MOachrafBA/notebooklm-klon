import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { DocumentSource, SourceChunk } from "./types";

const DOCUMENT_CHUNKS_TABLE = "document_chunks";
const MATCH_CHUNKS_FUNCTION = "match_document_chunks";
const DEFAULT_MATCH_COUNT = 5;
const DOCUMENT_LIST_PAGE_SIZE = 500;

interface StoredChunk {
  id: string;
  document_id: string;
  document_name: string;
  chunk_index: number;
  content: string;
  source_url?: string;
  video_id?: string;
  speaker?: string | null;
  start_ms?: number | null;
  end_ms?: number | null;
  content_hash?: string | null;
}

interface MatchedChunk extends StoredChunk {
  similarity: number;
}

interface StoredDocumentSummary {
  document_id: string;
  document_name: string;
  source_url?: string | null;
  video_id?: string | null;
}

function getSupabaseClient(): SupabaseClient {
  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    throw new Error("SUPABASE_URL und SUPABASE_SERVICE_ROLE_KEY müssen konfiguriert sein.");
  }

  return createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function toStoredChunk(
  chunk: SourceChunk,
  embedding: number[],
  contentHash: string | null,
): StoredChunk & { embedding: number[] } {
  return {
    id: chunk.id,
    document_id: chunk.documentId,
    document_name: chunk.documentName,
    chunk_index: chunk.index,
    content: chunk.text,
    source_url: chunk.sourceUrl,
    video_id: chunk.videoId,
    speaker: chunk.speaker,
    start_ms: chunk.startMs,
    end_ms: chunk.endMs,
    content_hash: contentHash,
    embedding,
  };
}

function isMatchedChunk(value: unknown): value is MatchedChunk {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const chunk = value as Record<string, unknown>;
  return (
    typeof chunk.id === "string" &&
    typeof chunk.document_id === "string" &&
    typeof chunk.document_name === "string" &&
    typeof chunk.chunk_index === "number" &&
    typeof chunk.content === "string" &&
    typeof chunk.similarity === "number"
  );
}

function isStoredDocumentSummary(value: unknown): value is StoredDocumentSummary {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const document = value as Record<string, unknown>;
  return (
    typeof document.document_id === "string" &&
    typeof document.document_name === "string" &&
    (document.source_url === undefined || document.source_url === null || typeof document.source_url === "string") &&
    (document.video_id === undefined || document.video_id === null || typeof document.video_id === "string")
  );
}

export async function listDocumentSources(): Promise<DocumentSource[]> {
  const supabase = getSupabaseClient();
  const documents = new Map<string, DocumentSource>();

  for (let offset = 0; ; offset += DOCUMENT_LIST_PAGE_SIZE) {
    const { data, error } = await supabase
      .from(DOCUMENT_CHUNKS_TABLE)
      .select("document_id, document_name, source_url, video_id")
      .order("document_id")
      .order("chunk_index")
      .range(offset, offset + DOCUMENT_LIST_PAGE_SIZE - 1);

    if (error) {
      throw new Error(`Supabase konnte gespeicherte Quellen nicht laden: ${error.message}`);
    }
    if (!Array.isArray(data)) {
      throw new Error("Supabase lieferte ein ungültiges Quellenformat.");
    }

    for (const value of data) {
      if (!isStoredDocumentSummary(value) || documents.has(value.document_id)) {
        continue;
      }

      const isYouTube = Boolean(value.video_id || value.source_url);
      const type = isYouTube
        ? "youtube"
        : value.document_name.toLocaleLowerCase().endsWith(".pdf")
          ? "pdf"
          : "text";
      documents.set(value.document_id, {
        id: value.document_id,
        name: value.document_name,
        type,
        content: "",
        ...(value.source_url ? { sourceUrl: value.source_url } : {}),
        ...(value.video_id ? { videoId: value.video_id } : {}),
      });
    }

    if (data.length < DOCUMENT_LIST_PAGE_SIZE) {
      break;
    }
  }

  return [...documents.values()].sort((left, right) => left.name.localeCompare(right.name));
}

export async function saveDocumentChunks(
  chunks: SourceChunk[],
  embeddings: number[][],
  contentHash: string | null = null,
): Promise<void> {
  if (chunks.length !== embeddings.length) {
    throw new Error("Chunk- und Embedding-Anzahl stimmen nicht überein.");
  }

  if (chunks.length === 0) {
    return;
  }

  const rows = chunks.map((chunk, index) => toStoredChunk(chunk, embeddings[index], contentHash));
  const { error } = await getSupabaseClient().from(DOCUMENT_CHUNKS_TABLE).upsert(rows);
  if (error) {
    throw new Error(`Supabase konnte Chunks nicht speichern: ${error.message}`);
  }
}

/**
 * Operation: sucht ein bereits gespeichertes Dokument anhand seines
 * Content-Hashes. Dient der Duplikaterkennung, damit dieselbe Datei nicht bei
 * jedem erneuten Upload erneut gechunkt, embedded (Gemini-Quota!) und
 * gespeichert wird.
 */
export async function findDocumentIdByContentHash(
  contentHash: string,
): Promise<string | null> {
  const { data, error } = await getSupabaseClient()
    .from(DOCUMENT_CHUNKS_TABLE)
    .select("document_id")
    .eq("content_hash", contentHash)
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`Supabase konnte nicht nach Duplikaten suchen: ${error.message}`);
  }

  return (data as { document_id: string } | null)?.document_id ?? null;
}

export async function retrieveDocumentChunks(
  queryEmbedding: number[],
  documentIds: string[],
  matchCount: number = DEFAULT_MATCH_COUNT,
): Promise<SourceChunk[]> {
  const { data, error } = await getSupabaseClient().rpc(MATCH_CHUNKS_FUNCTION, {
    query_embedding: queryEmbedding,
    match_count: matchCount,
    source_ids: documentIds,
  });

  if (error) {
    throw new Error(`Supabase konnte Chunks nicht abrufen: ${error.message}`);
  }

  if (!Array.isArray(data)) {
    throw new Error("Supabase lieferte ein ungültiges Retrieval-Format.");
  }

  return data.filter(isMatchedChunk).map((chunk) => ({
    id: chunk.id,
    documentId: chunk.document_id,
    documentName: chunk.document_name,
    text: chunk.content,
    index: chunk.chunk_index,
    sourceUrl: chunk.source_url,
    videoId: chunk.video_id,
    speaker: chunk.speaker,
    startMs: chunk.start_ms,
    endMs: chunk.end_ms,
  }));
}
