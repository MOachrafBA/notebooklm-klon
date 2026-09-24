"use client";

import { FormEvent, useState } from "react";
import type { ChatMessage, ChatResponse, DocumentSource } from "@/lib/rag/types";

const CHAT_ENDPOINT = "/api/chat";
const EMPTY_STATE_MESSAGE = "Lade eine Quelle hoch und stelle anschließend eine Frage dazu.";
const REQUEST_ERROR_MESSAGE = "Die Anfrage konnte nicht verarbeitet werden.";

interface ChatPanelProps {
  sources: DocumentSource[];
}

function createMessage(role: ChatMessage["role"], content: string): ChatMessage {
  return { id: crypto.randomUUID(), role, content };
}

export function ChatPanel({ sources }: ChatPanelProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [question, setQuestion] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedQuestion = question.trim();
    if (!trimmedQuestion || sources.length === 0 || isLoading) {
      return;
    }

    setMessages((current) => [...current, createMessage("user", trimmedQuestion)]);
    setQuestion("");
    setIsLoading(true);

    try {
      const response = await fetch(CHAT_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: trimmedQuestion,
          documentIds: sources.map((source) => source.id),
        }),
      });
      const payload: unknown = await response.json();
      if (!response.ok) {
        throw new Error(getApiError(payload));
      }
      if (!isChatResponse(payload)) {
        throw new Error(REQUEST_ERROR_MESSAGE);
      }
      setMessages((current) => [...current, createMessage("assistant", payload.answer)]);
    } catch (error) {
      console.error("Chat submission failed:", error);
      setMessages((current) => [...current, createMessage("assistant", REQUEST_ERROR_MESSAGE)]);
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <section className="flex min-h-0 flex-1 flex-col bg-[#f8f9fc]">
      <header className="border-b border-slate-200 bg-white px-6 py-5 md:px-10">
        <p className="text-sm font-medium text-slate-500">Arbeitsbereich</p>
        <h2 className="mt-1 text-xl font-semibold text-slate-950">Frage deine Quellen</h2>
      </header>

      <div className="flex flex-1 flex-col overflow-y-auto px-6 py-8 md:px-10">
        {messages.length === 0 ? (
          <div className="m-auto max-w-md text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-100 text-2xl text-indigo-600">✦</div>
            <h3 className="mt-5 text-lg font-semibold text-slate-900">Bereit zum Entdecken</h3>
            <p className="mt-2 text-sm leading-6 text-slate-500">{EMPTY_STATE_MESSAGE}</p>
          </div>
        ) : (
          <div className="mx-auto flex w-full max-w-3xl flex-col gap-5">
            {messages.map((message) => (
              <article key={message.id} className={message.role === "user" ? "ml-auto max-w-[85%]" : "max-w-[85%]"}>
                <p className="mb-1 text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">
                  {message.role === "user" ? "Du" : "Sourcewise"}
                </p>
                <div className={`rounded-2xl px-4 py-3 text-sm leading-7 ${message.role === "user" ? "bg-slate-950 text-white" : "border border-slate-200 bg-white text-slate-700"}`}>
                  {message.content}
                </div>
              </article>
            ))}
            {isLoading && <p className="text-sm text-slate-400">Antwort wird erstellt …</p>}
          </div>
        )}
      </div>

      <form onSubmit={handleSubmit} className="border-t border-slate-200 bg-white p-5 md:px-10">
        <div className="mx-auto flex max-w-3xl items-end gap-3 rounded-2xl border border-slate-200 bg-white p-2 shadow-sm">
          <textarea
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            placeholder={sources.length > 0 ? "Stelle eine Frage zu deinen Quellen …" : "Füge zuerst eine Quelle hinzu …"}
            disabled={sources.length === 0 || isLoading}
            rows={1}
            className="min-h-11 flex-1 resize-none bg-transparent px-3 py-3 text-sm text-slate-800 outline-none placeholder:text-slate-400 disabled:cursor-not-allowed"
          />
          <button
            type="submit"
            disabled={!question.trim() || sources.length === 0 || isLoading}
            className="rounded-xl bg-indigo-600 px-4 py-3 text-sm font-medium text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400"
          >
            Senden
          </button>
        </div>
      </form>
    </section>
  );
}

function isChatResponse(value: unknown): value is ChatResponse {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const response = value as { answer?: unknown };
  return typeof response.answer === "string" && response.answer.length > 0;
}

function getApiError(value: unknown): string {
  if (typeof value === "object" && value !== null) {
    const response = value as { error?: unknown };
    if (typeof response.error === "string" && response.error.length > 0) {
      return response.error;
    }
  }

  return REQUEST_ERROR_MESSAGE;
}
