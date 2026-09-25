import assert from "node:assert/strict";
import test from "node:test";
import { transcriptSegmentsToChunks } from "./mapping";

test("maps transcript metadata to source chunks", () => {
  assert.deepEqual(
    transcriptSegmentsToChunks(
      [{ text: "Hallo", speaker: null, startMs: 10, endMs: 20 }],
      "youtube-id",
      "Video",
      "https://www.youtube.com/watch?v=id",
      "id",
    ),
    [{
      id: "youtube-id-0",
      documentId: "youtube-id",
      documentName: "Video",
      text: "Hallo",
      index: 0,
      sourceUrl: "https://www.youtube.com/watch?v=id",
      videoId: "id",
      speaker: null,
      startMs: 10,
      endMs: 20,
    }],
  );
});
