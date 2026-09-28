import assert from "node:assert/strict";
import test from "node:test";
import { callLlm, GeminiLlmError } from "./client";

test("retries a temporary Gemini 503 once before returning the answer", async () => {
  const originalFetch = globalThis.fetch;
  let attempts = 0;
  globalThis.fetch = async () => {
    attempts += 1;
    if (attempts === 1) {
      return Response.json(
        { error: { message: "temporary overload" } },
        { status: 503 },
      );
    }
    return Response.json({
      candidates: [{ content: { parts: [{ text: "Antwort aus dem Dokument." }] } }],
    });
  };

  try {
    const answer = await callLlm("Frage", "test-key");
    assert.equal(answer, "Antwort aus dem Dokument.");
    assert.equal(attempts, 2);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("returns a clear 503 message after the retry is exhausted", async () => {
  const originalFetch = globalThis.fetch;
  let attempts = 0;
  globalThis.fetch = async () => {
    attempts += 1;
    return Response.json(
      { error: { message: "provider internals" } },
      { status: 503 },
    );
  };

  try {
    await assert.rejects(
      () => callLlm("Frage", "test-key"),
      (error: unknown) =>
        error instanceof GeminiLlmError &&
        error.statusCode === 503 &&
        /stark ausgelastet/.test(error.message) &&
        !error.message.includes("provider internals"),
    );
    assert.equal(attempts, 2);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
