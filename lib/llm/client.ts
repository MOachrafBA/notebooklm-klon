import { SYSTEM_INSTRUCTION } from "@/lib/rag/prompt";

const GEMINI_INTERACTIONS_URL = "https://generativelanguage.googleapis.com/v1beta/interactions";
const DEFAULT_MODEL = "gemini-3.8-flash";
const FALLBACK_MODEL = "gemini-3.7-flash";
const REQUEST_TIMEOUT_MS = 60_000;
const MAX_UNAVAILABLE_RETRIES = 1;
const UNAVAILABLE_RETRY_DELAY_MS = 1_000;
const GENERATION_TEMPERATURE = 0.2;

interface GeminiOutputContent {
  type?: string;
  text?: string;
}

interface GeminiStep {
  type?: string;
  content?: GeminiOutputContent[];
}

interface GeminiInteractionResponse {
  steps?: GeminiStep[];
}

interface GeminiErrorResponse {
  error?: {
    message?: unknown;
  };
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

function isGeminiInteractionResponse(value: unknown): value is GeminiInteractionResponse {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const response = value as { steps?: unknown };
  return Array.isArray(response.steps);
}

function getProviderErrorMessage(value: unknown): string | null {
  if (typeof value !== "object" || value === null || !("error" in value)) {
    return null;
  }

  const error = (value as GeminiErrorResponse).error;
  if (typeof error?.message !== "string") {
    return null;
  }

  return error.message.slice(0, 300);
}

export async function callLlm(prompt: string, apiKey: string): Promise<string> {
  const configuredModel = process.env.GEMINI_MODEL
    ?.trim()
    .replace(/^(?:GEMINI_MODEL=)+/i, "")
    .replace(/^models\//, "");
  const models = Array.from(
    new Set([configuredModel || DEFAULT_MODEL, FALLBACK_MODEL]),
  );

  for (const [modelIndex, model] of models.entries()) {
    for (let attempt = 0; ; attempt += 1) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

      try {
        const response = await fetch(GEMINI_INTERACTIONS_URL, {
          method: "POST",
          headers: {
            "x-goog-api-key": apiKey,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model,
            input: prompt,
            system_instruction: SYSTEM_INSTRUCTION,
            generation_config: { temperature: GENERATION_TEMPERATURE },
            store: false,
          }),
          signal: controller.signal,
        });

        if (response.status === 503) {
          await response.text();
          if (attempt < MAX_UNAVAILABLE_RETRIES) {
            await sleep(UNAVAILABLE_RETRY_DELAY_MS);
            continue;
          }
          if (modelIndex < models.length - 1) {
            break;
          }
          throw new GeminiLlmError(
            "Gemini ist derzeit stark ausgelastet. Auch das Ausweichmodell ist nicht verfügbar. Bitte versuche es später erneut. Dein API-Key ist dadurch nicht als ungültig bestätigt.",
            503,
          );
        }

        if (response.status === 404) {
          const payload: unknown = await response.json().catch(() => null);
          if (modelIndex < models.length - 1) {
            break;
          }
          const providerMessage = getProviderErrorMessage(payload);
          throw new GeminiLlmError(
            `Gemini kann das Modell "${model}" über die Interactions API nicht verwenden.${providerMessage ? ` Google meldet: ${providerMessage}` : " Prüfe, ob die Modell-ID existiert und für die Interactions API verfügbar ist."}`,
            404,
          );
        }

        if (!response.ok) {
          const payload: unknown = await response.json().catch(() => null);
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
          throw new GeminiLlmError(
            `Die Gemini-Anfrage ist fehlgeschlagen (${response.status}).${getProviderErrorMessage(payload) ? ` Google meldet: ${getProviderErrorMessage(payload)}` : " Bitte prüfe Modell, API-Key und Request-Konfiguration."}`,
            response.status,
          );
        }

        const payload: unknown = await response.json();
        if (!isGeminiInteractionResponse(payload)) {
          throw new GeminiLlmError("Die LLM-Antwort hat ein ungültiges Format.", 502);
        }

        const answer = payload.steps
          ?.filter((step) => step.type === "model_output")
          .flatMap((step) => step.content ?? [])
          .filter((content) => content.type === "text")
          .map((content) => content.text ?? "")
          .join("")
          .trim();
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

  throw new GeminiLlmError("Kein Gemini-Modell war für die Antwort verfügbar.", 503);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
