import assert from "node:assert/strict";
import test from "node:test";
import { callLlm, GeminiLlmError } from "./client";

test("uses Gemini 3.5 Flash-Lite when no model override is configured", async () => {
  const originalFetch = globalThis.fetch;
  const originalModel = process.env.GEMINI_MODEL;
  let requestedUrl = "";
  delete process.env.GEMINI_MODEL;
  globalThis.fetch = async (input) => {
    requestedUrl = String(input);
    return Response.json({
      candidates: [{ content: { parts: [{ text: "Antwort." }] } }],
    });
  };

  try {
    await callLlm("Frage", "test-key");
    assert.match(requestedUrl, /\/gemini-3\.5-flash-lite:generateContent$/);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalModel === undefined) {
      delete process.env.GEMINI_MODEL;
    } else {
      process.env.GEMINI_MODEL = originalModel;
    }
  }
});

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

test("falls back to Gemini 2.5 Flash after the primary model stays unavailable", async () => {
  const originalFetch = globalThis.fetch;
  const originalModel = process.env.GEMINI_MODEL;
  const requestedModels: string[] = [];
  delete process.env.GEMINI_MODEL;
  globalThis.fetch = async (input) => {
    const url = String(input);
    requestedModels.push(url);
    if (url.includes("/gemini-2.5-flash:")) {
      return Response.json({
        candidates: [{ content: { parts: [{ text: "Antwort aus dem Fallback." }] } }],
      });
    }
    return Response.json({ error: { message: "temporary overload" } }, { status: 503 });
  };

  try {
    const answer = await callLlm("Frage", "test-key");
    assert.equal(answer, "Antwort aus dem Fallback.");
    assert.equal(requestedModels.length, 3);
    assert.ok(requestedModels[0].includes("/gemini-3.5-flash-lite:"));
    assert.ok(requestedModels[1].includes("/gemini-3.5-flash-lite:"));
    assert.ok(requestedModels[2].includes("/gemini-2.5-flash:"));
  } finally {
    globalThis.fetch = originalFetch;
    if (originalModel === undefined) {
      delete process.env.GEMINI_MODEL;
    } else {
      process.env.GEMINI_MODEL = originalModel;
    }
  }
});

test("falls back to Gemini 2.5 Flash when the primary model returns 404", async () => {
  const originalFetch = globalThis.fetch;
  const originalModel = process.env.GEMINI_MODEL;
  const requestedModels: string[] = [];
  delete process.env.GEMINI_MODEL;
  globalThis.fetch = async (input) => {
    const url = String(input);
    requestedModels.push(url);
    if (url.includes("/gemini-2.5-flash:")) {
      return Response.json({
        candidates: [{ content: { parts: [{ text: "Antwort aus dem Fallback." }] } }],
      });
    }
    return Response.json({ error: { message: "model not found" } }, { status: 404 });
  };

  try {
    const answer = await callLlm("Frage", "test-key");
    assert.equal(answer, "Antwort aus dem Fallback.");
    assert.equal(requestedModels.length, 2);
    assert.ok(requestedModels[0].includes("/gemini-3.5-flash-lite:"));
    assert.ok(requestedModels[1].includes("/gemini-2.5-flash:"));
  } finally {
    globalThis.fetch = originalFetch;
    if (originalModel === undefined) {
      delete process.env.GEMINI_MODEL;
    } else {
      process.env.GEMINI_MODEL = originalModel;
    }
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
      /Ausweichmodell/.test(error.message) &&
      !error.message.includes("provider internals"),
    );
    assert.equal(attempts, 4);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
