import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isAuthorizedRequest, shouldRequireApiKey } from "../lib/interfaces/http-auth.js";

describe("http auth policy", () => {
  it("keeps public access by default for web and app clients", () => {
    const env = { IRIS_API_KEY: "secret" };
    assert.equal(shouldRequireApiKey(env), false);
    assert.equal(isAuthorizedRequest({ headers: {} }, env), true);
  });

  it("requires the bearer token when strict auth is enabled", () => {
    const env = { IRIS_API_KEY: "secret", IRIS_REQUIRE_API_KEY: "true" };
    assert.equal(shouldRequireApiKey(env), true);
    assert.equal(isAuthorizedRequest({ headers: {} }, env), false);
    assert.equal(isAuthorizedRequest({ headers: { authorization: "Bearer wrong!" } }, env), false);
    assert.equal(isAuthorizedRequest({ headers: { authorization: "Bearer secret" } }, env), true);
  });

  it("denies access instead of staying open when strict auth has no key", () => {
    const env = { IRIS_REQUIRE_API_KEY: "true" };
    assert.equal(isAuthorizedRequest({ headers: { authorization: "Bearer " } }, env), false);
  });
});
