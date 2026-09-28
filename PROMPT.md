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

## 2026-09-24 – Wechsel von OpenAI zu Gemini (manuell)

**Ziel:** LLM-Anbindung von OpenAI (`gpt-4o-mini`) auf Google Gemini umstellen, da NotebookLM selbst
auf dem Gemini-3-Ökosystem läuft – das Original des Klons nutzt dasselbe Modell-Fundament.

**Recherche:** Der ursprüngliche Plan ("Gemini 1.5 Pro", wie in frühen NotebookLM-Berichten kolportiert)
war veraltet. Aktueller Stand (Stand September 2026): NotebookLM läuft auf Gemini 3. Als Modell für
den Klon wurde `gemini-3.6-flash` gewählt – seit 21. Juli 2026 Googles neuer Standard-Flash-Modell,
kein Preview-Status, gutes Preis-Leistungs-Verhältnis für einen dokumentenbasierten Chat (kein
komplexes Reasoning nötig, dafür wäre `gemini-3.1-pro-preview` die Alternative gewesen).

**Vorgehen:** Da `lib/llm/client.ts` durch IOSP isoliert ist (keine Next.js-Abhängigkeiten, keine
fachliche Logik außerhalb des API-Aufrufs), war der Wechsel auf einen komplett anderen Provider
nur eine Dateiänderung – `route.ts`, `chunk.ts`, `retrieve.ts` und `prompt.ts` blieben unberührt.

**Nebenbei erledigt:** Die zuvor dokumentierte doppelte System-Instruction (eine in `client.ts`, eine
in `prompt.ts`) wurde dabei zusammengeführt. `SYSTEM_INSTRUCTION` existiert jetzt nur noch in
`lib/rag/prompt.ts`, wird von dort exportiert und im Gemini-Client als eigene `systemInstruction`
übergeben (statt wie vorher in den Prompt-Text eingebettet zu sein).

**Env-Vars geändert:** `OPENAI_API_KEY`/`OPENAI_MODEL` → `GEMINI_API_KEY`/`GEMINI_MODEL`.

---

## 2026-09-24 – Migration von Keyword-RAG zu Supabase Vector RAG (Copilot)

**Ziel:** Die bisherige, flüchtige Keyword-Suche durch persistentes semantisches Retrieval mit
Supabase Vector (`pgvector`) ersetzen. Die Lösung muss auf Vercel funktionieren und weiterhin den
IOSP-/SRP-Regeln aus `clean_code.md` entsprechen.

**Prompt:**

```text
Du bist ein erfahrener Fullstack-Entwickler für Next.js App Router, TypeScript, Vercel,
Google Gemini API und Supabase Vector (Postgres/pgvector).

Migriere die bestehende NotebookLM-Klon-Anwendung von Keyword-RAG zu persistentem Vector-RAG.
Nutze das Gemini-Embedding-Modell `gemini-embedding-2` über die REST-API
`models.embedContent`. Verwende für Dokument-Chunks das Format
`title: {documentName} | text: {chunkText}` und für Benutzerfragen das Format
`task: question answering | query: {question}`.

Halte dich strikt an `clean_code.md` und insbesondere an IOSP:

- `app/api/chat/route.ts` ist ausschließlich eine Integration. Sie validiert den Request,
  orchestriert Embedding, Supabase-Retrieval, Prompt-Bau und LLM-Aufruf und formt die Response.
- `lib/rag/embeddings.ts` ist eine isolierte Operation für Gemini-Embeddings. Sie darf keine
  Next.js- oder Supabase-Imports enthalten.
- `lib/rag/vectorStore.ts` kapselt alle Supabase-Aufrufe für Speichern und Retrieval. Der
  Service-Role-Key darf ausschließlich serverseitig über Environment-Variablen verwendet werden.
- `lib/rag/chunk.ts` und `lib/rag/prompt.ts` bleiben fachlich isolierte Operationen.
- Keine `any`-Typen, keine direkten Datenbankdetails in API-Routen, keine stillen Fehler und
  keine unnötigen Adapter-Abstraktionen.

Implementiere die vertikale Strecke:

1. `POST /api/documents/ingest` validiert eine Dokumentquelle, chunked sie, erzeugt Embeddings
   und speichert Chunks plus Vektoren in Supabase.
2. `POST /api/chat` akzeptiert nur `question` und `documentIds`, embeddet die Frage, ruft passende
   Chunks über eine Supabase-RPC-Funktion ab, baut den Grounding-Prompt und ruft Gemini auf.
3. Passe UI und Types so an, dass beim Chat keine kompletten Dokumentinhalte mehr übertragen
   werden, sondern nur noch Quellen-IDs.
4. Ergänze `supabase/schema.sql` mit pgvector-Tabelle, Retrieval-RPC und aktiviertem Row Level
   Security. Verwende keine öffentlichen Policies, solange ausschließlich serverseitig über den
   Service-Role-Key zugegriffen wird; dokumentiere diese Sicherheitsgrenze.
5. Ergänze `.env.example` und README um die benötigten Gemini-/Supabase-Variablen sowie die
   notwendige Ausführung des SQL-Schemas.

Wichtig:

- Rate die Embedding-Dimension nicht. Dokumentiere, dass die Supabase-Spalte nach einem echten
  Gemini-Test auf `vector(N)` festgelegt werden muss.
- Verwende Timeout, API-Key-Prüfung, Response-Validierung und explizite Fehlerbehandlung.
- Entferne das alte Keyword-Retrieval nur dann, wenn die Vector-Retrieval-Strecke vollständig
  verdrahtet ist.
- Prüfe am Ende `npm run lint`, `npm run build` und `git diff --check`.
- Zeige abschließend die geänderte Architektur, die benötigten Environment-Variablen und alle
  offenen Infrastruktur-Schritte für Supabase und Vercel.
```

