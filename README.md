# Sourcewise – ein NotebookLM-Klon

Ein dokumentenbasiertes Chat-Tool im Stil von [Google NotebookLM](https://notebooklm.google.com/):
Quellen (PDF, Text, YouTube-Untertitel) hinzufügen, Fragen stellen, Antworten ausschließlich auf
Basis der hinzugefügten Quellen erhalten – inklusive Quellenangabe.

Entstanden als Testaufgabe unter 7 Tagen Zeitdruck, mit Fokus auf sauberer Architektur
(Clean Code / IOSP) statt Feature-Vollständigkeit.

**Live-Demo:** [notebooklm-klon-five.vercel.app](https://notebooklm-klon-five.vercel.app/)
_(PDF- und Text-Quellen funktionieren in Production; YouTube-Quellen sind auf Vercel wegen
YouTube-IP-Blocking eingeschränkt, siehe Abschnitt "Bekannte Einschränkung in Production")_

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
| Gespeicherte Quellen beim Öffnen wiederherstellen | ✅ | Dokument-Metadaten werden aus vorhandenen Supabase-Chunks geladen; Fragen und neue Uploads benötigen weiterhin Gemini API-Zugriff |
| YouTube-URL als Quelle | ⚠️ lokal ja, auf Vercel eingeschränkt | Verfügbare YouTube-Untertitel, danach dieselbe RAG-Pipeline – funktioniert zuverlässig lokal, auf Vercel durch YouTubes IP-Blocking gegen Cloud-Provider bekannt unzuverlässig (siehe Abschnitt unten) |
| Audio Overviews, Video Overviews, Mind Maps, Studio-Panel | ❌ bewusst nicht umgesetzt | Eigenständige Multimedia-Pipelines (TTS/Video-Rendering), außerhalb des Zeitrahmens und nicht Kern der Aufgabe |
| Quellen einzeln ein-/ausschalten für den Kontext | ❌ (noch offen) | Aktuell fließen immer alle hochgeladenen Quellen in die Suche ein |

## Tech-Stack

- **Framework:** Next.js 16 (App Router, TypeScript)
- **Styling:** Tailwind CSS 4
- **LLM:** Google Gemini API (`gemini-flash-lite-latest` als Default, über `GEMINI_MODEL`
  konfigurierbar)
- **RAG-Ansatz:** Dokumente werden serverseitig gechunkt, mit dem Gemini-Embedding-Modell
  `gemini-embedding-2` vektorisiert und in Supabase Vector (Postgres/pgvector) gespeichert.
  Fragen werden ebenfalls eingebettet; relevante Abschnitte kommen über eine Supabase-RPC-Funktion
  in den Gemini-Prompt. Alle Quellentypen (PDF, Text, YouTube-Transkript) nutzen bewusst
  **dasselbe** Embedding-Modell für alle Chunks, da die Vektorräume verschiedener
  Gemini-Embedding-Modelle laut offizieller Dokumentation inkompatibel sind (siehe `PROMPT.md`).
  Duplikaterkennung und Batch-Throttling beim Ingest reduzieren vermeidbare Embedding-Aufrufe
  und Anfrage-Spitzen (Details siehe unten).
- **Hosting:** Vercel

## Architektur

Der Code folgt den Clean-Code-Regeln aus [`clean_code.md`](./clean_code.md), insbesondere dem
**IOSP-Prinzip** (Integration Operation Segregation Principle):

```
app/api/chat/route.ts        ← Integration: validiert, orchestriert, formt Antwort
lib/rag/chunk.ts             ← Operation: Dokument in Abschnitte teilen
lib/rag/documentHash.ts      ← Operation: Content-Hash für Duplikaterkennung
lib/rag/embeddings.ts        ← Operation: Gemini-Text in Vektoren umwandeln (gedrosselte Batches)
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
| `SOURCE_ACCESS_PASSWORD` | ja | Gemeinsames Demo-Passwort (mindestens 32 Zeichen); schützt Quellen und API-Routen, kein separates Nutzerkonto |

Die öffentliche Demo ist durch ein gemeinsames Passwort geschützt. Verwende einen zufälligen Wert
mit mindestens 32 Zeichen und hinterlege ihn ausschließlich als serverseitige Umgebungsvariable
(lokal in `.env.local`, bei Vercel in den Project Settings). Nach dem Login werden die in Supabase
gespeicherten Quellen geladen. Alle Personen mit diesem Demo-Passwort teilen sich denselben
Quellenbestand; die Anwendung bietet keine individuellen Nutzerkonten.

Das Embedding-Modell (`gemini-embedding-2`) ist bewusst **nicht** über eine Umgebungsvariable
konfigurierbar, sondern eine feste Konstante in `lib/rag/embeddings.ts` – da die Vektorräume
verschiedener Gemini-Embedding-Modelle inkompatibel sind, würde ein versehentlicher Wechsel
bestehende Retrieval-Ergebnisse stillschweigend unbrauchbar machen (siehe `PROMPT.md`,
Eintrag "Embedding-Modell vereinheitlicht").

### Ingestion: Duplikaterkennung und Embedding-Throttling

Vor dem Chunking berechnet `/api/documents/ingest` einen SHA-256-Hash über den extrahierten,
getrimmten Text und sucht diesen Hash in `document_chunks`. Wird derselbe Textinhalt erneut
hochgeladen, liefert die Route die bereits gespeicherte Dokument-ID zurück und überspringt
Chunking, Embedding und erneutes Speichern. Die Prüfung hängt nicht von der vom Client erzeugten
Dokument-ID ab. Sie vergleicht den extrahierten Text, nicht die Bytes der Originaldatei; zwei
Dateien, aus denen derselbe Text extrahiert wird, gelten daher als Duplikat.

Das Supabase-Schema ergänzt dafür die nullable Spalte `content_hash` und einen Index. Nach
Ausführung des aktuellen [`supabase/schema.sql`](./supabase/schema.sql) werden bestehende
Einträge nicht rückwirkend gehasht: Für bereits gespeicherte Chunks ohne Hash kann die
Duplikaterkennung erst greifen, wenn sie neu ingestiert und mit Hash gespeichert wurden.

Dokument-Chunks werden in geordneten Batches von höchstens 100 Requests eingebettet. Zwischen
aufeinanderfolgenden Batches wartet der Ingest 500 ms; für Dokumente mit höchstens 100 Chunks
entsteht dadurch keine zusätzliche Pause. Das dämpft Anfragespitzen, garantiert aber keine
Einhaltung eines Tokens-pro-Minute-Kontingents: Die Wartezeit berücksichtigt weder die
Tokenmenge pro Batch noch gleichzeitige Uploads. Das Throttling ist pro Ingestion-Anfrage und
keine projektweite Warteschlange. Wiederholte Gemini-429-Antworten werden zusätzlich mit dem
vom Anbieter angegebenen Retry-Zeitpunkt erneut versucht.

Vor dem Start das SQL aus [`supabase/schema.sql`](./supabase/schema.sql) im Supabase SQL Editor
ausführen. Das Schema aktiviert `pgvector`, erstellt die Chunk-Tabelle und die
Retrieval-RPC-Funktion. Die Embedding-Spalte ist auf `vector(3072)` gesetzt, passend zur
aktuell verwendeten Ausgabe von `gemini-embedding-2`.

**Billing-Hinweis:** Der kostenlose Gemini-Developer-API-Tier reicht für wiederholtes Testen
nicht aus (niedrige RPM/TPM-Limits). Ein Google-AI-Pro-Abo (auch Studenten-Variante) hilft hier
**nicht** – dessen Vorteile gelten laut Google nur innerhalb der AI-Studio-Weboberfläche, nicht
für direkte API-Aufrufe. Dieses Projekt nutzt daher Prepaid-Billing im Google-AI-Studio-Projekt
(niedrige Kosten pro Embedding-Aufruf, deutlich höhere Rate-Limits). Siehe `PROMPT.md` für
Details und einen bekannten `402`-Fehlerfall bei aufgebrauchtem/nicht synchronisiertem Guthaben.
Bereits gespeicherte Quellen können auch ohne ein neues Ingest wieder in der Quellenliste erscheinen.
Eine neue Frage benötigt jedoch weiterhin ein Gemini-Embedding und einen Gemini-LLM-Aufruf; gespeicherte
Chunks allein ermöglichen daher keine neue Antwort, wenn der API-Zugriff nicht verfügbar ist.

Für Vercel müssen dieselben Umgebungsvariablen in den Project Settings unter **Environment
Variables** hinterlegt werden. `SUPABASE_SERVICE_ROLE_KEY` darf ausschließlich als
serverseitige Variable verwendet werden und darf weder in Client-Code noch in eine
`NEXT_PUBLIC_*`-Variable gelangen. Nach dem Setzen der Variablen kann Vercel den Build und
die dynamischen API-Routen (`/api/documents/ingest`, `/api/documents/ingest-youtube`,
`/api/documents`, `/api/chat` und `/api/auth`) ausführen. Die Daten- und Ingestion-Routen sind nur
nach Anmeldung mit `SOURCE_ACCESS_PASSWORD` erreichbar.

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

**Bekannte Einschränkung in Production (Vercel):** YouTube erkennt und blockiert Anfragen von
Cloud-/Datacenter-IP-Bereichen (u. a. AWS, GCP, Vercel) systematisch – die App meldet dann
"keine abrufbaren Untertitel", obwohl das Video welche hat. Dieselbe Fehlermeldung entsteht
sowohl bei tatsächlich fehlenden Untertiteln als auch bei IP-Blocking; beides ist auf
Protokollebene nicht unterscheidbar. Das ist ein bekanntes, breit dokumentiertes Problem
inoffizieller YouTube-Transkript-Bibliotheken, kein projektspezifischer Bug (siehe `PROMPT.md`,
Eintrag vom 27.09.2026). Ein zuverlässiger Fix (Residential-Proxy oder bezahlter
Managed-Transcript-Dienst) wäre möglich, wurde aber bewusst zurückgestellt, um zusätzliche
Kosten und Secrets zu vermeiden. Lokal funktioniert die YouTube-Ingestion zuverlässig.

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
