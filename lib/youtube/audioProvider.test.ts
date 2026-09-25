import assert from "node:assert/strict";
import test from "node:test";
import { fetchYouTubeAudio } from "./audioProvider";

const originalFetch = globalThis.fetch;
const originalEnv = {
  endpoint: process.env.YOUTUBE_AUDIO_PROVIDER_URL,
  key: process.env.YOUTUBE_AUDIO_PROVIDER_API_KEY,
};

test.afterEach(() => {
  globalThis.fetch = originalFetch;
  process.env.YOUTUBE_AUDIO_PROVIDER_URL = originalEnv.endpoint;
  process.env.YOUTUBE_AUDIO_PROVIDER_API_KEY = originalEnv.key;
});

function configure() {
  process.env.YOUTUBE_AUDIO_PROVIDER_URL = "https://audio.example.test";
  process.env.YOUTUBE_AUDIO_PROVIDER_API_KEY = "test-key";
}

test("rejects a non-audio provider response", async () => {
  configure();
  globalThis.fetch = async () => new Response("not audio", {
    status: 200,
    headers: { "content-type": "text/plain" },
  });
  await assert.rejects(
    () => fetchYouTubeAudio("https://www.youtube.com/watch?v=dQw4w9WgXcQ", "dQw4w9WgXcQ"),
    /keinen unterstützten Audiostream/,
  );
});

test("rejects a provider response exceeding the size limit", async () => {
  configure();
  globalThis.fetch = async () => new Response(new Uint8Array(25_000_001), {
    status: 200,
    headers: { "content-type": "audio/mpeg", "content-length": "25000001" },
  });
  await assert.rejects(() => fetchYouTubeAudio("https://www.youtube.com/watch?v=id", "id"), /25 MB/);
});

test("maps provider errors and timeouts explicitly", async () => {
  configure();
  globalThis.fetch = async () => new Response(null, { status: 429 });
  await assert.rejects(() => fetchYouTubeAudio("https://www.youtube.com/watch?v=id", "id"), /ausgelastet/);
});

test("maps an aborted provider request to a timeout", async () => {
  configure();
  globalThis.fetch = async () => {
    throw new DOMException("aborted", "AbortError");
  };
  await assert.rejects(() => fetchYouTubeAudio("https://www.youtube.com/watch?v=id", "id"), /Zeitlimit/);
});
