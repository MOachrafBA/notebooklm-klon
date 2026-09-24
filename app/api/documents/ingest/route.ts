import { chunkDocument } from "@/lib/rag/chunk";
import { embedDocumentChunk } from "@/lib/rag/embeddings";
import { saveDocumentChunks } from "@/lib/rag/vectorStore";
import { DOCUMENT_TYPES, type DocumentSource } from "@/lib/rag/types";

export const maxDuration = 60;

const BAD_REQUEST_MESSAGE = "Bitte sende eine gültige Dokumentquelle.";
const SERVER_ERROR_MESSAGE = "Die Quelle konnte nicht verarbeitet werden.";

function isDocumentSource(value: unknown): value is DocumentSource {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const document = value as Record<string, unknown>;
  return (
    typeof document.id === "string" &&
    document.id.length > 0 &&
    typeof document.name === "string" &&
    document.name.length > 0 &&
    typeof document.content === "string" &&
    document.content.trim().length > 0 &&
    typeof document.type === "string" &&
    DOCUMENT_TYPES.includes(document.type as (typeof DOCUMENT_TYPES)[number])
  );
}

export async function POST(request: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: BAD_REQUEST_MESSAGE }, { status: 400 });
  }

  if (!isDocumentSource(body)) {
    return Response.json({ error: BAD_REQUEST_MESSAGE }, { status: 400 });
  }

  try {
    const chunks = chunkDocument(body);
    const embeddings = await Promise.all(
      chunks.map((chunk) => embedDocumentChunk(chunk.documentName, chunk.text)),
    );
    await saveDocumentChunks(chunks, embeddings);

    return Response.json({ documentId: body.id });
  } catch (error) {
    const message = error instanceof Error ? error.message : SERVER_ERROR_MESSAGE;
    console.error("Document ingestion failed:", message);
    return Response.json({ error: message }, { status: 500 });
  }
}
