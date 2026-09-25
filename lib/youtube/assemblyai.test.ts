import assert from "node:assert/strict";
import test from "node:test";

import { parseTranscriptSegments, transcribeAudio } from "./assemblyai";

test("parses AssemblyAI utterances into transcript segments", () => {
  const segments = parseTranscriptSegments({
    utterances: [{ text: "  Hello world. ", speaker: "A", start: 100, end: 900 }],
  });

  assert.deepEqual(segments, [
    { text: "Hello world.", speaker: "A", startMs: 100, endMs: 900 },
  ]);
});

test("rejects an empty AssemblyAI transcript", () => {
  assert.throws(
    () => parseTranscriptSegments({ utterances: [] }),
    /leeres Transkript/,
  );
});

test("rejects audio larger than the configured upload limit", async () => {
  await assert.rejects(
    () => transcribeAudio(new Uint8Array(25_000_001)),
    /maximal 25 MB/,
  );
});
