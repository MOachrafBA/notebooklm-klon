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
| Text-/Markdown-Extraktion beim Upload | ✅ | Serverseitige Extraktion während der Ingestion |
| Echtes PDF-Text-Parsing (Binärformat) | ✅ | `pdf-parse` extrahiert lesbaren Text serverseitig |
| Retrieval über Embeddings/Vector-DB | ✅ | Gemini-Embeddings und Supabase Vector (`pgvector`) mit Similarity Retrieval |
| YouTube-URL als Quelle | ✅ | Verfügbare YouTube-Untertitel, danach dieselbe RAG-Pipeline |
| Audio Overviews, Video Overviews, Mind Maps, Studio-Panel | ❌ bewusst nicht umgesetzt | Eigenständige Multimedia-Pipelines (TTS/Video-Rendering), außerhalb des Zeitrahmens und nicht Kern der Aufgabe |
| Quellen einzeln ein-/ausschalten für den Kontext | ❌ (noch offen) | Aktuell fließen immer alle hochgeladenen Quellen in die Suche ein |

## Tech-Stack

- **Framework:** Next.js 16 (App Router, TypeScript)
- **Styling:** Tailwind CSS 4
- **LLM:** Google Gemini API (`gemini-flash-lite-latest` als Default, über `GEMINI_MODEL`
  konfigurierbar)
- **RAG-Ansatz:** Dokumente werden serverseitig gechunkt, mit `gemini-embedding-2` vektorisiert
  und in Supabase Vector (Postgres/pgvector) gespeichert. Fragen werden ebenfalls eingebettet;
  relevante Abschnitte kommen über eine Supabase-RPC-Funktion in den Gemini-Prompt.
- **Hosting:** Vercel

## Architektur

Der Code folgt den Clean-Code-Regeln aus [`clean_code.md`](./clean_code.md), insbesondere dem
**IOSP-Prinzip** (Integration Operation Segregation Principle):

```
app/api/chat/route.ts        ← Integration: validiert, orchestriert, formt Antwort
lib/rag/chunk.ts             ← Operation: Dokument in Abschnitte teilen
lib/rag/embeddings.ts        ← Operation: Gemini-Text in Vektoren umwandeln
lib/rag/vectorStore.ts       ← Operation: Chunks in Supabase speichern/abrufen
lib/rag/prompt.ts            ← Operation: Prompt aus Frage + Kontext bauen
lib/llm/client.ts            ← Operation: Gemini-Antwort erzeugen
lib/rag/types.ts             ← gemeinsame Typen (DocumentSource, SourceChunk, ChatMessage, ...)

app/page.tsx                 ← Integration: hält State, verbindet Sidebar und ChatPanel
app/components/Sidebar.tsx   ← Upload-UI, Quellenliste
app/components/ChatPanel.tsx ← Chat-UI, sendet Frage + Quellen an die API
supabase/schema.sql          ← pgvector-Tabelle und Retrieval-RPC
```

`route.ts` enthält bewusst keine fachliche Logik – sie orchestriert Embedding, Supabase-Retrieval,
Prompt-Bau und Gemini-Aufruf. Die Dokument-Ingestion extrahiert Text, chunked das Dokument,
erzeugt Embeddings und speichert die Chunks serverseitig. Supabase-Aufrufe liegen in
`lib/rag/vectorStore.ts`; die Routen enthalten keine direkten Datenbankdetails.

## Setup

```bash
npm install
cp .env.example .env.local
npm run dev
```

App läuft danach unter [http://localhost:3000](http://localhost:3000).

### Umgebungsvariablen

| Variable | Pflicht | Beschreibung |
|---|---|---|
| `GEMINI_API_KEY` | ja | API-Key für die Google Gemini API |
| `GEMINI_MODEL` | nein | Standard: `gemini-flash-lite-latest` |
| `SUPABASE_URL` | ja | URL des Supabase-Projekts |
| `SUPABASE_SERVICE_ROLE_KEY` | ja | Server-only Supabase-Key, niemals im Browser verwenden |

Vor dem Start das SQL aus [`supabase/schema.sql`](./supabase/schema.sql) im Supabase SQL Editor
ausführen. Das Schema aktiviert `pgvector`, erstellt die Chunk-Tabelle und die
Retrieval-RPC-Funktion. Die Embedding-Spalte ist auf `vector(3072)` gesetzt, passend zur
aktuell verwendeten Ausgabe von `gemini-embedding-2`.

Für Vercel müssen dieselben vier Variablen in den Project Settings unter **Environment
Variables** hinterlegt werden. `SUPABASE_SERVICE_ROLE_KEY` darf ausschließlich als
serverseitige Variable verwendet werden und darf weder in Client-Code noch in eine
`NEXT_PUBLIC_*`-Variable gelangen. Nach dem Setzen der Variablen kann Vercel den Build und
die dynamischen API-Routen (`/api/documents/ingest`, `/api/documents/ingest-youtube`,
`/api/chat`) ausführen.

### YouTube-Untertitel und Betriebsgrenzen

Die Route `/api/documents/ingest-youtube` ruft verfügbare Untertitel über das Paket
`youtube-transcript-plus` ab und sendet die Segmente durch dieselbe Embedding- und Supabase-
Pipeline wie andere Quellen. Audio wird weder heruntergeladen noch an AssemblyAI gesendet;
dafür sind keine zusätzlichen YouTube-/Worker-Secrets und keine Audio-Infrastruktur nötig.

Der Abruf nutzt YouTubes nicht-offizielle Innertube-Schnittstelle und kann brechen, wenn YouTube
diese ändert oder Zugriffe begrenzt. Untertitel müssen für das Video abrufbar sein; private,
gelöschte, regional blockierte oder untertitel-deaktivierte Videos funktionieren nicht. Auch
öffentliche Videos haben nicht zwingend abrufbare Untertitel. Der Abruf hat ein 20-Sekunden-
Zeitlimit; Transkripte sind auf 2.000 Segmente und 500.000 Zeichen begrenzt. Die UI kann daher
nicht jede beliebige YouTube-URL erfolgreich importieren. Gemini-Embedding-Kosten fallen bei
erfolgreicher Verarbeitung weiterhin an. Dokument-Chunks werden gebündelt statt parallel als
einzelne Requests gesendet; Gemini-429-Antworten werden mit dem vom Anbieter genannten
Retry-Zeitpunkt erneut versucht und danach als Kontingentfehler zurückgegeben.
Automatisierte Tests verwenden keine echten YouTube-,
Gemini- oder Supabase-Aufrufe.

## Weiterführende Dokumentation

- [`clean_code.md`](./clean_code.md) – verbindliche Clean-Code-/Refactoring-Regeln für dieses Projekt
- [`PROMPT.md`](./PROMPT.md) – chronologische Dokumentation aller verwendeten KI-Master-Prompts inkl. Begründung von Anpassungen
- [`AGENTS.md`](./AGENTS.md) – Agenten-Konfiguration (Claude Code, GitHub Copilot)

## Offene Punkte / nächste Schritte

- Unit-Tests für `lib/rag/*` (Operationen sind bereits isoliert testbar)
- Einzelne Quellen für den Kontext ein-/ausschaltbar machen

## Entwicklungsprozess

Dieses Projekt wurde iterativ mit KI-Unterstützung entwickelt (GitHub Copilot für Code-Generierung,
Claude für Architekturentscheidungen und Code-Review). Der vollständige Master-Prompt-Verlauf ist
in [`PROMPT.md`](./PROMPT.md) dokumentiert.
