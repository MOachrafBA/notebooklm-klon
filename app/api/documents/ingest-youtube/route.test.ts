import assert from "node:assert/strict";
import test from "node:test";
import { POST } from "./route";

test("rejects unauthenticated requests before validating the URL", async () => {
  const response = await POST(new Request("http://localhost/api/documents/ingest-youtube", {
    method: "POST",
    body: JSON.stringify({ url: "https://example.com/video" }),
    headers: { "content-type": "application/json" },
  }));
  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), {
    error: "Bitte melde dich an, bevor du eine Quelle hinzufügst.",
  });
});

test("rejects unauthenticated malformed JSON requests", async () => {
  const response = await POST(new Request("http://localhost/api/documents/ingest-youtube", {
    method: "POST",
    body: "{",
    headers: { "content-type": "application/json" },
  }));
  assert.equal(response.status, 401);
});
