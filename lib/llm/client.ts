const OPENAI_API_URL = "https://api.openai.com/v1/chat/completions";
const DEFAULT_MODEL = "gpt-4o-mini";
const REQUEST_TIMEOUT_MS = 30_000;

interface OpenAiMessage {
  role: "system" | "user";
  content: string;
}

interface OpenAiResponse {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
}

function isOpenAiResponse(value: unknown): value is OpenAiResponse {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const response = value as { choices?: unknown };
  return Array.isArray(response.choices);
}

export async function callLlm(prompt: string): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY ist nicht konfiguriert.");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  const messages: OpenAiMessage[] = [
    {
      role: "system",
      content: "Du bist ein präziser Assistent für dokumentenbasierte Fragen.",
    },
    { role: "user", content: prompt },
  ];

  try {
    const response = await fetch(OPENAI_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL ?? DEFAULT_MODEL,
        messages,
        temperature: 0.2,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`LLM-Anfrage fehlgeschlagen (${response.status}): ${errorText}`);
    }

    const payload: unknown = await response.json();
    if (!isOpenAiResponse(payload)) {
      throw new Error("Die LLM-Antwort hat ein ungültiges Format.");
    }

    const answer = payload.choices?.[0]?.message?.content?.trim();
    if (!answer) {
      throw new Error("Die LLM-Antwort enthält keinen Text.");
    }

    return answer;
  } finally {
    clearTimeout(timeout);
  }
}
