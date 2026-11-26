import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import { checkRateLimit, getClientId, resetRateLimits } from "../lib/interfaces/rate-limit.js";
import { createJsonEndpoint } from "../lib/interfaces/http.js";

function fakeRes() {
  return {
    statusCode: 200,
    headers: {},
    body: null,
    setHeader(name, value) { this.headers[name.toLowerCase()] = value; },
    status(code) { this.statusCode = code; return this; },
    json(data) { this.body = data; return this; },
    end() { return this; }
  };
}

describe("rate limit", () => {
  beforeEach(() => resetRateLimits());

  it("allows up to the limit and then blocks with retry-after", () => {
    const rule = { key: "t", limit: 3, windowMs: 60000, now: 1000 };
    for (let i = 0; i < 3; i += 1) assert.equal(checkRateLimit("1.1.1.1", rule).allowed, true);
    const blocked = checkRateLimit("1.1.1.1", rule);
    assert.equal(blocked.allowed, false);
    assert.equal(blocked.retryAfterSeconds, 60);
    assert.equal(checkRateLimit("2.2.2.2", rule).allowed, true, "other clients are not affected");
  });

  it("frees the slot once the window has passed", () => {
    const rule = { key: "t", limit: 1, windowMs: 1000 };
    assert.equal(checkRateLimit("a", { ...rule, now: 0 }).allowed, true);
    assert.equal(checkRateLimit("a", { ...rule, now: 500 }).allowed, false);
    assert.equal(checkRateLimit("a", { ...rule, now: 1001 }).allowed, true);
  });

  it("uses the first x-forwarded-for address", () => {
    assert.equal(getClientId({ headers: { "x-forwarded-for": "9.9.9.9, 10.0.0.1" } }), "9.9.9.9");
  });

  it("counts each request once even with several rules", async () => {
    const handler = createJsonEndpoint({
      name: "Multi",
      method: "POST",
      rateLimits: [{ limit: 3, windowMs: 60000 }, { limit: 100, windowMs: 3600000 }],
      validate: () => ({ ok: true, value: {} }),
      handle: async () => ({ ok: true })
    });
    const req = { method: "POST", headers: { "x-forwarded-for": "6.6.6.6" }, body: {} };
    const statuses = [];
    for (let i = 0; i < 4; i += 1) {
      const res = fakeRes();
      await handler(req, res);
      statuses.push(res.statusCode);
    }
    assert.deepEqual(statuses, [200, 200, 200, 429]);
  });

  it("returns 429 from an endpoint once the limit is reached", async () => {
    const handler = createJsonEndpoint({
      name: "Test",
      method: "POST",
      rateLimits: [{ limit: 1, windowMs: 60000 }],
      validate: () => ({ ok: true, value: {} }),
      handle: async () => ({ ok: true })
    });
    const req = { method: "POST", headers: { "x-forwarded-for": "5.5.5.5" }, body: {} };
    const first = fakeRes();
    await handler(req, first);
    const second = fakeRes();
    await handler(req, second);
    assert.equal(first.statusCode, 200);
    assert.equal(second.statusCode, 429);
    assert.ok(second.headers["retry-after"]);
  });
});
