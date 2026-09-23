# Clean Code – Regeln für notebooklm-klon

> Projekt: `notebooklm-klon` (Next.js App Router, TypeScript, Tailwind CSS, RAG/LLM-Integration)
> Diese Datei ist die fachliche Grundlage für Code-Qualität. Sie kann von `CLAUDE.md` aus referenziert
> oder als `.claude/rules/clean-code.md` eingebunden werden (siehe Abschnitt 9).

---

## 1. Grundwerte (Clean Development)

Jede Entscheidung wird an diesen vier Werten gemessen:

| Wert | Bedeutung |
|---|---|
| **Korrektheit** | Verhalten ändert sich nicht unbemerkt. Kein "stiller" Bug durch Refactoring. |
| **Wandelbarkeit** | Code lässt sich leicht erweitern (neue Dateiformate, neues LLM-Backend, neue UI-Features). |
| **Produktionseffizienz** | Einfache, pragmatische Lösung – kein Overengineering unter dem 7-Tage-Zeitdruck. |
| **Kontinuierliche Verbesserung** | Kleine Schritte statt Big-Bang-Refactoring. Committen, wenn ein Schritt sauber abgeschlossen ist. |

---

## 2. Kernprinzipien

### SRP – Single Responsibility Principle
Jede Funktion/Komponente/Route hat **eine** klar benennbare Aufgabe.
Faustregel: Wenn du die Aufgabe einer Funktion nicht in einem Satz ohne "und" beschreiben kannst → aufteilen.

### DRY – Don't Repeat Yourself
Duplikate entfernen, aber nicht um jeden Preis. Zwei ähnliche, aber fachlich unabhängige Stellen dürfen ruhig ähnlich aussehen, wenn eine gemeinsame Abstraktion den Code unlesbarer machen würde.

### IOSP – Integration Operation Segregation Principle (sehr wichtig)
Konsequent zwischen zwei Arten von Funktionen trennen:

- **Operationen**: enthalten fachliche Logik/Berechnungen, rufen **keine** eigenen Business-Funktionen desselben Moduls auf. Leicht per Unit-Test prüfbar. Beispiel: `chunkText()`, `buildPromptFromContext()`, `parsePdfMetadata()`.
- **Integrationen**: orchestrieren andere Funktionen (API-Routes, Service-Layer, `page.tsx`-Handler). Werden eher mit Integrations-/E2E-Tests geprüft. Beispiel: `POST /api/chat/route.ts` ruft `retrieveContext()`, `buildPromptFromContext()`, `callLLM()` auf.

**Regel:** Eine Funktion mischt niemals fachliche Berechnung *und* Orchestrierung. Wenn eine Integrationsfunktion eigene `if`-Logik mit Geschäftsregeln enthält, extrahieren.

### KISS – Keep It Simple, Stupid
Die einfachste Lösung, die die Anforderung erfüllt. Keine generischen Frameworks für ein 7-Tage-Projekt bauen.

### YAGNI – You Ain't Gonna Need It
Kein Plugin-System, keine Multi-LLM-Abstraktion "für später", solange nur ein Modell (OpenAI/Ollama) gebraucht wird. Erst abstrahieren, wenn ein zweiter konkreter Bedarf da ist.

### Dependency Injection / Dependency Inversion
In TypeScript/Next.js heißt das meist: Funktionen bekommen ihre Abhängigkeiten (LLM-Client, Dateisystem-Zugriff, Embedding-Funktion) als Parameter statt sie intern zu importieren und fest zu verdrahten – **aber nur dort, wo es echten Nutzen bringt** (Testbarkeit, Austauschbarkeit).

---

## 3. Wann brauche ich eine Abstraktion / ein Interface?

Vor jeder neuen Abstraktion (Interface, Adapter, Factory) diese 3 Fragen stellen:

1. Muss diese Implementierung austauschbar sein (z. B. OpenAI ↔ Ollama)?
2. Will ich sie im Test mocken?
3. Ist das Infrastruktur (I/O, externe API) oder reine Domänenlogik?

→ **2× "Ja"** → Abstraktion sinnvoll.
→ **Alles "Nein"** → wahrscheinlich unnötig, YAGNI gewinnt.

Für Dependency Injection zusätzlich prüfen:

- Wird die Implementierung im Test ausgetauscht?
- Ist der Lebenszyklus relevant (z. B. ein In-Memory-Vector-Store als Singleton vs. zustandslose Utility-Funktion)?
- Verlangt eine Abhängigkeit oder das Framework (Next.js Route Handler) eine bestimmte Struktur?

---

## 4. TypeScript / Next.js-spezifische Regeln

- **API-Routes (`app/api/**/route.ts`) sind Integrationen**: kurz halten, validieren, orchestrieren, Antwort formen. Keine Business-Logik direkt in `POST()`/`GET()`.
- **Business-Logik in `lib/` oder `services/`** als reine, testbare Operationen (keine Next.js-Imports dort).
- **Komponenten (`app/**/*.tsx`)** folgen ebenfalls SRP: Eine Komponente rendert eine klar abgegrenzte UI-Einheit. Datenholen (fetch, State-Management) und reines Rendering trennen, sobald eine Komponente > ~100 Zeilen wird.
- **Naming**: sprechende Namen, konsistent Englisch für Code (Funktionen, Variablen), Deutsch nur in Kommentaren/Doku erlaubt, wenn im Team so vereinbart.
- **Keine Magic Strings/Numbers**: Konstanten für wiederkehrende Werte (z. B. `MAX_CHUNK_SIZE`, `DEFAULT_MODEL`).
- **Fehlerbehandlung explizit**: API-Fehler (LLM-Timeout, PDF-Parsing-Fehler) sauber abfangen und mit klaren Statuscodes/Messages zurückgeben, keine stillen `catch {}`.
- **Typen statt `any`**: Für RAG-Kontext, Chat-Nachrichten, Dokumentenquellen klare `type`/`interface` definieren (z. B. `type SourceChunk = { text: string; page: number; documentId: string }`).

