import {
  fetchTranscript as getTranscript,
  YoutubeTranscriptDisabledError,
  YoutubeTranscriptNotAvailableError,
  YoutubeTranscriptTooManyRequestError,
  YoutubeTranscriptVideoUnavailableError,
  type TranscriptConfig,
} from "youtube-transcript-plus";
import { YOUTUBE_TRANSCRIPT_LIMITS, type YouTubeCaptionSegment } from "./mapping";

const CAPTIONS_TIMEOUT_MS = 20_000;
const CAPTIONS_TIMEOUT_MESSAGE = "Der Abruf der YouTube-Untertitel hat das Zeitlimit überschritten.";
const CAPTIONS_UNAVAILABLE_MESSAGE =
  "Für dieses Video sind keine abrufbaren Untertitel verfügbar.";

export const YOUTUBE_CAPTIONS_TIMEOUT_MS = CAPTIONS_TIMEOUT_MS;

export interface YouTubeCaptionFetchOptions {
  timeoutMs?: number;
  fetchTranscript?: (videoId: string, config: TranscriptConfig) => Promise<unknown>;
}

export class YouTubeCaptionsError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number = 502,
  ) {
    super(message);
    this.name = "YouTubeCaptionsError";
  }
}

export function parseYouTubeCaptionSegments(value: unknown): YouTubeCaptionSegment[] {
  if (!Array.isArray(value)) {
    throw new YouTubeCaptionsError("YouTube lieferte ein ungültiges Untertitelformat.");
  }
  if (value.length > YOUTUBE_TRANSCRIPT_LIMITS.maxSegments) {
    throw new YouTubeCaptionsError("Das Transkript enthält zu viele Abschnitte.", 413);
  }

  const segments: YouTubeCaptionSegment[] = [];
  let totalCharacters = 0;
  for (const item of value) {
    if (typeof item !== "object" || item === null) {
      throw new YouTubeCaptionsError("YouTube lieferte ein ungültiges Untertitelformat.");
    }
    const segment = item as Record<string, unknown>;
    if (
      typeof segment.text !== "string" ||
      typeof segment.offset !== "number" ||
      !Number.isFinite(segment.offset) ||
      segment.offset < 0 ||
      typeof segment.duration !== "number" ||
      !Number.isFinite(segment.duration) ||
      segment.duration < 0
    ) {
      throw new YouTubeCaptionsError("YouTube lieferte ein ungültiges Untertitelformat.");
    }

    const text = segment.text.trim();
    if (text.length === 0) continue;
    totalCharacters += text.length;
    if (totalCharacters > YOUTUBE_TRANSCRIPT_LIMITS.maxCharacters) {
      throw new YouTubeCaptionsError("Das Transkript überschreitet das Größenlimit.", 413);
    }
    segments.push({
      text,
      speaker: null,
      startMs: Math.round(segment.offset * 1_000),
      endMs: Math.round((segment.offset + segment.duration) * 1_000),
    });
  }

  if (segments.length === 0) {
    throw new YouTubeCaptionsError(CAPTIONS_UNAVAILABLE_MESSAGE, 422);
  }
  return segments;
}

function mapCaptionFetchError(error: unknown): YouTubeCaptionsError {
  if (error instanceof YoutubeTranscriptTooManyRequestError) {
    return new YouTubeCaptionsError(
      "YouTube begrenzt momentan den Untertitelabruf. Bitte versuche es später erneut.",
      503,
    );
  }
  if (
    error instanceof YoutubeTranscriptDisabledError ||
    error instanceof YoutubeTranscriptNotAvailableError ||
    error instanceof YoutubeTranscriptVideoUnavailableError
  ) {
    return new YouTubeCaptionsError(CAPTIONS_UNAVAILABLE_MESSAGE, 422);
  }
  if (error instanceof Error && error.name === "AbortError") {
    return new YouTubeCaptionsError(CAPTIONS_TIMEOUT_MESSAGE, 504);
  }
  return new YouTubeCaptionsError(
    "YouTube-Untertitel konnten nicht abgerufen werden.",
    502,
  );
}

export async function fetchYouTubeCaptions(
  videoId: string,
  options: YouTubeCaptionFetchOptions = {},
): Promise<YouTubeCaptionSegment[]> {
  const timeoutMs = options.timeoutMs ?? CAPTIONS_TIMEOUT_MS;
  const fetchCaptions = options.fetchTranscript ?? getTranscript;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const transcript: unknown = await fetchCaptions(videoId, {
      signal: controller.signal,
      retries: 0,
    });
    return parseYouTubeCaptionSegments(transcript);
  } catch (error) {
    if (error instanceof YouTubeCaptionsError) throw error;
    throw mapCaptionFetchError(error);
  } finally {
    clearTimeout(timeout);
  }
}