**Umgesetzte Änderungen:**

- `lib/rag/embeddings.ts` hinzugefügt: Gemini-Embedding-Requests mit dokumenten- und
  fragenbezogenen Retrieval-Formaten, Timeout und Response-Validierung.
- `lib/rag/vectorStore.ts` hinzugefügt: serverseitiger Supabase-Client, Upsert von Chunks und
  RPC-basiertes Similarity Retrieval.
- `app/api/documents/ingest/route.ts` hinzugefügt: Dokument-Ingestion als eigene Integration.
- `app/api/chat/route.ts` auf `documentIds` und semantisches Retrieval umgestellt.
- `app/page.tsx` und `app/components/Sidebar.tsx` auf asynchrones Ingestion-Verhalten umgestellt.
- `app/components/ChatPanel.tsx` sendet nur noch Fragen und Quellen-IDs.
- `lib/rag/retrieve.ts` entfernt, da Keyword-Retrieval durch Supabase Vector ersetzt wurde.
- `supabase/schema.sql` ergänzt um Tabelle, Retrieval-RPC und aktivierte RLS.
- `@supabase/supabase-js` als Server-Abhängigkeit ergänzt.
- README und `.env.example` um Supabase-Konfiguration erweitert.

**Sicherheitsentscheidung:** RLS ist auf `document_chunks` aktiviert. Es werden bewusst keine
öffentlichen Policies erstellt, weil der aktuelle Zugriff ausschließlich serverseitig über
`SUPABASE_SERVICE_ROLE_KEY` erfolgt. Der Service-Role-Key darf niemals in Client-Code oder
`NEXT_PUBLIC_*`-Variablen gelangen. Sobald ein direkter Benutzerzugriff aus dem Browser oder
Multi-User-Unterstützung hinzukommt, müssen identitätsgebundene RLS-Policies ergänzt werden.

**Validierung:** `npm run lint`, `npm run build` und `git diff --check` erfolgreich.

---

## 2026-09-25 – Produktions-Build für PDF-Parsing (manuell)

**Ausgangslage:** Die PDF-Extraktion mit `pdf-parse` funktionierte lokal im Development-Modus,
aber der Next.js-16-Production-Build schlug mit `non-ecmascript placeable asset` fehl. Ursache
war das native `@napi-rs/canvas`-Binding, das Turbopack nicht in einen ESM-Chunk einordnen kann.

**Lösung:** `pdf-parse` und `@napi-rs/canvas` wurden in `next.config.ts` über
`serverExternalPackages` vom Server-Bundling ausgenommen. Dadurch lädt Node.js die nativen
Abhängigkeiten zur Laufzeit, während der Build erfolgreich bleibt.

**Validierung:** `npm run build` erfolgreich; TypeScript-Prüfung ohne Fehler; PDF-Parsing im
lokalen Production-Modus mit `npm run start` funktionsfähig.

**Dokumentationsabgleich:** README, PROMPT und `.env.example` enthalten jetzt die aktuelle
Supabase-Vector-RAG-Architektur, die serverseitige PDF-Extraktion und die erforderlichen
`SUPABASE_URL`-/`SUPABASE_SERVICE_ROLE_KEY`-Variablen.

---

## 2026-09-25: YouTube-URL-Ingestion (Master-Prompt)

**Ziel:** Die bestehende Dokument-Ingestion soll um YouTube-URLs erweitert werden. Ein Nutzer
soll eine öffentliche YouTube-URL als Quelle hinzufügen können. Der Videoinhalt wird in
Textform gewonnen, in Chunks geteilt, eingebettet und in Supabase Vector gespeichert. Danach
muss die Quelle im bestehenden Chat über ihre `documentId` wie eine PDF- oder Textquelle
retrieval-fähig sein.

**Master-Prompt:**

