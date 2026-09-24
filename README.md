# Sourcewise – ein NotebookLM-Klon

Ein dokumentenbasiertes Chat-Tool im Stil von [Google NotebookLM](https://notebooklm.google.com/):
Quellen (PDF/Text) hochladen, Fragen stellen, Antworten ausschließlich auf Basis der hochgeladenen
Dokumente erhalten – inklusive Quellenangabe.

Entstanden als Testaufgabe unter 7 Tagen Zeitdruck, mit Fokus auf sauberer Architektur
(Clean Code / IOSP) statt Feature-Vollständigkeit.

**Live-Demo:** _(Vercel-Link hier ergänzen, sobald deployed)_

---

## Was ist umgesetzt – und was bewusst nicht

NotebookLM ist 2026 ein umfangreiches Multimedia-Tool (Audio/Video-Overviews, Mind Maps, Slide
Decks, Studio-Panel). Der Kern von NotebookLM ist aber nicht die Multimedia-Ausgabe, sondern das
**Grounding-Versprechen**: Antworten ausschließlich anhand der bereitgestellten Quellen, keine
erfundenen Fakten. Genau darauf liegt der Fokus dieses Klons.

| NotebookLM-Feature | Im Klon umgesetzt | Begründung |
|---|---|---|
| Source-grounded Chat mit Zitaten | ✅ | Kernfunktion, Fokus der 7 Tage |
| Mehrere Quellen hochladen, verwalten, entfernen | ✅ | Sidebar mit aktiver Quellenliste |
| Text-/Markdown-Extraktion beim Upload | ✅ | Direktes Auslesen im Browser (`file.text()`) |
| Echtes PDF-Text-Parsing (Binärformat) | ⚠️ teilweise | Aktuell wird der Rohinhalt gelesen, kein dediziertes PDF-Parsing (z. B. `pdf-parse`) – offener Punkt |
| Retrieval über Embeddings/Vector-DB | ❌ | Stattdessen einfaches Keyword-Scoring über Chunks – bewusste KISS-Entscheidung, kein DB-Setup unter Zeitdruck |
| Audio Overviews, Video Overviews, Mind Maps, Studio-Panel | ❌ bewusst nicht umgesetzt | Eigenständige Multimedia-Pipelines (TTS/Video-Rendering), außerhalb des Zeitrahmens und nicht Kern der Aufgabe |
| Quellen einzeln ein-/ausschalten für den Kontext | ❌ (noch offen) | Aktuell fließen immer alle hochgeladenen Quellen in die Suche ein |

## Tech-Stack

- **Framework:** Next.js 16 (App Router, TypeScript)
- **Styling:** Tailwind CSS 4
- **LLM:** OpenAI API (`gpt-4o-mini` als Default, über `OPENAI_MODEL` konfigurierbar)
- **RAG-Ansatz:** Context-Window-RAG ohne Vector-Datenbank – Dokumente werden serverseitig
  gechunkt, relevante Abschnitte per Keyword-Scoring ausgewählt und direkt in den Prompt
  eingebettet. Bewusst einfach gehalten für Stabilität unter Zeitdruck (siehe `clean_code.md`).
- **Hosting:** Vercel

## Architektur

Der Code folgt den Clean-Code-Regeln aus [`clean_code.md`](./clean_code.md), insbesondere dem
**IOSP-Prinzip** (Integration Operation Segregation Principle):

```
app/api/chat/route.ts        ← Integration: validiert, orchestriert, formt Antwort
lib/rag/chunk.ts             ← Operation: Dokument in Abschnitte teilen
lib/rag/retrieve.ts          ← Operation: relevante Abschnitte zur Frage finden
lib/rag/prompt.ts            ← Operation: Prompt aus Frage + Kontext bauen
lib/llm/client.ts            ← Operation: LLM-Aufruf (OpenAI)
lib/rag/types.ts             ← gemeinsame Typen (DocumentSource, SourceChunk, ChatMessage, ...)

app/page.tsx                 ← Integration: hält State, verbindet Sidebar und ChatPanel
app/components/Sidebar.tsx   ← Upload-UI, Quellenliste
app/components/ChatPanel.tsx ← Chat-UI, sendet Frage + Quellen an die API
```

`route.ts` enthält bewusst keine fachliche Logik – sie ruft nur die vier Operationen in der
richtigen Reihenfolge auf. Jede Operation ist eine reine Funktion ohne Next.js-Abhängigkeit und
damit einzeln unit-testbar.

## Setup

```bash
npm install
cp .env.example .env.local   # OPENAI_API_KEY eintragen
npm run dev
```

App läuft danach unter [http://localhost:3000](http://localhost:3000).

### Umgebungsvariablen

| Variable | Pflicht | Beschreibung |
|---|---|---|
| `OPENAI_API_KEY` | ja | API-Key für OpenAI |
| `OPENAI_MODEL` | nein | Standard: `gpt-4o-mini` |

## Weiterführende Dokumentation

- [`clean_code.md`](./clean_code.md) – verbindliche Clean-Code-/Refactoring-Regeln für dieses Projekt
- [`PROMPT.md`](./PROMPT.md) – chronologische Dokumentation aller verwendeten KI-Master-Prompts inkl. Begründung von Anpassungen
- [`AGENTS.md`](./AGENTS.md) – Agenten-Konfiguration (Claude Code, GitHub Copilot)

## Offene Punkte / nächste Schritte

- Echtes PDF-Text-Parsing statt Rohtext-Auslesen
- Unit-Tests für `lib/rag/*` (Operationen sind bereits isoliert testbar)
- Einzelne Quellen für den Kontext ein-/ausschaltbar machen
- Doppelte System-Instruction (`lib/llm/client.ts` vs. `lib/rag/prompt.ts`) zu einer Quelle zusammenführen

## Entwicklungsprozess

Dieses Projekt wurde iterativ mit KI-Unterstützung entwickelt (GitHub Copilot für Code-Generierung,
Claude für Architekturentscheidungen und Code-Review). Der vollständige Master-Prompt-Verlauf ist
in [`PROMPT.md`](./PROMPT.md) dokumentiert.
