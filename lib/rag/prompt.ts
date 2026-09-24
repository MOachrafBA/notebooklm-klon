import type { SourceChunk } from "./types";

const NO_CONTEXT_MESSAGE = "Es wurden keine passenden Dokumentenabschnitte gefunden.";
const SYSTEM_INSTRUCTION =
  "Du beantwortest Fragen ausschließlich anhand des bereitgestellten Dokumentenkontexts. " +
  "Wenn der Kontext keine Antwort enthält, sage das klar und erfinde keine Fakten.";

export function buildPrompt(question: string, context: SourceChunk[]): string {
  const formattedContext =
    context.length === 0
      ? NO_CONTEXT_MESSAGE
      : context
          .map(
            (chunk) =>
              `[Quelle: ${chunk.documentName}, Abschnitt ${chunk.index + 1}]\n${chunk.text}`,
          )
          .join("\n\n---\n\n");

  return [
    SYSTEM_INSTRUCTION,
    "",
    "Dokumentenkontext:",
    formattedContext,
    "",
    `Frage: ${question}`,
    "",
    "Antwort auf Deutsch:",
  ].join("\n");
}
