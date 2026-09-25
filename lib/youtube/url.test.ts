import test from "node:test";
import assert from "node:assert/strict";

import { validateYouTubeUrl } from "./url";

test("accepts a standard YouTube watch URL", () => {
  const result = validateYouTubeUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ");

  assert.deepEqual(result, {
    valid: true,
    videoId: "dQw4w9WgXcQ",
    canonicalUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
  });
});

test("accepts a short YouTube URL", () => {
  const result = validateYouTubeUrl("https://youtu.be/dQw4w9WgXcQ");

  assert.deepEqual(result, {
    valid: true,
    videoId: "dQw4w9WgXcQ",
    canonicalUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
  });
});

test("rejects non-YouTube hosts", () => {
  const result = validateYouTubeUrl("https://example.com/watch?v=dQw4w9WgXcQ");

  assert.equal(result.valid, false);
  assert.equal(result.error, "Bitte sende eine gültige öffentliche YouTube-URL.");
});

test("rejects malformed watch URLs without a video id", () => {
  const result = validateYouTubeUrl("https://www.youtube.com/watch");

  assert.equal(result.valid, false);
  assert.equal(result.error, "Bitte sende eine gültige öffentliche YouTube-URL.");
});
