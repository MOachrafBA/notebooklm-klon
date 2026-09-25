import type { SourceChunk } from "../rag/types";

const MAX_TRANSCRIPT_CHARACTERS = 500_000;
const MAX_TRANSCRIPT_SEGMENTS = 2_000;

export interface YouTubeCaptionSegment {
  text: string;
  speaker: string | null;
  startMs: number;
  endMs: number;
}

export const YOUTUBE_TRANSCRIPT_LIMITS = {
  maxCharacters: MAX_TRANSCRIPT_CHARACTERS,
  maxSegments: MAX_TRANSCRIPT_SEGMENTS,
} as const;

export function transcriptSegmentsToChunks(
  segments: YouTubeCaptionSegment[],
  documentId: string,
  documentName: string,
  sourceUrl: string,
  videoId: string,
): SourceChunk[] {
  if (segments.length > MAX_TRANSCRIPT_SEGMENTS) {
    throw new Error("Das Transkript enthält zu viele Abschnitte.");
  }
  const totalCharacters = segments.reduce((sum, segment) => sum + segment.text.length, 0);
  if (totalCharacters > MAX_TRANSCRIPT_CHARACTERS) {
    throw new Error("Das Transkript überschreitet das Größenlimit.");
  }
  return segments.map((segment, index) => ({
    id: `${documentId}-${index}`,
    documentId,
    documentName,
    text: segment.text,
    index,
    sourceUrl,
    videoId,
    speaker: segment.speaker,
    startMs: segment.startMs,
    endMs: segment.endMs,
  }));
}