```text
Du bist ein erfahrener Senior-Engineer für Next.js 16 App Router, TypeScript, Vercel,
Google Gemini API und Supabase Vector. Erweitere die bestehende NotebookLM-Klon-Anwendung
um robuste YouTube-URL-Ingestion. Arbeite zuerst investigativ: Lies die relevanten Dateien,
die Next.js-16-Dokumentation in node_modules/next/dist/docs/ und die bestehende
clean_code.md. Verändere keine unabhängigen Bereiche und beginne erst danach mit der
Implementierung.

## Fachliches Ziel

Ein Nutzer soll eine öffentliche YouTube-URL als neue Quelle hinzufügen können. Die URL muss
serverseitig validiert werden. Der Inhalt soll als Transkript bezogen werden, anschließend
dieselbe bestehende Pipeline verwenden wie bei PDF/Text:

YouTube-URL → Transkript → DocumentSource → Chunking → Gemini-Embeddings
→ Supabase-Vector-Speicherung → Chat-Retrieval über documentId.

Die Lösung muss für lokale Entwicklung und Vercel-Production geeignet sein. Verwende keine
lokale oder dauerhafte Dateiablage und keine Lösung, die stillschweigend einen langen
Download-/Transkriptionsprozess in einer Vercel-Request-Function voraussetzt. Bewerte vor
der Implementierung die Laufzeit- und Provider-Anforderungen der gewählten Transkriptquelle.
Wenn ein externer Transkriptionsprovider erforderlich ist, dokumentiere die notwendige
Environment-Variable, den Timeout, die Kosten-/Laufzeitgrenze und die Fehlerfälle. Keine
Secrets in Client-Code, Git oder Dokumentationsbeispielen.

## Architektur- und Clean-Code-Regeln

- Halte dich strikt an clean_code.md, insbesondere SRP, IOSP, DRY, KISS und YAGNI.
- API-Routen sind Integrationen: validieren, orchestrieren und Responses formen.
- Extraktion, URL-Parsing, Provider-Response-Validierung und Metadatenumwandlung gehören in
  testbare Funktionen unter lib/; sie dürfen keine Next.js-Imports enthalten.
- Wiederverwende chunkDocument, Embedding-Logik und saveDocumentChunks statt parallele
  Implementierungen anzulegen.
- Erweitere die bestehenden Typen um einen passenden Quellentyp (zum Beispiel youtube) und
  um sourceUrl/Metadaten nur dort, wo dies für Retrieval oder Zitate tatsächlich erforderlich
  ist. Bestehende PDF-/Text-Quellen müssen abwärtskompatibel bleiben.
- Verwende keine any-, unknown-as- oder breit gefassten Typ-Casts als Abkürzung. Validierung
  externer Daten muss über explizite Type Guards erfolgen.
- Fehler dürfen nicht verschluckt werden. Gib verständliche 4xx-Fehler für ungültige URLs
  und klare 5xx-Fehler für Provider-, Transkriptions- oder Supabase-Probleme zurück.

## Funktionale Anforderungen

1. Ergänze einen dedizierten serverseitigen Endpoint für YouTube-Ingestion oder erweitere den
   bestehenden Endpoint nur, wenn dadurch die Verantwortlichkeiten klarer bleiben.
2. Akzeptiere ausschließlich valide öffentliche YouTube-URLs. Unterstütze mindestens
   youtube.com/watch?v=... und youtu.be/...; lehne fremde Hosts, leere IDs und offensichtlich
   manipulierte Eingaben ab.
3. Begrenze URL-Länge, Request-Dauer und Transkriptgröße. Definiere benannte Konstanten.
4. Validiere die Provider-Antwort: leeres, fehlerhaftes oder nicht verfügbares Transkript
   muss eine explizite Fehlermeldung erzeugen.
5. Speichere die Quelle so, dass sie im bestehenden Sidebar-/Chat-Flow erscheint und über
   ihre ID in Supabase gefunden wird. Der Chat darf keine vollständigen Transkripte vom
   Browser an die API senden.
6. Bewahre die Herkunft der Quelle für Antworten auf: mindestens YouTube-URL, Videotitel
   sofern verfügbar und Transkriptabschnitt/Index. Erfinde keine Seiten- oder Zeitstempel.
7. Behandle Videos ohne Untertitel, private/gelöschte Videos, blockierte Regionen,
   Provider-Timeouts, Rate Limits und doppelte Quellen explizit.
8. Aktualisiere README.md und .env.example mit Setup, Provider-Konfiguration,
   Sicherheitsgrenzen und lokalem/Vercel-Betrieb. Dokumentiere, ob eine zusätzliche
   Infrastruktur oder ein Vercel-kompatibler externer Dienst nötig ist.
9. Aktualisiere die UI mit einer klaren Eingabemöglichkeit für YouTube-URLs, ohne den
   bestehenden Datei-Upload unübersichtlich oder regressionsanfällig zu machen.

## Tests und Verifikation

Ergänze fokussierte Tests für:

- gültige und ungültige YouTube-URL-Varianten,
- URL- und Host-Validierung,
- Provider-Response-Parsing und leere Transkripte,
- Mapping in DocumentSource/SourceChunk,
- Fehlerantworten des Ingestion-Endpoints,
- unverändertes Verhalten für PDF-/Text-Ingestion.

Führe anschließend mindestens aus:

- npm run lint
- npm run build
- git diff --check

Teste zusätzlich den Endpoint mit einer ungültigen URL, ohne einen echten Provider-Call
auszulösen. Teste den erfolgreichen Providerpfad mit einem Mock oder einer isolierten
Provider-Funktion. Führe keine kostenpflichtigen externen API-Calls in Tests aus.

## Abschlussbericht

Zeige abschließend:

1. die geänderten Dateien und die Verantwortlichkeit jeder Änderung,
2. den vollständigen Datenfluss von der YouTube-URL bis zum Supabase-Retrieval,
3. neue Environment-Variablen und deren Server-only-Grenzen,
4. die behandelten Fehler- und Laufzeitgrenzen,
5. die ausgeführten Validierungsbefehle mit Ergebnissen,
6. verbleibende Einschränkungen, insbesondere fehlende Transkripte und
   nicht garantierte Zeitstempel.
```
---

## 2026-09-25 – Schritt 2: YouTube-Audio abrufen und Ingestion verbinden (Agenten-Prompt)

**Ausgangslage:** Die YouTube-URL-Validierung ist in `lib/youtube/url.ts` implementiert.
Die AssemblyAI-Operation in `lib/youtube/assemblyai.ts` kann Audio hochladen, einen
Transkriptionsjob starten, den Status pollen und Sprechersegmente mit Zeitstempeln validiert
zurückgeben. Die eigentliche Audio-Beschaffung und die Verbindung mit der bestehenden
Dokument-Ingestion fehlen noch.

**Prompt für den nächsten Agenten:**

