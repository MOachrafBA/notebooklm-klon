import { PDFParse } from "pdf-parse";
import { chunkDocument } from "@/lib/rag/chunk";
import { embedDocumentChunk } from "@/lib/rag/embeddings";
import { saveDocumentChunks } from "@/lib/rag/vectorStore";
import { DOCUMENT_TYPES, type DocumentSource } from "@/lib/rag/types";

export const maxDuration = 60;
export const runtime = "nodejs";

const MAX_UPLOAD_SIZE_BYTES = 5_000_000;
const BAD_REQUEST_MESSAGE = "Bitte sende eine gültige Dokumentquelle und Datei.";
const SERVER_ERROR_MESSAGE = "Die Quelle konnte nicht verarbeitet werden.";

function isDocumentMetadata(value: {
  id: FormDataEntryValue | null;
  name: FormDataEntryValue | null;
  type: FormDataEntryValue | null;
}): value is { id: string; name: string; type: DocumentSource["type"] } {
  return (
    typeof value.id === "string" &&
    value.id.length > 0 &&
    typeof value.name === "string" &&
    value.name.length > 0 &&
    typeof value.type === "string" &&
    DOCUMENT_TYPES.includes(value.type as (typeof DOCUMENT_TYPES)[number])
  );
}

async function extractText(file: File, type: DocumentSource["type"]): Promise<string> {
  const data = await file.arrayBuffer();
  if (type === "text") {
    return new TextDecoder().decode(data);
  }

  const parser = new PDFParse({ data: new Uint8Array(data) });
  try {
    const result = await parser.getText();
    return result.text;
  } finally {
    await parser.destroy();
  }
}

export async function POST(request: Request): Promise<Response> {
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return Response.json({ error: BAD_REQUEST_MESSAGE }, { status: 400 });
  }

  const file = formData.get("file");
  const metadata = {
    id: formData.get("id"),
    name: formData.get("name"),
    type: formData.get("type"),
  };
  if (
    !isDocumentMetadata(metadata) ||
    !(file instanceof File) ||
    file.size === 0 ||
    file.size > MAX_UPLOAD_SIZE_BYTES
  ) {
    return Response.json({ error: BAD_REQUEST_MESSAGE }, { status: 400 });
  }

  try {
    const content = (await extractText(file, metadata.type)).trim();
    if (!content) {
      return Response.json({ error: "Die Datei enthält keinen lesbaren Text." }, { status: 400 });
    }
    const document: DocumentSource = { ...metadata, content };
    const chunks = chunkDocument(document);
    const embeddings = await Promise.all(
      chunks.map((chunk) => embedDocumentChunk(chunk.documentName, chunk.text)),
    );
    await saveDocumentChunks(chunks, embeddings);

    return Response.json({ documentId: document.id, content });
  } catch (error) {
    const message = error instanceof Error ? error.message : SERVER_ERROR_MESSAGE;
    console.error("Document ingestion failed:", message);
    return Response.json({ error: message }, { status: 500 });
  }
}
