import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { SourceChunk } from "./types";

const DOCUMENT_CHUNKS_TABLE = "document_chunks";
const MATCH_CHUNKS_FUNCTION = "match_document_chunks";
const DEFAULT_MATCH_COUNT = 5;

interface StoredChunk {
  id: string;
  document_id: string;
  document_name: string;
  chunk_index: number;
  content: string;
}

interface MatchedChunk extends StoredChunk {
  similarity: number;
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

function toStoredChunk(chunk: SourceChunk, embedding: number[]): StoredChunk & { embedding: number[] } {
  return {
    id: chunk.id,
    document_id: chunk.documentId,
    document_name: chunk.documentName,
    chunk_index: chunk.index,
    content: chunk.text,
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

export async function saveDocumentChunks(
  chunks: SourceChunk[],
  embeddings: number[][],
): Promise<void> {
  if (chunks.length !== embeddings.length) {
    throw new Error("Chunk- und Embedding-Anzahl stimmen nicht überein.");
  }

  if (chunks.length === 0) {
    return;
  }

  const rows = chunks.map((chunk, index) => toStoredChunk(chunk, embeddings[index]));
  const { error } = await getSupabaseClient().from(DOCUMENT_CHUNKS_TABLE).upsert(rows);
  if (error) {
    throw new Error(`Supabase konnte Chunks nicht speichern: ${error.message}`);
  }
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
  }));
}
