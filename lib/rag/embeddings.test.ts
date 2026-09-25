import assert from "node:assert/strict";
import test from "node:test";
import { embedDocumentChunks, GeminiEmbeddingError } from "./embeddings";

test("embeds document chunks in ordered batches of at most 100", async () => {
  const originalApiKey = process.env.GEMINI_API_KEY;
  const originalFetch = globalThis.fetch;
  process.env.GEMINI_API_KEY = "test-key";

  const calls: Array<{ url: string; body: { requests?: unknown[] } }> = [];
  globalThis.fetch = async (input, init) => {
    const body = JSON.parse(String(init?.body)) as { requests?: unknown[] };
    calls.push({ url: String(input), body });
    const count = body.requests?.length ?? 1;
    return Response.json({
      embeddings: Array.from({ length: count }, (_, index) => ({
        values: [calls.length, index],
      })),
      embedding: { values: [calls.length, 0] },
    });
  };

  try {
    const embeddings = await embedDocumentChunks(
      Array.from({ length: 101 }, (_, index) => ({
        documentName: "Document",
        text: `chunk-${index}`,
      })),
    );

    assert.equal(calls.length, 2);
    assert.equal(calls[0].body.requests?.length, 100);
    assert.match(calls[0].url, /batchEmbedContents$/);
    assert.match(calls[1].url, /embedContent$/);
    assert.equal(embeddings.length, 101);
    assert.deepEqual(embeddings[0], [1, 0]);
    assert.deepEqual(embeddings[100], [2, 0]);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalApiKey === undefined) {
      delete process.env.GEMINI_API_KEY;
    } else {
      process.env.GEMINI_API_KEY = originalApiKey;
    }
  }
});

test("returns a clear quota error after Gemini rejects embedding requests", async () => {
  const originalApiKey = process.env.GEMINI_API_KEY;
  const originalFetch = globalThis.fetch;
  process.env.GEMINI_API_KEY = "test-key";
  globalThis.fetch = async () =>
    Response.json({
      error: {
        message: "private provider details",
        details: [{
          "@type": "type.googleapis.com/google.rpc.RetryInfo",
          retryDelay: "0s",
        }],
      },
    }, { status: 429 });

  try {
    await assert.rejects(
      () => embedDocumentChunks([{ documentName: "Document", text: "Text" }]),
      (error: unknown) =>
        error instanceof GeminiEmbeddingError &&
        error.statusCode === 429 &&
        /Kontingent/.test(error.message) &&
        !error.message.includes("private provider details"),
    );
  } finally {
    globalThis.fetch = originalFetch;
    if (originalApiKey === undefined) {
      delete process.env.GEMINI_API_KEY;
    } else {
      process.env.GEMINI_API_KEY = originalApiKey;
    }
  }
});