```text
Du bist ein Senior Fullstack Engineer für Next.js 16 App Router, TypeScript, Vercel,
AssemblyAI, Google Gemini und Supabase Vector. Implementiere den nächsten vertikalen
Abschnitt der YouTube-URL-Ingestion in diesem Repository.

## Vor der Implementierung

1. Lies AGENTS.md, clean_code.md, README.md und den relevanten YouTube-Abschnitt in
   PROMPT.md.
2. Lies vollständig:
   - lib/youtube/url.ts
   - lib/youtube/url.test.ts
   - lib/youtube/assemblyai.ts
   - lib/youtube/assemblyai.test.ts
   - lib/rag/types.ts
   - lib/rag/chunk.ts
   - lib/rag/embeddings.ts
   - lib/rag/vectorStore.ts
   - app/api/documents/ingest/route.ts
3. Lies die aktuelle Next.js-16-Dokumentation unter node_modules/next/dist/docs/,
   insbesondere Route Handler, Runtime-Konfiguration und Server-External-Packages.
4. Prüfe package.json, .env.example, next.config.ts und den aktuellen Git-Status.
5. Übernimm keine Änderungen außerhalb des YouTube-Features und überschreibe keine
   uncommitted Änderungen anderer Arbeitsschritte.

## Ziel

Verbinde eine valide öffentliche YouTube-URL mit der bestehenden RAG-Pipeline:

YouTube-URL → Video-ID validieren → Audio sicher abrufen → AssemblyAI transkribieren
→ Transcript-Segmente in SourceChunks umwandeln → Gemini-Embeddings
→ Supabase Vector speichern → Quelle im Chat über documentId verwenden.

PDF- und Text-Ingestion müssen unverändert weiter funktionieren.

## Kritische Architekturentscheidung

Bewerte zuerst, ob Audio-Download mit yt-dlp/FFmpeg innerhalb einer Next.js-
Vercel-Serverless-Function technisch zuverlässig und lizenz-/betriebsseitig vertretbar ist.
Implementiere keine scheinbar funktionierende Lösung, die wegen fehlendem FFmpeg, langer
Laufzeit, großem Speicherbedarf, nicht beschreibbarem Dateisystem oder Vercel-Timeouts
in Production ausfällt.

Wähle nach dieser Bewertung eine klar dokumentierte Lösung:

- Wenn ein Vercel-kompatibler direkter Audioabruf möglich ist, kapsle ihn in eine kleine,
  testbare serverseitige Operation ohne dauerhafte Dateien. Begrenze Downloadgröße,
  MIME-Typen, Redirects, URL-Länge und Laufzeit.
- Wenn yt-dlp/FFmpeg eine separate Worker- oder externe Infrastruktur benötigt, implementiere
  keine lokale Täuschung. Dokumentiere die Grenze und kapsle den Audio-Provider so, dass
  die spätere Worker-Anbindung möglich ist.
- Falls du für diesen vertikalen Schritt einen externen Audio-Provider verwendest,
  dokumentiere Endpoint, Authentifizierung, Kosten-/Laufzeitgrenzen, Datenschutz und
  Environment-Variablen. Secrets dürfen nur serverseitig gelesen werden.

## Implementierungsanforderungen

1. Verwende `validateYouTubeUrl` aus `lib/youtube/url.ts`; dupliziere keine URL-Parsing-Logik.
2. Erstelle eine dedizierte serverseitige Operation für den Audioabruf oder Provider-Aufruf.
   Sie darf keine Next.js-Imports enthalten und muss externe Responses explizit validieren.
3. Erstelle einen dedizierten Endpoint, vorzugsweise
   `app/api/documents/ingest-youtube/route.ts`.
   Der Endpoint soll:
   - JSON mit `url` und einer serverseitig erzeugten oder validierten Quellen-ID akzeptieren,
   - ungültige Inputs mit 400 beantworten,
   - die URL validieren,
   - Transkriptsegmente abrufen,
   - sie in eine `DocumentSource` und/oder `SourceChunk[]` überführen,
   - die vorhandenen Embedding- und Supabase-Funktionen wiederverwenden,
   - keine vollständigen Transkripte an den Browser zurückgeben,
   - eine minimale Response mit `documentId`, `name`, `type` und optionalen Metadaten liefern.
4. Verwende für YouTube-Segmente die vorhandenen RAG-Typen oder erweitere sie minimal.
   Bewahre `sourceUrl`, `videoId`, `speaker`, `startMs` und `endMs` nur dort auf, wo sie
   tatsächlich für Speicherung und Zitate benötigt werden. Erfinde keine Seitenzahlen.
5. Passe das Supabase-Schema und `vectorStore.ts` nur an, wenn die Metadaten für Retrieval
   oder Quellenangaben erforderlich sind. Bestehende Rows und die PDF-/Text-Strecke müssen
   kompatibel bleiben. Begründe jede Schemaänderung.
6. Verwende klare, benannte Konstanten für maximale Audiodateigröße, Request-Timeout,
   Transkriptgröße, maximale Segmentzahl und Polling-Grenzen.
7. Behandle explizit:
   - private, gelöschte oder nicht verfügbare Videos,
   - fehlende Audiospur oder fehlendes Transkript,
   - AssemblyAI-Fehler, Rate Limits und Timeouts,
   - zu große Dateien und zu lange Transkripte,
   - doppelte oder bereits gespeicherte Quellen,
   - Provider-Antworten mit ungültigem JSON oder fehlenden Pflichtfeldern.
8. Logge keine API-Keys, Audioinhalte oder vollständigen Transkripte. Verwende keine
   stillen Fallbacks und keine breiten `catch`-Blöcke ohne klare Fehlerantwort.
9. Halte `runtime = "nodejs"` für die Route fest, wenn Node-APIs benötigt werden, und
   erkläre diese Entscheidung. Prüfe `maxDuration` gegen den tatsächlichen Ablauf; erhöhe
   es nicht ohne Begründung.

## UI- und Typgrenze

Wenn die UI für den End-to-End-Flow erforderlich ist, ergänze eine kleine, klare
YouTube-URL-Eingabe in der Sidebar und zeige während der Verarbeitung einen Ladezustand.
Verändere den bestehenden Datei-Upload nicht unnötig. Die UI darf nur Metadaten und
documentId verwalten; Transkript und API-Keys bleiben serverseitig.

## Tests

Schreibe fokussierte Tests ohne echte AssemblyAI-, YouTube- oder Supabase-Aufrufe:

- Audio-Provider: Response-Validierung, falscher MIME-Typ, Größenlimit, Timeout und
  Providerfehler,
- Mapping eines Transcript-Segments zu SourceChunk-Metadaten,
- Request-Validierung der YouTube-Route,
- 400 für ungültige URLs,
- 5xx oder standardisierte Providerfehler für Transkriptionsprobleme,
- Regression für bestehende PDF-/Text-Ingestion.

Mocke externe Abhängigkeiten an ihrer Integrationsgrenze. Führe keinen kostenpflichtigen
API-Call in automatisierten Tests aus. Ein optionaler manueller Smoke-Test mit einem kurzen
öffentlichen Video muss ausdrücklich als kostenpflichtig und nicht als CI-Test dokumentiert
werden.

## Dokumentation und Validierung

Aktualisiere README.md und .env.example mit:

- `ASSEMBLYAI_API_KEY` als server-only Variable,
- dem gewählten Audioabruf,
- lokalen Voraussetzungen,
- Vercel-Einschränkungen,
- Kosten-/Laufzeitlimits,
- bekannten Einschränkungen bei privaten Videos und fehlenden Transkripten.

Führe aus:

- npm run lint
- npm run build
- die fokussierten YouTube-Tests
- git diff --check

Wenn `next build` auf Windows oder wegen einer externen Infrastruktur scheitert, unterscheide
präzise zwischen Code-/TypeScript-Fehlern und Umgebungs-/Worker-Fehlern und verschweige den
Fehler nicht.

## Abschlussbericht

Berichte:

1. die Audioabruf-Entscheidung und ihre Vercel-Begründung,
2. den vollständigen Datenfluss bis Supabase,
3. jede geänderte Datei und ihre Verantwortung,
4. neue Limits und Fehlerbehandlung,
5. neue Environment-Variablen ohne Secret-Werte,
6. Tests und deren Ergebnisse,
7. verbleibende Einschränkungen und ein sicherer nächster Schritt.
```
---

