const test = require("node:test");
const assert = require("node:assert/strict");
const { rewriteTokenPayload } = require("./probeSupabaseFirebaseBridge");

const decodePayload = (token) => JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString("utf8"));

test("rewrites only the JWT payload and preserves the original signature", () => {
  const token = [
    Buffer.from("header").toString("base64url"),
    Buffer.from(JSON.stringify({ aud: "original", exp: 100 })).toString("base64url"),
    "signature",
  ].join(".");
  const rewritten = rewriteTokenPayload(token, (payload) => ({ ...payload, aud: "other" }));
  assert.equal(decodePayload(rewritten).aud, "other");
  assert.equal(rewritten.split(".")[2], "signature");
});

test("rejects malformed tokens", () => {
  assert.throws(() => rewriteTokenPayload("invalid", (payload) => payload), /invalid JWT/);
});