---

## 5. Refactoring-Workflow (bei jedem Auftrag)

1. **Verstehen** – Was tut der Code fachlich? Bei Unklarheit: Annahme treffen und explizit kennzeichnen.
2. **Smells & Probleme erkennen** – stichpunktartig: zu lange Funktion, SRP-/IOSP-Verstoß, Duplikate, komplizierte Bedingungen, unklare Namen, fehlende Tests.
3. **Flow-Design skizzieren** – Welche Dialoge/Interaktionen sind relevant (z. B. "Nutzer lädt PDF hoch → Text wird extrahiert → Chunking → Embedding → Speichern")? Integrationsfunktionen vs. Operationsfunktionen identifizieren.
4. **Refactoring-Vorschlag** – kleine, konkrete Schritte (Funktion aufteilen, Bedingung vereinfachen, Duplikat extrahieren).
5. **Code liefern** – vollständiger, überarbeiteter Ausschnitt, Verhalten unverändert außer explizit gewünscht.
6. **Tests** – bei fehlenden Tests mind. 1–3 repräsentative Unit-Tests (für Operationen) bzw. Integrationstests (für API-Routes) vorschlagen.
7. **Lernabschnitt** – 2–3 wichtigste Verbesserungen + angewendete Prinzipien + Leitfrage fürs nächste Mal.

---

## 6. Beispiel: IOSP-Refactoring (Muster, übertragbar auf TypeScript)

**Vorher** (eine Funktion macht alles):

```ts
// route.ts – macht Parsing, Chunking, Prompt-Bau UND LLM-Call in einer Funktion
export async function POST(req: Request) {
  const { question, fileText } = await req.json();
  const chunks = fileText.match(/.{1,500}/g) ?? [];
  const relevant = chunks.filter(c => c.toLowerCase().includes(question.toLowerCase()));
  const prompt = `Kontext: ${relevant.join("\n")}\n\nFrage: ${question}`;
  const res = await fetch("https://api.openai.com/...", { /* ... */ });
  return Response.json(await res.json());
}
```

**Nachher** (Integration orchestriert, Operationen sind isoliert testbar):

```ts
// lib/rag/chunk.ts – Operation
export function chunkText(text: string, size = 500): string[] {
  return text.match(new RegExp(`.{1,${size}}`, "g")) ?? [];
}

// lib/rag/retrieve.ts – Operation
export function retrieveRelevantChunks(chunks: string[], question: string): string[] {
  const q = question.toLowerCase();
  return chunks.filter(chunk => chunk.toLowerCase().includes(q));
}

// lib/rag/prompt.ts – Operation
export function buildPrompt(context: string[], question: string): string {
  return `Kontext:\n${context.join("\n")}\n\nFrage: ${question}`;
}

// app/api/chat/route.ts – Integration (orchestriert nur)
export async function POST(req: Request) {
  const { question, fileText } = await req.json();
  const chunks = chunkText(fileText);
  const relevant = retrieveRelevantChunks(chunks, question);
  const prompt = buildPrompt(relevant, question);
  const answer = await callLlm(prompt); // eigene Operation/Integration zum LLM-Client
  return Response.json({ answer });
}
```

**Angewendete Prinzipien:** IOSP (Operationen ↔ Integration getrennt), SRP (eine Aufgabe pro Funktion), Testbarkeit (jede Operation isoliert unit-testbar ohne Next.js-Request-Objekt).

---

## 7. Test-Strategie

- **Operationen** (`lib/**`): Unit-Tests, keine Mocks nötig, da keine Framework-Abhängigkeiten.
- **Integrationen** (`app/api/**/route.ts`): Integrations-/E2E-Tests (z. B. mit echtem oder gemocktem `fetch`).
- **UI-Komponenten**: Snapshot-/Component-Tests für kritische Interaktionen (Upload, Chat-Verlauf).
- Faustregel: Wenn eine Funktion nicht ohne Next.js-Kontext (Request/Response) testbar ist, gehört fachliche Logik daraus in eine Operation extrahiert.

---

## 8. Checkliste vor jedem Commit

- [ ] Macht jede neue/geänderte Funktion nur **eine** Sache?
- [ ] Sind Integration (Orchestrierung) und Operation (fachliche Logik) getrennt?
- [ ] Gibt es Magic Strings/Numbers, die eine Konstante bräuchten?
- [ ] Ist der Code ohne Kommentar verständlich (Kommentare nur wo wirklich nötig)?
- [ ] Wurden für neue Operationen Unit-Tests ergänzt?
- [ ] Wurde YAGNI beachtet – keine "für später"-Abstraktion eingebaut?
- [ ] Ändert sich bestehendes Verhalten unbeabsichtigt (Korrektheit)?

---

## 9. Einbindung in Claude Code

Diese Datei kann so eingebunden werden:

- Direkt als `.claude/rules/clean-code.md` ablegen – wird dann als modulare Regel geladen.
- Oder aus `CLAUDE.md` / `AGENTS.md` heraus referenzieren, z. B.:

```markdown
## Code-Qualität
Siehe `clean_code.md` für verbindliche Clean-Code-/Refactoring-Regeln dieses Projekts.
```

`CLAUDE.md` selbst bleibt kurz (< 200 Zeilen) und beschreibt nur Projektüberblick, Tech-Stack (Next.js/TypeScript/Tailwind) und Build/Test-Kommandos – die inhaltlichen Regeln bleiben in dieser Datei.
