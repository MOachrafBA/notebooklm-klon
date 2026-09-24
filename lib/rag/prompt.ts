import type { SourceChunk } from "./types";

const NO_CONTEXT_MESSAGE = "Es wurden keine passenden Dokumentenabschnitte gefunden.";
const SYSTEM_INSTRUCTION =
  "Du bist ein präziser, quellentreuer Assistent für dokumentenbasierte Fragen. " +
  "Beantworte Fragen ausschließlich anhand des bereitgestellten Dokumentenkontexts. " +
  "Referenziere in deiner Antwort die genutzten Quellen im Format [Quelle: Name, Abschnitt N]. " +
  "Wenn der Kontext die Frage nicht oder nur teilweise beantwortet, sage das explizit " +
  "und erfinde keine Fakten, die nicht im Kontext stehen.";

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