## Nächste geplante Prompts

- Unit-Tests für `lib/rag/chunk.ts`, `embeddings.ts`, `vectorStore.ts` und `prompt.ts`
- Identitätsgebundene Supabase-RLS-Policies für Multi-User-Zugriff ergänzen

---

## 2026-09-26 – Embedding-Modell vereinheitlicht statt pro Quelle gesplittet (manuell, mit Claude)

**Ausgangslage:** Überlegung, `gemini-embedding-001` exklusiv für Text (PDF/MD) und
`gemini-embedding-2` exklusiv für YouTube-Quellen zu verwenden, in der Annahme, YouTube brauche
echte Multimodalität.

**Gegencheck gegen die offizielle Gemini-API-Doku (ai.google.dev/gemini-api/docs/embeddings):**

- Die Vektorräume von `gemini-embedding-001` und `gemini-embedding-2` sind laut Google explizit
  **inkompatibel** – Embeddings der beiden Modelle sind nicht direkt vergleichbar. Da die
  Chat-Suche (`match_document_chunks`) eine einzige Similarity-Abfrage über alle Chunks eines
  Nutzers macht, hätte ein Mix aus beiden Modellen in derselben Vektor-Spalte zu einer stillen,
  semantisch falschen Suche geführt (kein Fehler, aber bedeutungslose Ähnlichkeitswerte).
- Die eigene YouTube-Pipeline (AssemblyAI transkribiert Audio zu Text, erst danach Chunking/
  Embedding) verarbeitet ohnehin nur Text – der ursprüngliche Grund für Multimodalität
  (rohes Audio/Video/Bild direkt embedden) trifft auf den aktuellen Anwendungsfall nicht zu.
- `gemini-embedding-2` ist laut Modell-Tabelle inzwischen **Stable** (GA seit April 2026, nicht
  mehr Preview), hat ein größeres Kontextfenster (8.192 statt 2.048 Tokens) und das bereits
  implementierte Prompt-Format (`title: ... | text: ...`, `task: question answering | query: ...`)
  entspricht exakt der von `gemini-embedding-2` verlangten Konvention.

**Entscheidung:** Einheitlich `gemini-embedding-2` für alle Chunks (PDF, MD, YouTube-Transkript).
`gemini-embedding-001` wurde als Option aus `lib/rag/embeddings.ts` entfernt, `EMBEDDING_MODEL`
aus `.env.example` gestrichen (Modell ist jetzt eine feste Konstante, nicht mehr konfigurierbar),
um zu verhindern, dass später versehentlich beide Modelle gemischt werden.

