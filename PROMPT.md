# Master-Prompts – Entwicklungslog

Chronologische Dokumentation aller Master-Prompts, die während der Entwicklung genutzt wurden,
inklusive kurzer Begründung. Ziel: nachvollziehbar machen, wie das System gesteuert wurde.

---

## 2026-09-24 – Initialer Scaffold (GitHub Copilot)

**Ziel:** Grundgerüst der App – Layout, Upload-Komponente, Chat-Interface, API-Route.

**Kontext:** Vor dem eigentlichen Prompt wurde `clean_code.md` im Projekt-Root angelegt und aus
`AGENTS.md` referenziert, damit Copilot die IOSP-/SRP-Regeln automatisch mitgeladen bekommt.

**Prompt:**

```
Du bist ein erfahrener Fullstack-Entwickler (Next.js App Router, TypeScript, Tailwind CSS). Wir
bauen im Rahmen einer hochkarätigen Testaufgabe einen "NotebookLM-Klon" für ein
leistungsorientiertes Unternehmen.

WICHTIG: Halte dich strikt an die Regeln in `clean_code.md` (im Projekt-Root, referenziert aus
`AGENTS.md`). Insbesondere:
- IOSP (Integration Operation Segregation Principle): `app/api/chat/route.ts` ist eine reine
  Integration – sie validiert Input, orchestriert Aufrufe und formt die Antwort, enthält aber
  KEINE fachliche Logik (kein Chunking, kein Prompt-Bau, kein direkter LLM-Fetch-Code inline).
- Fachliche Logik (Chunking, Kontext-Auswahl, Prompt-Bau, LLM-Client) gehört als isolierte, reine
  Funktionen ("Operationen") nach `lib/rag/` bzw. `lib/llm/` – ohne Next.js-Importe, damit sie
  einzeln unit-testbar sind.
- SRP: Jede Funktion/Komponente hat genau eine Aufgabe.
- KISS/YAGNI: keine Abstraktionen "für später", kein Multi-LLM-Adapter, solange nur ein Provider
  gebraucht wird.

Deine Aufgabe ist es, mir den initialen, sauberen Code zu schreiben für:
1. Die Hauptseite `app/page.tsx`
2. Die API-Route `app/api/chat/route.ts`
3. Die dazugehörigen Operationen unter `lib/rag/` (z. B. `chunk.ts`, `retrieve.ts`, `prompt.ts`)
   und `lib/llm/` (LLM-Client-Aufruf)

Anforderungen an die App:

1. Layout (NotebookLM-Stil): Ein modernes Zwei-Spalten-Layout (Tailwind). Links eine Sidebar zum
   Hochladen von Dokumenten (PDF/Text) und Anzeigen der aktiven Quellen. Rechts ein Chat-Bereich
   mit Nachrichtenverlauf und Eingabefeld. Falls `page.tsx` dadurch zu groß wird (> ca. 100
   Zeilen), lagere Sidebar und Chat-Bereich als eigene Komponenten unter `app/components/` aus.
2. Funktionalität: Einbindung einer einfachen Upload-Komponente (Dummy oder echte
   Text-Extraktion); ein Chat-Interface, das die Fragen des Nutzers zusammen mit dem
   Dokumenten-Kontext verarbeitet – die eigentliche RAG-Logik läuft über die Operationen aus
   `lib/rag/`, `route.ts` orchestriert sie nur.
3. Qualität: Sauberer TypeScript-Code (keine `any`-Typen, klare `type`/`interface` für
   Chat-Nachrichten und Dokumentenquellen), gut kommentiert, fehlerfrei und sofort lauffähig.
   Keine Magic Strings/Numbers – Konstanten verwenden.

Gib mir zuerst die Dateistruktur, danach den vollständigen Code für jede Datei einzeln, in dieser
Reihenfolge: Operationen zuerst, dann die Integration, dann die UI.
```

**Ergebnis:** 12 Dateien (Sidebar, ChatPanel, page.tsx, route.ts, `lib/rag/*`, `lib/llm/client.ts`).
Code-Review gegen `clean_code.md` durchgeführt (siehe Commit-Historie) – IOSP-Trennung,
Type-Guards statt `any`, benannte Konstanten waren durchgängig eingehalten.

**Commit:** `feat: initial NotebookLM-Klon scaffold (Sidebar, chat, RAG-API)`

---

## 2026-09-24 – System-Instruction geschärft (manuell, mit Claude)

**Ziel:** Die Grounding-Instruction in `lib/rag/prompt.ts` war funktional korrekt, aber schwächer
als nötig – sie forderte das Modell nicht auf, tatsächlich zu zitieren, und ging nicht auf
teilweise beantwortbare Fragen ein.

**Vorgehen:** Keine erneute Copilot-Generierung, sondern gezielte, kleine Anpassung an einer
einzelnen Konstante – bewusst als eigenständiger, überprüfbarer Schritt statt Teil des großen
Scaffolds (Prinzip "kontinuierliche Verbesserung" aus `clean_code.md`).

**Vorher:**
```ts
const SYSTEM_INSTRUCTION =
  "Du beantwortest Fragen ausschließlich anhand des bereitgestellten Dokumentenkontexts. " +
  "Wenn der Kontext keine Antwort enthält, sage das klar und erfinde keine Fakten.";
```

**Nachher:**
```ts
const SYSTEM_INSTRUCTION =
  "Du bist ein präziser, quellentreuer Assistent für dokumentenbasierte Fragen. " +
  "Beantworte Fragen ausschließlich anhand des bereitgestellten Dokumentenkontexts. " +
  "Referenziere in deiner Antwort die genutzten Quellen im Format [Quelle: Name, Abschnitt N]. " +
  "Wenn der Kontext die Frage nicht oder nur teilweise beantwortet, sage das explizit " +
  "und erfinde keine Fakten, die nicht im Kontext stehen.";
```

**Begründung:** Recherche zum tatsächlichen NotebookLM-Verhalten zeigte, dass Quellentreue und
Zitierfähigkeit zentrale Erwartungen an ein solches Tool sind – die Quellenangaben waren im
Kontext bereits vorhanden (`[Quelle: ..., Abschnitt N]`), wurden vom Modell aber nicht angewiesen,
sie auch in der Antwort zu nutzen.

**Bekannter offener Punkt:** `lib/llm/client.ts` setzt zusätzlich eine eigene, leicht andere
System-Message als OpenAI-`system`-Rolle. Die beiden Instruktionen sind aktuell nicht
zusammengeführt (DRY-Verstoß) – geplanter Folge-Schritt.

**Commit:** `refactor(prompt): source-citation requirement in system instruction`

---

## Nächste geplante Prompts

- PDF-Text-Extraktion (echtes Parsing statt Rohtext-Lesen)
- Unit-Tests für `lib/rag/chunk.ts`, `retrieve.ts`, `prompt.ts`
- Zusammenführung der doppelten System-Instruction
