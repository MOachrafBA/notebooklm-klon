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

## Nächste geplante Prompts

- Unit-Tests für `lib/rag/chunk.ts`, `embeddings.ts`, `vectorStore.ts` und `prompt.ts`
- Die bestätigte Embedding-Dimension `3072` im Supabase-Schema verwenden und bei Änderungen am
  Embedding-Modell erneut verifizieren
- Identitätsgebundene Supabase-RLS-Policies für Multi-User-Zugriff ergänzen
