import { SYSTEM_INSTRUCTION } from "@/lib/rag/prompt";

const GEMINI_API_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/models";
const DEFAULT_MODEL = "gemini-flash-lite-latest";
const REQUEST_TIMEOUT_MS = 20_000;
const MAX_UNAVAILABLE_RETRIES = 1;
const UNAVAILABLE_RETRY_DELAY_MS = 1_000;
const GENERATION_TEMPERATURE = 0.2;

interface GeminiPart {
  text?: string;
}

interface GeminiCandidate {
  content?: {
    parts?: GeminiPart[];
  };
}

interface GeminiResponse {
  candidates?: GeminiCandidate[];
}

export class GeminiLlmError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
  ) {
    super(message);
    this.name = "GeminiLlmError";
  }
}

function isGeminiResponse(value: unknown): value is GeminiResponse {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const response = value as { candidates?: unknown };
  return response.candidates === undefined || Array.isArray(response.candidates);
}

export async function callLlm(prompt: string, apiKey: string): Promise<string> {
  const model = process.env.GEMINI_MODEL ?? DEFAULT_MODEL;
  for (let attempt = 0; ; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch(`${GEMINI_API_BASE_URL}/${model}:generateContent`, {
        method: "POST",
        headers: {
          "x-goog-api-key": apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          systemInstruction: {
            parts: [{ text: SYSTEM_INSTRUCTION }],
          },
          contents: [
            {
              role: "user",
              parts: [{ text: prompt }],
            },
          ],
          generationConfig: {
            temperature: GENERATION_TEMPERATURE,
          },
        }),
        signal: controller.signal,
      });

      if (response.status === 503 && attempt < MAX_UNAVAILABLE_RETRIES) {
        await response.text();
        await sleep(UNAVAILABLE_RETRY_DELAY_MS);
        continue;
      }
      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          throw new GeminiLlmError(
            "Der Gemini-API-Key ist ungültig oder hat keinen Zugriff auf dieses Modell.",
            response.status,
          );
        }
        if (response.status === 402 || response.status === 429) {
          throw new GeminiLlmError(
            "Das Gemini-Kontingent oder Guthaben für diesen API-Key ist ausgeschöpft.",
            response.status,
          );
        }
        if (response.status === 503) {
          throw new GeminiLlmError(
            "Gemini ist derzeit stark ausgelastet. Bitte warte kurz und versuche es erneut. Dein API-Key ist dadurch nicht als ungültig bestätigt.",
            503,
          );
        }
        throw new GeminiLlmError(
          `Die Gemini-Anfrage ist fehlgeschlagen (${response.status}). Bitte versuche es später erneut.`,
          response.status,
        );
      }

      const payload: unknown = await response.json();
      if (!isGeminiResponse(payload)) {
        throw new GeminiLlmError("Die LLM-Antwort hat ein ungültiges Format.", 502);
      }

      const answer = payload.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
      if (!answer) {
        throw new GeminiLlmError("Die LLM-Antwort enthält keinen Text.", 502);
      }

      return answer;
    } catch (error) {
      if (error instanceof GeminiLlmError) {
        throw error;
      }
      if (error instanceof DOMException && error.name === "AbortError") {
        throw new GeminiLlmError(
          `Die Gemini-Antwort hat das Zeitlimit von ${REQUEST_TIMEOUT_MS / 1_000} Sekunden überschritten.`,
          504,
        );
      }
      throw new GeminiLlmError("Gemini konnte die Antwort nicht erzeugen. Bitte versuche es erneut.", 502);
    } finally {
      clearTimeout(timeout);
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
