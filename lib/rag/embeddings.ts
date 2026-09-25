const GEMINI_EMBEDDING_URL =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-2:embedContent";
const GEMINI_BATCH_EMBEDDING_URL =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-2:batchEmbedContents";
const EMBEDDING_MODEL = "models/gemini-embedding-2";
const REQUEST_TIMEOUT_MS = 60_000;
const MAX_EMBEDDINGS_PER_BATCH = 100;
const MAX_RATE_LIMIT_RETRIES = 3;
const DEFAULT_RATE_LIMIT_DELAY_MS = 2_000;
const MAX_RATE_LIMIT_DELAY_MS = 30_000;

interface GeminiEmbeddingResponse {
  embedding?: {
    values?: number[];
  };
}

interface GeminiBatchEmbeddingResponse {
  embeddings: Array<{
    values?: number[];
  }>;
}

interface EmbeddingInput {
  documentName: string;
  text: string;
}

export class GeminiEmbeddingError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
  ) {
    super(message);
    this.name = "GeminiEmbeddingError";
  }
}

export function getGeminiEmbeddingHttpStatus(error: GeminiEmbeddingError): number {
  if (error.statusCode === 429 || error.statusCode === 503) return 503;
  if (error.statusCode === 504) return 504;
  return 502;
}

function isEmbeddingResponse(value: unknown): value is GeminiEmbeddingResponse {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const response = value as { embedding?: unknown };
  return typeof response.embedding === "object" && response.embedding !== null;
}

function isBatchEmbeddingResponse(value: unknown): value is GeminiBatchEmbeddingResponse {
  return typeof value === "object" && value !== null && Array.isArray(
    (value as { embeddings?: unknown }).embeddings,
  );
}

function formatDocumentText(documentName: string, text: string): string {
  return `title: ${documentName} | text: ${text}`;
}

function formatQuestionText(question: string): string {
  return `task: question answering | query: ${question}`;
}

function getApiKey(): string {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new GeminiEmbeddingError("GEMINI_API_KEY ist nicht konfiguriert.", 503);
  }
  return apiKey;
}

function isValidVector(values: unknown): values is number[] {
  return (
    Array.isArray(values) &&
    values.length > 0 &&
    values.every((value) => typeof value === "number" && Number.isFinite(value))
  );
}

function getRetryDelayMs(payload: unknown, attempt: number): number {
  if (typeof payload === "object" && payload !== null && "error" in payload) {
    const error = (payload as { error?: { details?: unknown } }).error;
    if (Array.isArray(error?.details)) {
      const retryInfo = error.details.find(
        (detail) =>
          typeof detail === "object" &&
          detail !== null &&
          "@type" in detail &&
          (detail as { "@type"?: unknown })["@type"] ===
            "type.googleapis.com/google.rpc.RetryInfo",
      );
      if (
        typeof retryInfo === "object" &&
        retryInfo !== null &&
        "retryDelay" in retryInfo &&
        typeof (retryInfo as { retryDelay?: unknown }).retryDelay === "string"
      ) {
        const seconds = Number.parseFloat(
          (retryInfo as { retryDelay: string }).retryDelay.replace(/s$/, ""),
        );
        if (Number.isFinite(seconds) && seconds >= 0) {
          return Math.min(seconds * 1_000, MAX_RATE_LIMIT_DELAY_MS);
        }
      }
    }
  }

  return Math.min(
    DEFAULT_RATE_LIMIT_DELAY_MS * 2 ** attempt,
    MAX_RATE_LIMIT_DELAY_MS,
  );
}

function isRetryableStatus(status: number): boolean {
  return status === 429 || status === 500 || status === 502 || status === 503 || status === 504;
}

async function requestEmbeddings(
  texts: string[],
  apiKey: string,
  fetchImplementation: typeof fetch = fetch,
): Promise<number[][]> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    for (let attempt = 0; ; attempt += 1) {
      const isBatch = texts.length > 1;
      const response = await fetchImplementation(
        isBatch ? GEMINI_BATCH_EMBEDDING_URL : GEMINI_EMBEDDING_URL,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-goog-api-key": apiKey,
          },
          body: JSON.stringify(
            isBatch
              ? {
                  requests: texts.map((text) => ({
                    model: EMBEDDING_MODEL,
                    content: { parts: [{ text }] },
                    taskType: "RETRIEVAL_DOCUMENT",
                  })),
                }
              : {
                  model: EMBEDDING_MODEL,
                  content: { parts: [{ text: texts[0] }] },
                  taskType: "RETRIEVAL_DOCUMENT",
                },
          ),
          signal: controller.signal,
        },
      );

      const payload: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        if (isRetryableStatus(response.status) && attempt < MAX_RATE_LIMIT_RETRIES) {
          await new Promise((resolve) =>
            setTimeout(resolve, getRetryDelayMs(payload, attempt)),
          );
          continue;
        }
        if (response.status === 429) {
          throw new GeminiEmbeddingError(
            "Das Gemini-Embedding-Kontingent ist ausgeschöpft. Bitte warte kurz oder prüfe dein Google-AI-Kontingent und die Abrechnung.",
            429,
          );
        }
        throw new GeminiEmbeddingError(
          `Die Gemini-Embedding-Anfrage ist fehlgeschlagen (${response.status}).`,
          response.status >= 500 ? 502 : response.status,
        );
      }

      if (texts.length === 1) {
        if (!isEmbeddingResponse(payload) || !isValidVector(payload.embedding?.values)) {
          throw new GeminiEmbeddingError("Die Embedding-Antwort hat ein ungültiges Format.", 502);
        }
        return [payload.embedding.values];
      }

      if (!isBatchEmbeddingResponse(payload) || payload.embeddings.length !== texts.length) {
        throw new GeminiEmbeddingError("Die Batch-Embedding-Antwort hat ein ungültiges Format.", 502);
      }
      const vectors: number[][] = [];
      for (const embedding of payload.embeddings) {
        if (!isValidVector(embedding.values)) {
          throw new GeminiEmbeddingError("Die Batch-Embedding-Antwort hat ein ungültiges Format.", 502);
        }
        vectors.push(embedding.values);
      }
      return vectors;
    }
  } catch (error) {
    if (error instanceof GeminiEmbeddingError) throw error;
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new GeminiEmbeddingError(
        "Die Gemini-Embedding-Anfrage hat das Zeitlimit von 60 Sekunden überschritten.",
        504,
      );
    }
    throw new GeminiEmbeddingError("Gemini konnte die Embeddings nicht erzeugen.", 502);
  } finally {
    clearTimeout(timeout);
  }
}

async function requestEmbedding(text: string): Promise<number[]> {
  const [embedding] = await requestEmbeddings([text], getApiKey());
  return embedding;
}

export function embedDocumentChunk(documentName: string, text: string): Promise<number[]> {
  return requestEmbedding(formatDocumentText(documentName, text));
}

export async function embedDocumentChunks(inputs: EmbeddingInput[]): Promise<number[][]> {
  if (inputs.length === 0) return [];

  const apiKey = getApiKey();
  const texts = inputs.map(({ documentName, text }) => formatDocumentText(documentName, text));
  const embeddings: number[][] = [];

  for (let start = 0; start < texts.length; start += MAX_EMBEDDINGS_PER_BATCH) {
    const batch = texts.slice(start, start + MAX_EMBEDDINGS_PER_BATCH);
    embeddings.push(...await requestEmbeddings(batch, apiKey));
  }

  return embeddings;
}

export function embedQuestion(question: string): Promise<number[]> {
  return requestEmbedding(formatQuestionText(question));
}
