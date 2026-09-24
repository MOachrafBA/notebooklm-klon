import type { DocumentSource, SourceChunk } from "./types";

export const CHUNK_SIZE = 1_200;
export const CHUNK_OVERLAP = 150;

export function chunkDocument(
  document: DocumentSource,
  chunkSize: number = CHUNK_SIZE,
  overlap: number = CHUNK_OVERLAP,
): SourceChunk[] {
  if (chunkSize <= 0 || overlap < 0 || overlap >= chunkSize) {
    throw new Error("Chunk size must be positive and overlap must be smaller than the chunk size.");
  }

  const normalizedContent = document.content.trim();
  if (normalizedContent.length === 0) {
    return [];
  }

  const chunks: SourceChunk[] = [];
  const step = chunkSize - overlap;

  for (let start = 0; start < normalizedContent.length; start += step) {
    const text = normalizedContent.slice(start, start + chunkSize).trim();
    if (text.length > 0) {
      chunks.push({
        id: `${document.id}-${chunks.length}`,
        documentId: document.id,
        documentName: document.name,
        text,
        index: chunks.length,
      });
    }
  }

  return chunks;
}
