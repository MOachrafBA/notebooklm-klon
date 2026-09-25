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

## Nächste geplante Prompts

- Unit-Tests für `lib/rag/chunk.ts`, `embeddings.ts`, `vectorStore.ts` und `prompt.ts`
- Identitätsgebundene Supabase-RLS-Policies für Multi-User-Zugriff ergänzen
