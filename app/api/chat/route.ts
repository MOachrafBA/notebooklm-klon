import { callLlm } from "@/lib/llm/client";
import { chunkDocument } from "@/lib/rag/chunk";
import { buildPrompt } from "@/lib/rag/prompt";
import { retrieveRelevantChunks } from "@/lib/rag/retrieve";
import { DOCUMENT_TYPES, type ChatRequest, type DocumentSource } from "@/lib/rag/types";

const BAD_REQUEST_MESSAGE = "Bitte sende eine Frage und mindestens eine gültige Quelle.";
const SERVER_ERROR_MESSAGE = "Die Antwort konnte nicht erstellt werden.";

function isDocumentSource(value: unknown): value is DocumentSource {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const document = value as Record<string, unknown>;
  return (
    typeof document.id === "string" &&
    typeof document.name === "string" &&
    typeof document.content === "string" &&
    typeof document.type === "string" &&
    DOCUMENT_TYPES.includes(document.type as (typeof DOCUMENT_TYPES)[number])
  );
}

function isChatRequest(value: unknown): value is ChatRequest {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const request = value as Record<string, unknown>;
  return (
    typeof request.question === "string" &&
    request.question.trim().length > 0 &&
    Array.isArray(request.documents) &&
    request.documents.length > 0 &&
    request.documents.every(isDocumentSource)
  );
}

export async function POST(request: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: BAD_REQUEST_MESSAGE }, { status: 400 });
  }

  if (!isChatRequest(body)) {
    return Response.json({ error: BAD_REQUEST_MESSAGE }, { status: 400 });
  }

  try {
    const chunks = body.documents.flatMap((document) => chunkDocument(document));
    const relevantChunks = retrieveRelevantChunks(chunks, body.question);
    const prompt = buildPrompt(body.question, relevantChunks);
    const answer = await callLlm(prompt);

    return Response.json({ answer });
  } catch (error) {
    const message = error instanceof Error ? error.message : SERVER_ERROR_MESSAGE;
    console.error("Chat request failed:", message);
    return Response.json({ error: message }, { status: 500 });
  }
}
