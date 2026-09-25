import assert from "node:assert/strict";
import test from "node:test";
import {
  fetchYouTubeCaptions,
  parseYouTubeCaptionSegments,
  YouTubeCaptionsError,
} from "./captions";
import {
  YoutubeTranscriptTooManyRequestError,
  YoutubeTranscriptVideoUnavailableError,
} from "youtube-transcript-plus";

test("validates caption fields and converts timestamps to milliseconds", () => {
  assert.deepEqual(
    parseYouTubeCaptionSegments([
      { text: "  Hallo Welt ", offset: 1.25, duration: 0.75, lang: "de" },
      { text: "", offset: 3, duration: 1, lang: "de" },
    ]),
    [{ text: "Hallo Welt", speaker: null, startMs: 1_250, endMs: 2_000 }],
  );
});

test("rejects absent or malformed captions", () => {
  assert.throws(() => parseYouTubeCaptionSegments({}), /ungültiges Untertitelformat/);
  assert.throws(() => parseYouTubeCaptionSegments([]), /keine abrufbaren Untertitel/);
  assert.throws(
    () => parseYouTubeCaptionSegments([{ text: "Text", offset: "0", duration: 1 }]),
    /ungültiges Untertitelformat/,
  );
  assert.throws(
    () => parseYouTubeCaptionSegments([{ text: "Text", offset: -1, duration: 1 }]),
    /ungültiges Untertitelformat/,
  );
});

test("maps YouTube rate limits to an explicit retryable error", async () => {
  await assert.rejects(
    () => fetchYouTubeCaptions("video-id", {
      fetchTranscript: async () => {
        throw new YoutubeTranscriptTooManyRequestError();
      },
    }),
    (error: unknown) =>
      error instanceof YouTubeCaptionsError &&
      error.statusCode === 503 &&
      /begrenzt/.test(error.message),
  );
});

test("maps unavailable videos and unexpected provider failures explicitly", async () => {
  await assert.rejects(
    () => fetchYouTubeCaptions("video-id", {
      fetchTranscript: async () => {
        throw new YoutubeTranscriptVideoUnavailableError("video-id");
      },
    }),
    (error: unknown) =>
      error instanceof YouTubeCaptionsError &&
      error.statusCode === 422 &&
      /keine abrufbaren Untertitel/.test(error.message),
  );
  await assert.rejects(
    () => fetchYouTubeCaptions("video-id", {
      fetchTranscript: async () => {
        throw new Error("third-party details");
      },
    }),
    (error: unknown) =>
      error instanceof YouTubeCaptionsError &&
      error.statusCode === 502 &&
      error.message === "YouTube-Untertitel konnten nicht abgerufen werden.",
  );
});

test("aborts caption retrieval at the configured timeout", async () => {
  await assert.rejects(
    () => fetchYouTubeCaptions("video-id", {
      timeoutMs: 1,
      fetchTranscript: (_videoId, config) =>
        new Promise((_resolve, reject) => {
          config.signal?.addEventListener(
            "abort",
            () => reject(new DOMException("Aborted", "AbortError")),
            { once: true },
          );
        }),
    }),
    (error: unknown) =>
      error instanceof YouTubeCaptionsError &&
      error.statusCode === 504 &&
      /Zeitlimit/.test(error.message),
  );
});
