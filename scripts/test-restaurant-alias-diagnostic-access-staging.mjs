import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { closeChrome, evaluateBrowserQualification, openChrome, sanitizeRequest, sanitizeResponse, waitForServiceWorkerReady } from "./qualify-restaurant-alias-diagnostic-access-staging.mjs";

const base = "https://candidate.example.invalid";
const state = (path, operational = true) => ({ path, heading: "Dashboard", blank: false, operational, earningsLink: false, diagnostic: { errors: [], navigations: [], protectedBeforeReady: false } });
const valid = (overrides = {}) => ({ accountName: "owner", expectedPath: "/dashboard", directPath: "/orders", baseUrl: base, authenticated: state("/dashboard"), restored: state("/orders"), mainCount: 1, serviceWorkerReady: true, requests: [{ url: base + "/dashboard", path: "/dashboard" }], ...overrides });

test("clean complete operational rendering passes", () => assert.equal(evaluateBrowserQualification(valid()).passed, true));
test("React hydration #418 fails", () => assert.deepEqual(evaluateBrowserQualification(valid({ exceptions: ["Minified React error #418"] })).blockers, ["UNCAUGHT_OR_CONSOLE_ERROR"]));
test("any console error fails", () => assert.ok(evaluateBrowserQualification(valid({ consoleErrors: ["unexpected"] })).blockers.includes("UNCAUGHT_OR_CONSOLE_ERROR")));
test("required same-origin HTTP 404 fails", () => assert.ok(evaluateBrowserQualification(valid({ httpErrors: [{ url: base + "/orders", status: 404, type: "Document" }] })).blockers.includes("SAME_ORIGIN_HTTP_ERROR")));
test("automatic optional favicon 404 is recorded but does not fail", () => { const result = evaluateBrowserQualification(valid({ httpErrors: [{ url: base + "/favicon.ico", status: 404, type: "Other" }] })); assert.equal(result.passed, true); assert.equal(result.ignoredOptionalHttpErrors.length, 1); });
test("unexpected runtime origin fails", () => assert.ok(evaluateBrowserQualification(valid({ requests: [{ url: "https://unexpected.invalid/code.js", path: "/code.js" }] })).blockers.includes("UNEXPECTED_RUNTIME_REQUEST")));
test("browser-internal requests are outside the application runtime origin contract", () => assert.equal(evaluateBrowserQualification(valid({ requests: [{ url: "chrome-extension://fixture/background.js", path: "/background.js" }] })).passed, true));
test("sanitized runtime requests retain origin without credential or query values", () => { const request = sanitizeRequest({ method: "GET", url: base + "/dashboard?token=secret", headers: { Authorization: "Bearer secret", "X-Test": "value" } }); assert.equal(request.origin, base); assert.equal(request.protocol, "https:"); assert.deepEqual(request.queryParameterNames, ["token"]); assert.deepEqual(request.credentialHeaderNames, ["authorization"]); assert.equal(JSON.stringify(request).includes("secret"), false); assert.equal(evaluateBrowserQualification(valid({ requests: [request] })).passed, true); });
test("sanitized runtime responses preserve diagnostics without credential-shaped values", () => { const response = sanitizeResponse({ url: base + "/identity?key=secret&token=private", status: 401, mimeType: "application/json" }); assert.equal(response.origin, base); assert.equal(response.path, "/identity"); assert.deepEqual(response.queryParameterNames, ["key", "token"]); assert.equal(response.status, 401); assert.equal(JSON.stringify(response).includes("secret"), false); assert.equal(JSON.stringify(response).includes("private"), false); });
test("incomplete rendering and missing service worker fail", () => { const result = evaluateBrowserQualification(valid({ restored: { ...state("/orders"), heading: null }, serviceWorkerReady: false })); assert.ok(result.blockers.includes("INCOMPLETE_OPERATIONAL_RENDERING")); assert.ok(result.blockers.includes("SERVICE_WORKER_NOT_READY")); });
test("manager earnings request fails", () => assert.ok(evaluateBrowserQualification(valid({ accountName: "manager", requests: [{ url: base + "/rest/v1/rpc/restaurant_get_earnings", path: "/rest/v1/rpc/restaurant_get_earnings" }] })).blockers.includes("MANAGER_FINANCIAL_ACCESS")));
test("pending renders without operational shell", () => { const pending = state("/pending", false); assert.equal(evaluateBrowserQualification(valid({ accountName: "pending", expectedPath: "/pending", directPath: null, authenticated: pending, restored: pending })).passed, true); });
test("suspended renders without operational shell", () => { const suspended = state("/suspended", false); assert.equal(evaluateBrowserQualification(valid({ accountName: "suspended", expectedPath: "/suspended", directPath: null, authenticated: suspended, restored: suspended })).passed, true); });
test("manager operational rendering passes without Earnings", () => assert.equal(evaluateBrowserQualification(valid({ accountName: "manager" })).passed, true));
test("service-worker readiness waits for activation", async () => { let calls = 0, sleeps = 0; const result = await waitForServiceWorkerReady(async () => ({ supported: true, ready: ++calls === 3, registrations: [] }), { attempts: 4, intervalMs: 1, sleep: async () => { sleeps += 1; } }); assert.equal(result.ready, true); assert.equal(result.attempt, 3); assert.equal(sleeps, 2); });
test("service-worker readiness remains fail closed after the bound", async () => { const result = await waitForServiceWorkerReady(async () => ({ supported: true, ready: false, registrations: [{ scope: base + "/", installing: "installing" }] }), { attempts: 3, intervalMs: 1, sleep: async () => {} }); assert.equal(result.ready, false); assert.equal(result.attempt, 3); });

