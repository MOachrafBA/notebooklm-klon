import type { SourceChunk } from "./types";

const NO_CONTEXT_MESSAGE = "Es wurden keine passenden Dokumentenabschnitte gefunden.";

/**
 * Einzige Quelle für die Grounding-Instruction. Wird separat als System-Rolle
 * an das LLM übergeben (nicht mehr in den Prompt-Text eingebettet), damit es
 * nur eine Instruction gibt statt einer je in prompt.ts und im LLM-Client.
 */
export const SYSTEM_INSTRUCTION =
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
    "Dokumentenkontext:",
    formattedContext,
    "",
    `Frage: ${question}`,
    "",
    "Antwort auf Deutsch:",
  ].join("\n");
}
