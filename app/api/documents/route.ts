import { listDocumentSources } from "@/lib/rag/vectorStore";

const SERVER_ERROR_MESSAGE = "Gespeicherte Quellen konnten nicht geladen werden.";

export async function GET(): Promise<Response> {
  try {
    const sources = await listDocumentSources();
    return Response.json({ sources });
  } catch (error) {
    console.error("Loading saved documents failed:", error);
    return Response.json(
      {
        error: SERVER_ERROR_MESSAGE,
        ...(process.env.NODE_ENV !== "production" && error instanceof Error
          ? { details: error.message }
          : {}),
      },
      { status: 500 },
    );
  }
}
