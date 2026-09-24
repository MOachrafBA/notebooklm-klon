Du bist ein erfahrener Fullstack-Entwickler (Next.js App Router, TypeScript, Tailwind CSS). Wir bauen im Rahmen einer hochkarätigen Testaufgabe einen "NotebookLM-Klon" für ein leistungsorientiertes Unternehmen.

WICHTIG: Halte dich strikt an die Regeln in `clean_code.md` (im Projekt-Root, referenziert aus `AGENTS.md`). Insbesondere:
- IOSP (Integration Operation Segregation Principle): `app/api/chat/route.ts` ist eine reine Integration – sie validiert Input, orchestriert Aufrufe und formt die Antwort, enthält aber KEINE fachliche Logik (kein Chunking, kein Prompt-Bau, kein direkter LLM-Fetch-Code inline).
- Fachliche Logik (Chunking, Kontext-Auswahl, Prompt-Bau, LLM-Client) gehört als isolierte, reine Funktionen ("Operationen") nach `lib/rag/` bzw. `lib/llm/` – ohne Next.js-Importe, damit sie einzeln unit-testbar sind.
- SRP: Jede Funktion/Komponente hat genau eine Aufgabe.
- KISS/YAGNI: keine Abstraktionen "für später", kein Multi-LLM-Adapter, solange nur ein Provider gebraucht wird.

Deine Aufgabe ist es, mir den initialen, sauberen Code zu schreiben für:
1. Die Hauptseite `app/page.tsx`
2. Die API-Route `app/api/chat/route.ts`
3. Die dazugehörigen Operationen unter `lib/rag/` (z. B. `chunk.ts`, `retrieve.ts`, `prompt.ts`) und `lib/llm/` (LLM-Client-Aufruf)

Anforderungen an die App:

1. **Layout (NotebookLM-Stil):** Ein modernes Zwei-Spalten-Layout (Tailwind). Links eine Sidebar zum Hochladen von Dokumenten (PDF/Text) und Anzeigen der aktiven Quellen. Rechts ein Chat-Bereich mit Nachrichtenverlauf und Eingabefeld. Falls `page.tsx` dadurch zu groß wird (> ca. 100 Zeilen), lagere Sidebar und Chat-Bereich als eigene Komponenten unter `app/components/` aus (z. B. `Sidebar.tsx`, `ChatPanel.tsx`).
2. **Funktionalität:**
   - Einbindung einer einfachen Upload-Komponente (Dummy oder echte Text-Extraktion).
   - Ein Chat-Interface, das die Fragen des Nutzers zusammen mit dem Dokumenten-Kontext verarbeitet – die eigentliche RAG-Logik läuft über die Operationen aus `lib/rag/`, `route.ts` orchestriert sie nur.
3. **Qualität:** Sauberer TypeScript-Code (keine `any`-Typen, klare `type`/`interface` für Chat-Nachrichten und Dokumentenquellen), gut kommentiert, fehlerfrei und sofort lauffähig in einem Standard Next.js App Router Projekt. Keine Magic Strings/Numbers – Konstanten verwenden.

Gib mir zuerst die Dateistruktur (inkl. `lib/`-Ordner), danach den vollständigen Code für jede Datei einzeln, in dieser Reihenfolge: Operationen (`lib/rag/*.ts`, `lib/llm/*.ts`) zuerst, dann die Integration (`app/api/chat/route.ts`), dann die UI (`app/page.tsx` und ggf. Komponenten).