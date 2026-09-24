import { SYSTEM_INSTRUCTION } from "@/lib/rag/prompt";

const GEMINI_API_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/models";
const DEFAULT_MODEL = "gemini-3.6-flash";
const REQUEST_TIMEOUT_MS = 30_000;
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

function isGeminiResponse(value: unknown): value is GeminiResponse {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const response = value as { candidates?: unknown };
  return response.candidates === undefined || Array.isArray(response.candidates);
}

export async function callLlm(prompt: string): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY ist nicht konfiguriert.");
  }

  const model = process.env.GEMINI_MODEL ?? DEFAULT_MODEL;
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

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`LLM-Anfrage fehlgeschlagen (${response.status}): ${errorText}`);
    }

    const payload: unknown = await response.json();
    if (!isGeminiResponse(payload)) {
      throw new Error("Die LLM-Antwort hat ein ungültiges Format.");
    }

    const answer = payload.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    if (!answer) {
      throw new Error("Die LLM-Antwort enthält keinen Text.");
    }

    return answer;
  } finally {
    clearTimeout(timeout);
  }
}
