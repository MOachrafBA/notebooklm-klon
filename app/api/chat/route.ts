import { callLlm } from "@/lib/llm/client";
import { embedQuestion } from "@/lib/rag/embeddings";
import { buildPrompt } from "@/lib/rag/prompt";
import { retrieveDocumentChunks } from "@/lib/rag/vectorStore";
import type { ChatRequest } from "@/lib/rag/types";

export const maxDuration = 60;

const BAD_REQUEST_MESSAGE = "Bitte sende eine Frage und mindestens eine gültige Quellen-ID.";
const SERVER_ERROR_MESSAGE = "Die Antwort konnte nicht erstellt werden.";

function isChatRequest(value: unknown): value is ChatRequest {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const request = value as Record<string, unknown>;
  return (
    typeof request.question === "string" &&
    request.question.trim().length > 0 &&
    Array.isArray(request.documentIds) &&
    request.documentIds.length > 0 &&
    request.documentIds.every((documentId) => typeof documentId === "string" && documentId.length > 0)
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
    const questionEmbedding = await embedQuestion(body.question);
    const relevantChunks = await retrieveDocumentChunks(questionEmbedding, body.documentIds);
    const prompt = buildPrompt(body.question, relevantChunks);
    const answer = await callLlm(prompt);

    return Response.json({ answer });
  } catch (error) {
    const message = error instanceof Error ? error.message : SERVER_ERROR_MESSAGE;
    console.error("Chat request failed:", message);
    return Response.json({ error: message }, { status: 500 });
  }
}
