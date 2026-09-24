const GEMINI_EMBEDDING_URL =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-2:embedContent";
const EMBEDDING_MODEL = "models/gemini-embedding-2";
const REQUEST_TIMEOUT_MS = 60_000;

interface GeminiEmbeddingResponse {
  embedding?: {
    values?: number[];
  };
}

function isEmbeddingResponse(value: unknown): value is GeminiEmbeddingResponse {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const response = value as { embedding?: unknown };
  return typeof response.embedding === "object" && response.embedding !== null;
}

function formatDocumentText(documentName: string, text: string): string {
  return `title: ${documentName} | text: ${text}`;
}

function formatQuestionText(question: string): string {
  return `task: question answering | query: ${question}`;
}

async function requestEmbedding(text: string): Promise<number[]> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY ist nicht konfiguriert.");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(GEMINI_EMBEDDING_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify({
        model: EMBEDDING_MODEL,
        content: { parts: [{ text }] },
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Embedding-Anfrage fehlgeschlagen (${response.status}): ${errorText}`);
    }

    const payload: unknown = await response.json();
    if (!isEmbeddingResponse(payload) || !Array.isArray(payload.embedding?.values)) {
      throw new Error("Die Embedding-Antwort hat ein ungültiges Format.");
    }

    const values = payload.embedding.values;
    if (values.length === 0 || values.some((value) => typeof value !== "number")) {
      throw new Error("Die Embedding-Antwort enthält keinen gültigen Vektor.");
    }

    return values;
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error("Die Gemini-Embedding-Anfrage hat das Zeitlimit von 60 Sekunden überschritten.");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export function embedDocumentChunk(documentName: string, text: string): Promise<number[]> {
  return requestEmbedding(formatDocumentText(documentName, text));
}

export function embedQuestion(question: string): Promise<number[]> {
  return requestEmbedding(formatQuestionText(question));
}
