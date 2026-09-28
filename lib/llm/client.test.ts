import assert from "node:assert/strict";
import test from "node:test";
import { callLlm, GeminiLlmError } from "./client";

function interactionResponse(text: string): Response {
  return Response.json({
    steps: [{ type: "model_output", content: [{ type: "text", text }] }],
  });
}

test("uses Gemini 3.8 Flash through the stateless Interactions API by default", async () => {
  const originalFetch = globalThis.fetch;
  const originalModel = process.env.GEMINI_MODEL;
  let requestedUrl = "";
  let requestedBody: Record<string, unknown> = {};
  delete process.env.GEMINI_MODEL;
  globalThis.fetch = async (input, init) => {
    requestedUrl = String(input);
    requestedBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
    return interactionResponse("Antwort.");
  };

  try {
    const answer = await callLlm("Frage", "test-key");
    assert.equal(answer, "Antwort.");
    assert.equal(requestedUrl, "https://generativelanguage.googleapis.com/v1beta/interactions");
    assert.equal(requestedBody.model, "gemini-3.8-flash");
    assert.equal(requestedBody.input, "Frage");
    assert.equal(requestedBody.store, false);
    assert.match(String(requestedBody.system_instruction), /bereitgestellten Dokumentenkontext/);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalModel === undefined) {
      delete process.env.GEMINI_MODEL;
    } else {
      process.env.GEMINI_MODEL = originalModel;
    }
  }
});

test("normalizes an accidentally copied GEMINI_MODEL assignment", async () => {
  const originalFetch = globalThis.fetch;
  const originalModel = process.env.GEMINI_MODEL;
  let requestedBody: Record<string, unknown> = {};
  process.env.GEMINI_MODEL = "GEMINI_MODEL=GEMINI_MODEL=models/gemini-3.7-flash";
  globalThis.fetch = async (_input, init) => {
    requestedBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
    return interactionResponse("Antwort.");
  };

  try {
    await callLlm("Frage", "test-key");
    assert.equal(requestedBody.model, "gemini-3.7-flash");
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
      return Response.json({ error: { message: "temporary overload" } }, { status: 503 });
    }
    return interactionResponse("Antwort aus dem Dokument.");
  };

  try {
    const answer = await callLlm("Frage", "test-key");
    assert.equal(answer, "Antwort aus dem Dokument.");
    assert.equal(attempts, 2);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("falls back to Gemini 3.7 Flash after the primary model stays unavailable", async () => {
  const originalFetch = globalThis.fetch;
  const originalModel = process.env.GEMINI_MODEL;
  const requestedModels: string[] = [];
  delete process.env.GEMINI_MODEL;
  globalThis.fetch = async (_input, init) => {
    const body = JSON.parse(String(init?.body)) as { model: string };
    requestedModels.push(body.model);
    if (body.model === "gemini-3.7-flash") {
      return interactionResponse("Antwort aus dem Fallback.");
    }
    return Response.json({ error: { message: "temporary overload" } }, { status: 503 });
  };

  try {
    const answer = await callLlm("Frage", "test-key");
    assert.equal(answer, "Antwort aus dem Fallback.");
    assert.deepEqual(requestedModels, [
      "gemini-3.8-flash",
      "gemini-3.8-flash",
      "gemini-3.7-flash",
    ]);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalModel === undefined) {
      delete process.env.GEMINI_MODEL;
    } else {
      process.env.GEMINI_MODEL = originalModel;
    }
  }
});

test("falls back to Gemini 3.7 Flash when the primary model returns 404", async () => {
  const originalFetch = globalThis.fetch;
  const originalModel = process.env.GEMINI_MODEL;
  const requestedModels: string[] = [];
  delete process.env.GEMINI_MODEL;
  globalThis.fetch = async (_input, init) => {
    const body = JSON.parse(String(init?.body)) as { model: string };
    requestedModels.push(body.model);
    if (body.model === "gemini-3.7-flash") {
      return interactionResponse("Antwort aus dem Fallback.");
    }
    return Response.json({ error: { message: "model not available" } }, { status: 404 });
  };

  try {
    const answer = await callLlm("Frage", "test-key");
    assert.equal(answer, "Antwort aus dem Fallback.");
    assert.deepEqual(requestedModels, ["gemini-3.8-flash", "gemini-3.7-flash"]);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalModel === undefined) {
      delete process.env.GEMINI_MODEL;
    } else {
      process.env.GEMINI_MODEL = originalModel;
    }
  }
});

test("includes Google's diagnostic when the fallback model returns 404", async () => {
  const originalFetch = globalThis.fetch;
  const originalModel = process.env.GEMINI_MODEL;
  process.env.GEMINI_MODEL = "gemini-3.8-flash";
  globalThis.fetch = async (_input, init) => {
    const body = JSON.parse(String(init?.body)) as { model: string };
    return Response.json(
      { error: { message: `models/${body.model} is not available` } },
      { status: 404 },
    );
  };

  try {
    await assert.rejects(
      () => callLlm("Frage", "test-key"),
      (error: unknown) =>
        error instanceof GeminiLlmError &&
        error.statusCode === 404 &&
        error.message.includes("models/gemini-3.7-flash is not available") &&
        !error.message.includes("test-key"),
    );
  } finally {
    globalThis.fetch = originalFetch;
    if (originalModel === undefined) {
      delete process.env.GEMINI_MODEL;
    } else {
      process.env.GEMINI_MODEL = originalModel;
    }
  }
});

test("exposes Gemini's diagnostic for malformed interaction requests", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    Response.json(
      { error: { message: "The request field system_instruction is invalid" } },
      { status: 400 },
    );

  try {
    await assert.rejects(
      () => callLlm("Frage", "test-key"),
      (error: unknown) =>
        error instanceof GeminiLlmError &&
        error.statusCode === 400 &&
        error.message.includes("system_instruction is invalid"),
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("returns a clear 503 message after retries on both models are exhausted", async () => {
  const originalFetch = globalThis.fetch;
  let attempts = 0;
  globalThis.fetch = async () => {
    attempts += 1;
    return Response.json({ error: { message: "provider internals" } }, { status: 503 });
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
