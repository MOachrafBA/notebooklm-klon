import assert from "node:assert/strict";
import test from "node:test";
import { POST } from "./route";

test("returns 400 before contacting providers for an invalid URL", async () => {
  const response = await POST(new Request("http://localhost/api/documents/ingest-youtube", {
    method: "POST",
    body: JSON.stringify({ url: "https://example.com/video" }),
    headers: { "content-type": "application/json" },
  }));
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), {
    error: "Bitte sende eine gültige öffentliche YouTube-URL.",
  });
});

test("returns 400 for malformed JSON", async () => {
  const response = await POST(new Request("http://localhost/api/documents/ingest-youtube", {
    method: "POST",
    body: "{",
    headers: { "content-type": "application/json" },
  }));
  assert.equal(response.status, 400);
});