---

## 2026-09-26 – Rate-Limit-Entlastung: Ingestion-Throttling + Duplikat-Erkennung (manuell)

**Ausgangslage:** Free-Tier-Kontingent für `gemini-embedding-2` wiederholt überschritten
(Google-AI-Studio-Dashboard zeigte u. a. 107/100 für Embedding-2 und 30.76K/30K für ein
Token-Kontingent). Auslöser war unter anderem wiederholtes Testen mit derselben PDF-Datei – jeder
erneute Upload hat die Datei komplett neu gechunkt und eingebettet, obwohl der Inhalt identisch
war. Billing-Upgrade war explizit keine Option (Free-Tier soll beibehalten werden).

**Bewusst verworfen:** Ein zweites Embedding-Modell zur Lastverteilung einzusetzen (siehe
vorheriger Eintrag) – hätte das Rate-Limit-Problem zwar mutmaßlich entschärft, aber die
Vektorsuche durch inkompatible Embedding-Räume beschädigt. Rate-Limits und Retrieval-
Korrektheit sind zwei getrennte Probleme und wurden bewusst getrennt gelöst.

**Umsetzung:**

1. **Content-Hash-Duplikaterkennung** (`lib/rag/documentHash.ts`, neue isolierte Operation):
   SHA-256-Hash des extrahierten Textinhalts. `app/api/documents/ingest/route.ts` prüft vor
   Chunking/Embedding, ob bereits ein Dokument mit demselben Hash in Supabase existiert
   (`findDocumentIdByContentHash` in `vectorStore.ts`) und gibt bei einem Treffer direkt die
   bestehende `documentId` zurück, ohne erneut zu embedden. `content_hash` wurde als Spalte plus
   Index in `supabase/schema.sql` ergänzt. `app/page.tsx` verwendet jetzt die vom Server
   zurückgegebene `documentId` statt der clientseitig generierten ID (Konsistenz mit dem
   YouTube-Pfad, der das bereits so gemacht hat) – sonst hätte ein erkanntes Duplikat im
   Chat auf eine ID verwiesen, unter der in Supabase keine Chunks liegen.
2. **Batch-Throttling** (`lib/rag/embeddings.ts`): 500ms Pause zwischen aufeinanderfolgenden
   Embedding-Batches bei Dokumenten mit mehr als 100 Chunks, um Token-Bursts innerhalb einer
   Minute zu vermeiden. Wirkt sich auf kleine Dokumente (ein Batch) nicht aus.

**Bekannte Grenze:** Das Throttling wirkt nur innerhalb einer einzelnen Ingestion-Anfrage. Werden
mehrere Dateien gleichzeitig hochgeladen, laufen ihre Embedding-Batches weiterhin parallel und
könnten gemeinsam das Kontingent sprengen. Für den aktuellen Gebrauch (einzelne Uploads während
einer Demo) ausreichend; bei echtem Mehrbenutzerbetrieb wäre eine projektweite Warteschlange
nötig.

---

## 2026-09-27 – Zwei Produktionsfehler bei YouTube-Ingestion untersucht (manuell)

**Fehler 1 – Production (Vercel): "Für dieses Video sind keine abrufbaren Untertitel verfügbar"**
für ein Video, das nachweislich Untertitel hat.

