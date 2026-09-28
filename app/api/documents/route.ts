import { listDocumentSources } from "@/lib/rag/vectorStore";
import { isDemoAccessAuthorized } from "@/lib/auth/demoAccess";

const SERVER_ERROR_MESSAGE = "Gespeicherte Quellen konnten nicht geladen werden.";

export async function GET(request: Request): Promise<Response> {
  if (!isDemoAccessAuthorized(request)) {
    return Response.json({ error: "Bitte melde dich an, um Quellen zu laden." }, { status: 401 });
  }

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
