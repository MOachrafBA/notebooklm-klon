const ASSEMBLYAI_API_URL = "https://api.assemblyai.com/v2";
const REQUEST_TIMEOUT_MS = 30_000;
const POLL_INTERVAL_MS = 2_000;
const MAX_POLL_ATTEMPTS = 30;
const MAX_AUDIO_SIZE_BYTES = 25_000_000;

export interface YouTubeTranscriptSegment {
  text: string;
  speaker: string | null;
  startMs: number | null;
  endMs: number | null;
}

interface AssemblyTranscriptResponse {
  id?: unknown;
  status?: unknown;
  error?: unknown;
  utterances?: unknown;
}

function getApiKey(): string {
  const apiKey = process.env.ASSEMBLYAI_API_KEY;
  if (!apiKey) {
    throw new Error("ASSEMBLYAI_API_KEY ist nicht konfiguriert.");
  }
  return apiKey;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isTranscriptResponse(value: unknown): value is AssemblyTranscriptResponse {
  return isRecord(value) && "status" in value;
}

function getErrorMessage(value: unknown): string | null {
  if (!isRecord(value) || typeof value.error !== "string" || value.error.length === 0) {
    return null;
  }
  return value.error;
}

export function parseTranscriptSegments(value: unknown): YouTubeTranscriptSegment[] {
  if (!isRecord(value) || !Array.isArray(value.utterances)) {
    throw new Error("AssemblyAI lieferte keine gültigen Transkriptsegmente.");
  }

  const segments: YouTubeTranscriptSegment[] = [];
  for (const item of value.utterances) {
    if (!isRecord(item) || typeof item.text !== "string" || item.text.trim().length === 0) {
      continue;
    }

    const speaker = typeof item.speaker === "string" ? item.speaker : null;
    const startMs = typeof item.start === "number" ? item.start : null;
    const endMs = typeof item.end === "number" ? item.end : null;
    segments.push({
      text: item.text.trim(),
      speaker,
      startMs,
      endMs,
    });
  }

  if (segments.length === 0) {
    throw new Error("AssemblyAI lieferte ein leeres Transkript.");
  }

  return segments;
}

async function request(
  path: string,
  apiKey: string,
  init: RequestInit = {},
): Promise<unknown> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(`${ASSEMBLYAI_API_URL}${path}`, {
      ...init,
      headers: {
        authorization: apiKey,
        ...init.headers,
      },
      signal: controller.signal,
    });
    const payload: unknown = await response.json();
    if (!response.ok) {
      const message = getErrorMessage(payload) ?? `AssemblyAI-Anfrage fehlgeschlagen (${response.status}).`;
      throw new Error(message);
    }
    return payload;
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error("Die AssemblyAI-Anfrage hat das Zeitlimit von 30 Sekunden überschritten.");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function uploadAudio(audio: Uint8Array, apiKey: string): Promise<string> {
  const audioBuffer = new ArrayBuffer(audio.byteLength);
  new Uint8Array(audioBuffer).set(audio);
  const payload = await request("/upload", apiKey, {
    method: "POST",
    headers: { "content-type": "application/octet-stream" },
    body: new Blob([audioBuffer]),
  });

  if (!isRecord(payload) || typeof payload.upload_url !== "string" || payload.upload_url.length === 0) {
    throw new Error("AssemblyAI lieferte keine gültige Audio-Upload-URL.");
  }
  return payload.upload_url;
}

async function startTranscript(audioUrl: string, apiKey: string): Promise<string> {
  const payload = await request("/transcript", apiKey, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      audio_url: audioUrl,
      speaker_labels: true,
      punctuate: true,
    }),
  });

  if (!isRecord(payload) || typeof payload.id !== "string" || payload.id.length === 0) {
    throw new Error("AssemblyAI lieferte keine gültige Transkript-ID.");
  }
  return payload.id;
}

async function pollTranscript(transcriptId: string, apiKey: string): Promise<unknown> {
  for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt += 1) {
    const payload = await request(`/transcript/${encodeURIComponent(transcriptId)}`, apiKey);
    if (!isTranscriptResponse(payload)) {
      throw new Error("AssemblyAI lieferte ein ungültiges Transkriptformat.");
    }

    if (payload.status === "completed") {
      return payload;
    }
    if (payload.status === "error") {
      throw new Error(getErrorMessage(payload) ?? "AssemblyAI konnte das Audio nicht transkribieren.");
    }

    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }

  throw new Error("Die AssemblyAI-Transkription hat das Zeitlimit überschritten.");
}

export async function transcribeAudio(audio: Uint8Array): Promise<YouTubeTranscriptSegment[]> {
  if (audio.byteLength === 0) {
    throw new Error("Die Audiodatei ist leer.");
  }
  if (audio.byteLength > MAX_AUDIO_SIZE_BYTES) {
    throw new Error("Die Audiodatei darf maximal 25 MB groß sein.");
  }

  const apiKey = getApiKey();
  const audioUrl = await uploadAudio(audio, apiKey);
  const transcriptId = await startTranscript(audioUrl, apiKey);
  const result = await pollTranscript(transcriptId, apiKey);
  return parseTranscriptSegments(result);
}
