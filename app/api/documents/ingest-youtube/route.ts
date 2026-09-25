import { fetchYouTubeCaptions, YouTubeCaptionsError } from "@/lib/youtube/captions";
import { transcriptSegmentsToChunks } from "@/lib/youtube/mapping";
import { validateYouTubeUrl } from "@/lib/youtube/url";
import {
  embedDocumentChunks,
  GeminiEmbeddingError,
  getGeminiEmbeddingHttpStatus,
} from "@/lib/rag/embeddings";
import { saveDocumentChunks } from "@/lib/rag/vectorStore";

export const runtime = "nodejs";

const BAD_REQUEST_MESSAGE = "Bitte sende eine gültige öffentliche YouTube-URL.";

function isRequestBody(value: unknown): value is { url: string } {
  if (typeof value !== "object" || value === null) return false;
  const body = value as { url?: unknown };
  return typeof body.url === "string" && body.url.trim().length > 0;
}

export async function POST(request: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: BAD_REQUEST_MESSAGE }, { status: 400 });
  }
  if (!isRequestBody(body)) {
    return Response.json({ error: BAD_REQUEST_MESSAGE }, { status: 400 });
  }

  const validation = validateYouTubeUrl(body.url);
  if (!validation.valid) {
    return Response.json({ error: validation.error }, { status: 400 });
  }

  const documentId = `youtube-${validation.videoId}`;
  const documentName = `YouTube ${validation.videoId}`;
  try {
    const segments = await fetchYouTubeCaptions(validation.videoId);
    const chunks = transcriptSegmentsToChunks(
      segments,
      documentId,
      documentName,
      validation.canonicalUrl,
      validation.videoId,
    );
    const embeddings = await embedDocumentChunks(
      chunks.map((chunk) => ({ documentName: chunk.documentName, text: chunk.text })),
    );
    await saveDocumentChunks(chunks, embeddings);

    return Response.json({
      documentId,
      name: documentName,
      type: "youtube",
      videoId: validation.videoId,
      sourceUrl: validation.canonicalUrl,
      segmentCount: chunks.length,
    });
  } catch (error) {
    const message = error instanceof YouTubeCaptionsError
      ? error.message
      : error instanceof GeminiEmbeddingError
        ? error.message
      : "Die YouTube-Quelle konnte nicht verarbeitet werden.";
    console.error("YouTube caption ingestion failed.");
    return Response.json(
      { error: message },
      {
        status: error instanceof YouTubeCaptionsError
          ? error.statusCode
          : error instanceof GeminiEmbeddingError
            ? getGeminiEmbeddingHttpStatus(error)
            : 502,
      },
    );
  }
}
