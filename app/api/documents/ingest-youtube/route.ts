import { fetchYouTubeAudio } from "@/lib/youtube/audioProvider";
import { transcribeAudio } from "@/lib/youtube/assemblyai";
import { transcriptSegmentsToChunks } from "@/lib/youtube/mapping";
import { validateYouTubeUrl } from "@/lib/youtube/url";
import { embedDocumentChunk } from "@/lib/rag/embeddings";
import { saveDocumentChunks } from "@/lib/rag/vectorStore";

export const runtime = "nodejs";
// Audio provider (30s), AssemblyAI polling (up to 60s) and embeddings need
// headroom; this remains below Vercel's supported Node.js function limits.
export const maxDuration = 300;

const BAD_REQUEST_MESSAGE = "Bitte sende eine gültige öffentliche YouTube-URL.";

function isRequestBody(value: unknown): value is { url: string } {
  if (typeof value !== "object" || value === null) return false;
  const body = value as { url?: unknown };
  return typeof body.url === "string" && body.url.trim().length > 0;
}

function getErrorStatus(error: unknown): number {
  if (error instanceof Error && error.message.includes("Zeitlimit")) return 504;
  if (error instanceof Error && error.message.includes("Größenlimit")) return 413;
  return 502;
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
    const audio = await fetchYouTubeAudio(validation.canonicalUrl, validation.videoId);
    const segments = await transcribeAudio(audio);
    const chunks = transcriptSegmentsToChunks(
      segments,
      documentId,
      documentName,
      validation.canonicalUrl,
      validation.videoId,
    );
    const embeddings = await Promise.all(
      chunks.map((chunk) => embedDocumentChunk(chunk.documentName, chunk.text)),
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
    const message = error instanceof Error ? error.message : "Die YouTube-Quelle konnte nicht verarbeitet werden.";
    console.error("YouTube ingestion failed:", message);
    return Response.json({ error: message }, { status: getErrorStatus(error) });
  }
}
