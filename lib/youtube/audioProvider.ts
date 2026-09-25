const MAX_AUDIO_SIZE_BYTES = 25_000_000;
const MAX_SOURCE_URL_LENGTH = 2_048;
const PROVIDER_TIMEOUT_MS = 30_000;
const AUDIO_CONTENT_TYPE_PATTERN = /^audio\/[a-z0-9.+-]+$/i;

export const YOUTUBE_AUDIO_LIMITS = {
  maxAudioSizeBytes: MAX_AUDIO_SIZE_BYTES,
  maxSourceUrlLength: MAX_SOURCE_URL_LENGTH,
  timeoutMs: PROVIDER_TIMEOUT_MS,
} as const;

export class YouTubeAudioProviderError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number = 502,
  ) {
    super(message);
    this.name = "YouTubeAudioProviderError";
  }
}

function getProviderConfiguration(): { endpoint: string; apiKey: string } {
  const endpoint = process.env.YOUTUBE_AUDIO_PROVIDER_URL;
  const apiKey = process.env.YOUTUBE_AUDIO_PROVIDER_API_KEY;
  if (!endpoint || !apiKey) {
    throw new YouTubeAudioProviderError(
      "Der YouTube-Audio-Provider ist nicht konfiguriert.",
      503,
    );
  }
  return { endpoint, apiKey };
}

async function readAudio(response: Response): Promise<Uint8Array> {
  const contentType = response.headers.get("content-type")?.split(";")[0].trim() ?? "";
  if (!AUDIO_CONTENT_TYPE_PATTERN.test(contentType) && contentType !== "application/octet-stream") {
    throw new YouTubeAudioProviderError("Der Audio-Provider lieferte keinen unterstützten Audiostream.", 502);
  }

  const declaredLength = response.headers.get("content-length");
  if (declaredLength && Number(declaredLength) > MAX_AUDIO_SIZE_BYTES) {
    throw new YouTubeAudioProviderError("Das YouTube-Audio überschreitet das Größenlimit von 25 MB.", 413);
  }

  if (!response.body) {
    throw new YouTubeAudioProviderError("Der Audio-Provider lieferte keinen Audiostream.", 502);
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalLength = 0;
  try {
    while (true) {
      const result = await reader.read();
      if (result.done) break;
      totalLength += result.value.byteLength;
      if (totalLength > MAX_AUDIO_SIZE_BYTES) {
        throw new YouTubeAudioProviderError("Das YouTube-Audio überschreitet das Größenlimit von 25 MB.", 413);
      }
      chunks.push(result.value);
    }
  } finally {
    reader.releaseLock();
  }

  if (totalLength === 0) {
    throw new YouTubeAudioProviderError("Der Audio-Provider lieferte leeres Audio.", 502);
  }

  const audio = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    audio.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return audio;
}

export async function fetchYouTubeAudio(sourceUrl: string, videoId: string): Promise<Uint8Array> {
  if (sourceUrl.length > MAX_SOURCE_URL_LENGTH) {
    throw new YouTubeAudioProviderError("Die YouTube-URL ist zu lang.", 400);
  }

  const { endpoint, apiKey } = getProviderConfiguration();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), PROVIDER_TIMEOUT_MS);
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      redirect: "error",
      headers: {
        Authorization: "Bearer " + apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ sourceUrl, videoId }),
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new YouTubeAudioProviderError(
        response.status === 404 || response.status === 410
          ? "Das YouTube-Video ist privat, gelöscht oder nicht verfügbar."
          : response.status === 429
            ? "Der YouTube-Audio-Provider ist momentan ausgelastet."
            : `Der YouTube-Audio-Provider lehnte die Anfrage ab (${response.status}).`,
        response.status === 429 ? 503 : 502,
      );
    }
    return await readAudio(response);
  } catch (error) {
    if (error instanceof YouTubeAudioProviderError) throw error;
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new YouTubeAudioProviderError("Der YouTube-Audio-Provider hat das Zeitlimit überschritten.", 504);
    }
    throw new YouTubeAudioProviderError("Der YouTube-Audio-Provider konnte nicht erreicht werden.", 502);
  } finally {
    clearTimeout(timeout);
  }
}
