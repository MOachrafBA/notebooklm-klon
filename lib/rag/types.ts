export const DOCUMENT_TYPES = ["text", "pdf", "youtube"] as const;
export type DocumentType = (typeof DOCUMENT_TYPES)[number];

export const CHAT_ROLES = ["user", "assistant"] as const;
export type ChatRole = (typeof CHAT_ROLES)[number];

export interface DocumentSource {
  id: string;
  name: string;
  type: DocumentType;
  content: string;
  sourceUrl?: string;
  videoId?: string;
}

export interface SourceChunk {
  id: string;
  documentId: string;
  documentName: string;
  text: string;
  index: number;
  sourceUrl?: string;
  videoId?: string;
  speaker?: string | null;
  startMs?: number | null;
  endMs?: number | null;
}

export interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
}

export interface ChatRequest {
  question: string;
  documentIds: string[];
}

export interface ChatResponse {
  answer: string;
}