class FakeSocket {
  addEventListener(type, callback) { if (type === "open") queueMicrotask(callback); }
  send() {}
  close() { this.closed = true; }
}

test("Chrome qualification binds DevTools to the newly spawned profile instead of a fixed stale port", async t => {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), "alias-access-owned-profile-"));
  t.after(() => fs.rmSync(profile, { recursive: true, force: true }));
  const processHandle = { exitCode: null, kill(signal) { this.signal = signal; this.exitCode = 0; return true; } };
  let args;
  const spawnImpl = (_binary, values) => { args = values; fs.writeFileSync(path.join(profile, "DevToolsActivePort"), "43127\n/devtools/browser/owned-fixture\n"); return processHandle; };
  const fetchImpl = async (url, options) => {
    assert.match(url, /^http:\/\/127\.0\.0\.1:43127\/json\/(?:version|new\?about:blank)$/);
    if (options?.method === "PUT") return { ok: true, async json() { return { webSocketDebuggerUrl: "ws://127.0.0.1:43127/devtools/page/owned-page" }; } };
    return { ok: true, async json() { return { Browser: "Chrome/fixture", webSocketDebuggerUrl: "ws://127.0.0.1:43127/devtools/browser/owned-fixture" }; } };
  };
  const browser = await openChrome("chrome", profile, { spawnImpl, fetchImpl, socketFactory: () => new FakeSocket(), sleep: async () => {} });
  assert.ok(args.includes("--remote-debugging-port=0"));
  assert.equal(args.some(value => value === "--remote-debugging-port=9580" || value === "--remote-debugging-port=9581"), false);
  assert.equal(browser.port, 43127);
  assert.equal(browser.browserSocketPath, "/devtools/browser/owned-fixture");
  await closeChrome(browser, { sleep: async () => {} });
  assert.equal(processHandle.signal, "SIGTERM");
});

test("a reachable stale DevTools endpoint is ignored when the spawned profile has no ownership marker", async t => {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), "alias-access-missing-owned-endpoint-"));
  t.after(() => fs.rmSync(profile, { recursive: true, force: true }));
  const processHandle = { exitCode: null, kill() { this.exitCode = 0; return true; } };
  let fetchCalls = 0, sleeps = 0;
  await assert.rejects(
    () => openChrome("chrome", profile, { spawnImpl: () => processHandle, fetchImpl: async () => { fetchCalls += 1; return { ok: true }; }, socketFactory: () => new FakeSocket(), sleep: async () => { if (++sleeps === 2) processHandle.exitCode = 1; } }),
    /DevTools endpoint unavailable/,
  );
  assert.equal(fetchCalls, 0);
});