*Ursache (kein Code-Bug):* `youtube-transcript-plus` nutzt YouTubes inoffizielle Innertube-
Schnittstelle. YouTube erkennt und blockiert Anfragen von Cloud-/Datacenter-IP-Bereichen
(AWS, GCP, **Vercel**) systematisch und liefert dieselbe "keine Untertitel"-Antwort wie bei
tatsächlich fehlenden Untertiteln – nicht unterscheidbar auf Protokollebene. Mehrfach
unabhängig bestätigt (u. a. offizielle Fehlertypen wie `IpBlocked` in vergleichbaren Bibliotheken,
mehrere Entwickler-Berichte mit identischem Symptom: funktioniert lokal, scheitert auf Vercel).
Schon im ursprünglichen YouTube-Feature-Prompt als Risiko benannt ("kann brechen, wenn YouTube
... Zugriffe begrenzt") – genau das ist eingetreten.

*Entscheidung:* Als dokumentierte Produktionsgrenze festgehalten statt eines Feature-Fixes ohne
echten Lösungsraum. Ein zuverlässiger Fix (Residential-Proxy oder bezahlter Managed-Transcript-
Dienst) würde Kosten und neue Secrets bedeuten – bewusst zurückgestellt. YouTube-Ingestion
funktioniert weiterhin zuverlässig lokal/in der Entwicklungsumgebung.

**Fehler 2 – Dev: `POST /api/documents/ingest-youtube 504 in 66s`, "Zeitlimit von 60 Sekunden
überschritten" bei Gemini-Embeddings** (echter Code-Bug, behoben)

*Ursache:* Der `AbortController`-Timeout in `requestEmbeddings` (lib/rag/embeddings.ts) umschloss
die gesamte Retry-Schleife statt jeden einzelnen Versuch. Bei Rate-Limit-Antworten (429) addieren
sich Backoff-Wartezeiten (bis 30s, bis zu 3 Versuche) zur eigentlichen Netzwerkzeit – in Summe
leicht über 60 Sekunden, wodurch der äußere Timeout durch die eigene Retry-Logik ausgelöst wurde,
nicht durch eine tatsächlich langsame Gemini-Antwort.

*Fix:* `AbortController` und Timeout werden jetzt pro Versuch neu erstellt statt einmal für die
gesamte Schleife. Jeder einzelne Request bekommt sein volles 60-Sekunden-Fenster, Backoff-Pausen
zwischen Versuchen zählen nicht mehr gegen dieses Fenster.

*Nebenbei erledigt:* `app/api/documents/ingest-youtube/route.ts` fehlte `export const
maxDuration = 60;` (die PDF/Text-Route hatte es bereits) – ergänzt für Konsistenz.

---

## 2026-09-27 – Prepaid-Billing aktiviert, 402-Fehlerbehandlung ergänzt (manuell)

**Ausgangslage:** Trotz Content-Hash-Dedup und Batch-Throttling weiterhin Kontingent-Engpässe.
Recherche ergab: Ein Google-AI-Pro-Abo (auch die Studenten-Variante) erhöht laut offizieller
Google-Doku **nicht** das Kontingent der Gemini Developer API (`GEMINI_API_KEY`) – es gilt nur
innerhalb der AI-Studio-Weboberfläche, der Gemini-App, Gemini CLI/Code Assist etc. Diese Abos
sind ein komplett getrenntes System vom API-Kontingent.

**Entscheidung:** Prepaid-Billing im Google-AI-Studio-Projekt aktiviert. Ergebnis: RPM 100 →
3.000, TPM 30K → 1.000.000, RPD unlimitiert (jeweils für `gemini-embedding-2`). Aktueller
Verbrauch liegt damit bei ca. 3–4 % Auslastung der neuen Limits. Embedding-Aufrufe sind pro
Anfrage sehr günstig; das Aktivieren von Billing selbst schaltet höhere Rate-Limits frei,
unabhängig vom tatsächlichen Verbrauch.

**Neuer Fehlerfall dadurch aufgedeckt:** `402 Payment Required` – seit einem kürzlichen
Google-API-Update der dedizierte Fehlercode für "Prepay-Guthaben aufgebraucht" (ersetzt in diesem
Fall den bisherigen `429`). Bekannter, in Googles eigenem Entwickler-Forum mehrfach dokumentierter
Sync-Bug: AI Studio kann ein Guthaben > 0 anzeigen, während die API dennoch 402 meldet – kein
projektspezifischer Bug.

**Code-Änderung:** `lib/rag/embeddings.ts` behandelt `402` jetzt explizit mit einer
verständlichen Fehlermeldung (Verweis auf den Billing-Bereich in AI Studio) statt der generischen
"fehlgeschlagen (402)"-Meldung, analog zur bereits vorhandenen `429`-Sonderbehandlung.

---

## 2026-09-28 – Gespeicherte Quellen laden und Ingestion-Fehler sichtbar machen (manuell)

**Ausgangslage:** Die Quellenliste lebte nur im Frontend-State. Nach einem Neuladen waren bereits in
Supabase gespeicherte Dokument-Chunks zwar vorhanden, aber die Chat-Eingabe blieb deaktiviert, weil
keine aktive Quelle im Frontend ausgewählt war. Unerwartete PDF-/Text-Ingestion-Fehler wurden zudem
auf eine allgemeine Meldung reduziert.

**Änderungen:** `GET /api/documents` lädt eindeutige Quellen-Metadaten seitenweise aus den
gespeicherten Chunks. Die Startseite stellt sie beim Laden wieder her; es werden weder Inhalte noch
Embeddings an den Browser übertragen. Unerwartete Ingestion-Fehler werden serverseitig vollständig
geloggt und ihre Details nur in der Entwicklungsumgebung zusätzlich zurückgegeben. Typisierte
Gemini-Fehler wie fehlendes oder aufgebrauchtes Guthaben behalten ihre gezielte Meldung.

Da die Anwendung öffentlich deployed ist und keine individuellen Nutzerkonten hat, ist die
Quellenliste sowie Chat und Ingestion hinter einem gemeinsamen `SOURCE_ACCESS_PASSWORD` geschützt.
Die Anmeldung setzt ein HttpOnly-, SameSite-Cookie mit zeitlich begrenzter HMAC-Signatur; die
geschützten Route Handler prüfen dieses Cookie serverseitig. Das Passwort muss mindestens 32
Zeichen lang sein und bleibt ausschließlich in Server-Environment-Variablen.

**Grenze:** Eine neue Chat-Anfrage braucht weiterhin ein Gemini-Embedding für die Frage sowie einen
Gemini-Aufruf für die Antwort. Vorhandene gespeicherte Chunks ersetzen diese API-Aufrufe nicht.

---

## 2026-09-28 – Persönlichen Gemini-Key pro Besucher verwenden (manuell)

**Anforderung:** Jeder Demo-Besucher verwendet seinen eigenen Gemini-API-Key; der Betreiber stellt
keinen gemeinsamen Gemini-Key über Vercel bereit.

**Änderungen:** Die UI hält den eingegebenen Key ausschließlich im flüchtigen React-State und
übermittelt ihn bei Datei-/YouTube-Ingestion sowie Chat-Anfragen über den
`x-gemini-api-key`-Header. Route Handler validieren den Header und reichen den Key an Embedding-
und Generierungsoperationen weiter. Der Key wird nicht in Browser-Storage oder Supabase gespeichert
und nicht durch Anwendungscode geloggt. Die öffentliche Dokumentation erklärt, dass Requests über
den App-Server zu Google weitergeleitet werden und Kosten/Kontingente dem Inhaber des Keys
zugeordnet sind. Ein Neuladen löscht den Key aus dem UI-State; Besucher müssen ihn erneut eingeben.

**Konfiguration:** `GEMINI_API_KEY` wird nicht länger in Vercel benötigt. `GEMINI_MODEL`,
Supabase-Variablen und das gemeinsame `SOURCE_ACCESS_PASSWORD` bleiben serverseitige
Konfigurationen. Das gemeinsame Demo-Passwort schützt weiterhin den geteilten Quellenbestand;
es stellt keine individuelle Nutzertrennung bereit.

---

## 2026-09-28 – Gemini-503 bei hoher Modellauslastung behandeln (manuell)

**Ausgangslage:** Gemini `generateContent` lieferte zeitweise `503 UNAVAILABLE` mit der Meldung,
dass das Modell stark ausgelastet sei. Das ist ein temporärer Providerfehler und belegt keinen
ungültigen API-Key.

**Änderungen:** Die LLM-Integration wiederholt eine `503`-Antwort einmal nach kurzer Pause; jeder
Versuch hat ein eigenes 20-Sekunden-Timeout. Bleibt der Provider ausgelastet, liefert die API
Status `503` und eine verständliche, nicht an Provider-Interna gekoppelte Meldung an die UI. Andere
Fehlerklassen wie ungültiger Key (`401`/`403`) und Kontingent/Billing (`402`/`429`) bleiben
unterschieden. Automatisierte Tests decken erfolgreichen Retry und ausgeschöpfte Wiederholung ab.

---

## 2026-09-28 – Gemini-Generierungsmodell auf Flash-Lite 3.5 setzen (manuell)

**Änderung:** Das Standardmodell für `generateContent` ist `gemini-3.5-flash-lite`.
Der Default in `lib/llm/client.ts`, das Beispiel in `.env.example` und die README verwenden
dieselbe Modell-ID. Ein gesetztes `GEMINI_MODEL` überschreibt den Code-Default weiterhin.

---

## 2026-09-28 – GEMINI_MODEL-Konfiguration robust normalisieren (manuell)

**Ausgangslage:** Der lokale `.env`-Eintrag enthielt versehentlich den Variablennamen auch im
Variablenwert (`GEMINI_MODEL=GEMINI_MODEL=...`). Dadurch wurde der fehlerhafte Wert als Teil des
Modellpfads an Gemini gesendet und die API antwortete mit HTTP 400.

**Änderung:** Der lokale Eintrag wurde auf `GEMINI_MODEL=gemini-2.5-flash` korrigiert.
`lib/llm/client.ts` entfernt zusätzlich versehentlich mitkopierte `GEMINI_MODEL=`- und
`models/`-Präfixe vor dem Request. Ein Test deckt diese Normalisierung ab; die README weist
darauf hin, dass als Variablenwert ausschließlich die Modell-ID eingetragen wird.

---

## 2026-09-28 – Gemini-404-Diagnose präzisieren (manuell)

**Ausgangslage:** Gemini meldete für die Generierung HTTP 404; die bisherige Anwendung ersetzte
die Providerdiagnose durch einen generischen Hinweis zum Modell.

**Änderung:** Bei einem endgültigen `404` wird die Modell-ID genannt und die begrenzte
`error.message`-Diagnose der Gemini API an die UI weitergegeben. Der API-Key wird dabei nicht
protokolliert oder in die Meldung aufgenommen. Ein Test prüft die Diagnose und stellt sicher, dass
der API-Key nicht in der Fehlermeldung erscheint.

---

## 2026-09-28 – Fallback bei anhaltender Gemini-503-Überlastung (manuell)

**Ausgangslage:** Die Chat-Anfragen erhielten wiederholt `503 UNAVAILABLE`, obwohl der primäre
Modellaufruf bereits einmal wiederholt wurde.

**Änderung:** `lib/llm/client.ts` versucht nach einem weiteren `503` automatisch
`gemini-2.5-flash`. Der konfigurierte `GEMINI_MODEL`-Wert bleibt das bevorzugte Modell.
Bei einem `404` für das bevorzugte Modell wird ebenfalls auf `gemini-2.5-flash` ausgewichen.
Die Ausweichanfrage nutzt denselben vom Besucher bereitgestellten API-Key; andere Fehler wie
ungültige Schlüssel oder aufgebrauchte Kontingente lösen keinen Modellwechsel aus. Tests prüfen
Fallback-Erfolg nach `503` beziehungsweise `404` und den Fehlerfall, wenn beide Modelle ausgelastet
sind. Ein Modellwert mit optionalem `models/`-Präfix wird vor dem API-Aufruf normalisiert.

---

## 2026-09-28 – Gemini 3.8 über die Interactions API verwenden (manuell)

**Ausgangslage:** Google meldete, dass `gemini-2.5-flash` für neue Nutzer nicht verfügbar sei und
empfahl `gemini-3.8-flash`. Die aktuelle Gemini-Dokumentation empfiehlt für neue Modelle die
Interactions API.

**Änderungen:** `lib/llm/client.ts` verwendet jetzt `POST /v1beta/interactions` mit
`gemini-3.8-flash` als Default und `gemini-3.7-flash` als Fallback. Die Interactions werden mit
`store: false` nicht serverseitig gespeichert. Die Antwort wird aus den `model_output`-Schritten
extrahiert. `.env.example`, README und lokale `.env` wurden aktualisiert; Tests decken das neue
Request-/Response-Format, Retries, Fallback und Fehlerdiagnosen ab.
