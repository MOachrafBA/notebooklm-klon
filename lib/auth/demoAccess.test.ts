import assert from "node:assert/strict";
import test from "node:test";
import {
  createDemoSessionToken,
  getDemoAccessSessionId,
  isDemoAccessAuthorized,
} from "./demoAccess";

const DEMO_PASSWORD = "a-32-character-demo-password-value!";

test("authorizes a signed demo cookie and derives a non-secret session identifier", () => {
  const originalPassword = process.env.SOURCE_ACCESS_PASSWORD;
  process.env.SOURCE_ACCESS_PASSWORD = DEMO_PASSWORD;
  const token = createDemoSessionToken(DEMO_PASSWORD);
  const request = new Request("http://localhost", {
    headers: { cookie: `sourcewise_demo_access=${token}` },
  });

  try {
    assert.equal(isDemoAccessAuthorized(request), true);
    assert.match(getDemoAccessSessionId(request) ?? "", /^[a-f0-9]{64}$/);
    assert.notEqual(getDemoAccessSessionId(request), token);
  } finally {
    if (originalPassword === undefined) {
      delete process.env.SOURCE_ACCESS_PASSWORD;
    } else {
      process.env.SOURCE_ACCESS_PASSWORD = originalPassword;
    }
  }
});
