import assert from "node:assert/strict";
import test from "node:test";
import { expectedPlist, status } from "./phase7-launch-agent.mjs";

test("LaunchAgent wraps the reviewed runner in managed caffeinate", () => {
  const plist = expectedPlist();
  assert.match(plist, /app\.hungrie\.phase7-qualification/);
  assert.match(plist, /<string>\/usr\/bin\/caffeinate<\/string><string>-ims<\/string>/);
  assert.match(plist, /phase7-runner\.mjs/);
  assert.match(plist, /<key>RunAtLoad<\/key><true\/>/);
  assert.match(plist, /<key>KeepAlive<\/key><true\/>/);
  assert.match(plist, /secure\/phase7\/runner/);
});

test("status explicitly records LaunchAgent login recovery semantics", () => {
  const result = status();
  assert.equal(result.mechanism, "LaunchAgent");
  assert.equal(result.loginRequiredAfterReboot, true);
});
