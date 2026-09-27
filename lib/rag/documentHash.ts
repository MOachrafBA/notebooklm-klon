import { createHash } from "node:crypto";

/**
 * Operation: berechnet einen stabilen SHA-256-Hash für Dokumentinhalt.
 * Dient der Duplikaterkennung beim Ingest, unabhängig von der clientseitig
 * generierten Dokument-ID (dieselbe Datei erhält bei jedem Upload eine neue
 * ID, aber denselben Content-Hash).
 */
export function computeContentHash(content: string): string {
  return createHash("sha256").update(content, "utf8").digest("hex");
}
