import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { classifyHttpFailure, closeChrome, documentScopedAutomationHeaders, evaluateBrowserQualification, isSafetyQualificationError, mergeDocumentAutomationHeaders, openChrome, qualifyAccount, qualifyAccountsExhaustively, routeStateReady, sanitizeDiagnosticText, sanitizeErrorBody, sanitizeInitiator, sanitizeObservedUrl, sanitizeRequest, sanitizeResponse, sanitizeResponseHeaders, waitForServiceWorkerReady } from "./qualify-restaurant-alias-diagnostic-access-staging.mjs";

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
test("HTTP 429 captures only safe delivery headers, protocol, cache, and remote endpoint", () => {
  const response = sanitizeResponse({ url: base + "/asset.css?token=secret", status: 429, mimeType: "text/html", protocol: "h2", remoteIPAddress: "203.0.113.5", remotePort: 443, fromDiskCache: false, fromPrefetchCache: false, fromServiceWorker: false, headers: { Server: "cloudflare", "CF-Ray": "fixture-IST", "Retry-After": "5", "CF-Cache-Status": "DYNAMIC", Cookie: "secret", Authorization: "Bearer secret", "Set-Cookie": "private" } }, { type: "Stylesheet" });
  assert.equal(response.failureClassification, "RATE_LIMIT_RESPONSE");
  assert.deepEqual(response.safeHeaders, { "cf-cache-status": "DYNAMIC", "cf-ray": "fixture-IST", "retry-after": "5", server: "cloudflare" });
  assert.deepEqual(response.remoteEndpoint, { address: "203.0.113.5", port: 443 });
  assert.equal(response.httpProtocol, "h2");
  assert.equal(JSON.stringify(response).includes("secret"), false);
});
test("missing response headers produce a complete empty safe-header record", () => assert.deepEqual(sanitizeResponseHeaders(), {}));
test("error body evidence stores length and hash but never content", () => {
  const body = "token=secret password=hunter2 manager@example.invalid";
  const evidence = sanitizeErrorBody(body);
  assert.equal(evidence.byteLength, Buffer.byteLength(body));
  assert.match(evidence.sha256, /^[a-f0-9]{64}$/);
  assert.equal(evidence.contentPersisted, false);
  assert.equal(JSON.stringify(evidence).includes("secret"), false);
  assert.equal(JSON.stringify(evidence).includes("hunter2"), false);
});
test("initiator evidence sanitizes URLs and bounds stack frames", () => {
  const evidence = sanitizeInitiator({ type: "script", url: `${base}/entry.js?token=secret`, stack: { callFrames: Array.from({ length: 12 }, (_, index) => ({ functionName: `load${index}`, url: `${base}/bundle.js?key=private`, lineNumber: index, columnNumber: 1 })) } }, `${base}/orders?session=private`);
  assert.equal(evidence.stack.length, 8);
  assert.equal(JSON.stringify(evidence).includes("secret"), false);
  assert.equal(JSON.stringify(evidence).includes("private"), false);
  assert.match(evidence.documentUrl, /%5BREDACTED%5D/);
});
test("favicon classification remains narrow while favicon 429 remains an HTTP failure", () => {
  assert.equal(classifyHttpFailure({ status: 404, path: "/favicon.ico", type: "Other" }), "OPTIONAL_FAVICON_NOT_FOUND");
  assert.equal(classifyHttpFailure({ status: 429, path: "/favicon.ico", type: "Other" }), "RATE_LIMIT_RESPONSE");
  assert.equal(classifyHttpFailure({ status: 404, path: "/required.css", type: "Stylesheet" }), "REQUIRED_RESOURCE_NOT_FOUND");
});
test("incomplete rendering and missing service worker fail", () => { const result = evaluateBrowserQualification(valid({ restored: { ...state("/orders"), heading: null }, serviceWorkerReady: false })); assert.ok(result.blockers.includes("INCOMPLETE_OPERATIONAL_RENDERING")); assert.ok(result.blockers.includes("SERVICE_WORKER_NOT_READY")); });
test("manager earnings request fails", () => assert.ok(evaluateBrowserQualification(valid({ accountName: "manager", requests: [{ url: base + "/rest/v1/rpc/restaurant_get_earnings", path: "/rest/v1/rpc/restaurant_get_earnings" }] })).blockers.includes("MANAGER_FINANCIAL_ACCESS")));
test("pending renders without operational shell", () => { const pending = state("/pending", false); assert.equal(evaluateBrowserQualification(valid({ accountName: "pending", expectedPath: "/pending", directPath: null, authenticated: pending, restored: pending })).passed, true); });
test("suspended renders without operational shell", () => { const suspended = state("/suspended", false); assert.equal(evaluateBrowserQualification(valid({ accountName: "suspended", expectedPath: "/suspended", directPath: null, authenticated: suspended, restored: suspended })).passed, true); });
test("manager operational rendering passes without Earnings", () => assert.equal(evaluateBrowserQualification(valid({ accountName: "manager" })).passed, true));
test("service-worker readiness waits for activation", async () => { let calls = 0, sleeps = 0; const result = await waitForServiceWorkerReady(async () => ({ supported: true, ready: ++calls === 3, registrations: [] }), { attempts: 4, intervalMs: 1, sleep: async () => { sleeps += 1; } }); assert.equal(result.ready, true); assert.equal(result.attempt, 3); assert.equal(sleeps, 2); });
test("service-worker readiness remains fail closed after the bound", async () => { const result = await waitForServiceWorkerReady(async () => ({ supported: true, ready: false, registrations: [{ scope: base + "/", installing: "installing" }] }), { attempts: 3, intervalMs: 1, sleep: async () => {} }); assert.equal(result.ready, false); assert.equal(result.attempt, 3); });
test("protected route readiness requires operational rendering and resolved access", () => {
  assert.equal(routeStateReady(state("/dashboard"), "/dashboard", { operational: true }), false);
  assert.equal(routeStateReady({ ...state("/dashboard"), diagnostic: { ...state("/dashboard").diagnostic, accessResolved: true } }, "/dashboard", { operational: true }), true);
  assert.equal(routeStateReady({ ...state("/dashboard"), overlay: true, diagnostic: { accessResolved: true } }, "/dashboard", { operational: true }), false);
});
test("diagnostic text redacts credential-shaped values", () => {
  const sanitized = sanitizeDiagnosticText("Bearer top-secret password=hunter2 user@example.com eyJabc.def.ghi");
  assert.equal(sanitized.includes("top-secret"), false);
  assert.equal(sanitized.includes("hunter2"), false);
  assert.equal(sanitized.includes("user@example.com"), false);
  assert.equal(sanitized.includes("eyJabc.def.ghi"), false);
  assert.equal(sanitizeObservedUrl(`${base}/login?token=secret&reason=session-expired`), `${base}/login?token=%5BREDACTED%5D&reason=%5BREDACTED%5D`);
});

test("toolbar suppression is attached only to exact-origin document requests", () => {
  assert.deepEqual(documentScopedAutomationHeaders({ requestUrl: `${base}/orders`, resourceType: "Document", exactOrigin: base }), [{ name: "x-vercel-skip-toolbar", value: "1" }]);
  assert.deepEqual(documentScopedAutomationHeaders({ requestUrl: `${base}/app.js`, resourceType: "Script", exactOrigin: base }), []);
  assert.deepEqual(documentScopedAutomationHeaders({ requestUrl: "https://identitytoolkit.googleapis.com/v1/accounts", resourceType: "Document", exactOrigin: base }), []);
  assert.deepEqual(documentScopedAutomationHeaders({ requestUrl: "https://project.supabase.co/auth", resourceType: "Document", exactOrigin: base }), []);
});

test("document header merge rejects protection credentials and duplicate toolbar controls", () => {
  assert.deepEqual(mergeDocumentAutomationHeaders([{ name: "Accept", value: "text/html" }], [{ name: "x-vercel-skip-toolbar", value: "1" }]), [{ name: "Accept", value: "text/html" }, { name: "x-vercel-skip-toolbar", value: "1" }]);
  assert.throws(() => mergeDocumentAutomationHeaders([{ name: "x-vercel-protection-bypass", value: "secret" }], []), /protected automation header/);
  assert.throws(() => mergeDocumentAutomationHeaders([{ name: "X-Vercel-Skip-Toolbar", value: "1" }], []), /protected automation header/);
});

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

class QualificationCdp {
  constructor(mode) { this.mode = mode; this.listeners = []; this.signedIn = false; this.direct = false; this.directSnapshots = 0; }
  on(listener) { this.listeners.push(listener); }
  emit(method, params) { this.listeners.forEach(listener => listener({ method, params })); }
  currentState() {
    const diagnostic = { errors: [], navigations: [], protectedBeforeReady: false, accessResolved: this.signedIn };
    if (!this.signedIn) return { url: `${base}/login`, path: "/login", heading: "Sign in", blank: false, operational: false, overlay: false, loginFormVisible: true, earningsLink: false, diagnostic };
    if (!this.direct) return { url: `${base}/dashboard`, path: "/dashboard", heading: "Operations overview", blank: false, operational: true, overlay: false, loginFormVisible: false, earningsLink: false, diagnostic };
    this.directSnapshots += 1;
    if (this.mode === "delayed" && this.directSnapshots < 3) return { url: `${base}/login`, path: "/login", heading: "Sign in", blank: false, operational: false, overlay: false, loginFormVisible: true, earningsLink: false, diagnostic: { ...diagnostic, accessResolved: false } };
    if (this.mode === "redirect" || this.mode === "timeout") return { url: `${base}/login`, path: "/login", heading: "Sign in", blank: false, operational: false, overlay: false, loginFormVisible: true, earningsLink: false, diagnostic: { ...diagnostic, accessResolved: false } };
    if (this.mode === "overlay") return { url: `${base}/orders`, path: "/orders", heading: "Loading", blank: false, operational: false, overlay: true, loginFormVisible: false, earningsLink: false, diagnostic };
    return { url: `${base}/orders`, path: "/orders", heading: "Live orders", blank: false, operational: true, overlay: false, loginFormVisible: false, earningsLink: false, diagnostic };
  }
  async send(method, params = {}) {
    if (method === "Page.navigate") {
      if (new URL(params.url).pathname === "/orders") {
        this.direct = true;
        this.emit("Page.lifecycleEvent", { name: "init", frameId: "frame", loaderId: "direct-loader" });
        if (this.mode === "navigate-error") throw new Error("navigation failed token=top-secret");
        if (["http", "http429", "incomplete-body"].includes(this.mode)) {
          const status = this.mode === "http429" || this.mode === "incomplete-body" ? 429 : 404;
          this.emit("Network.requestWillBeSent", { requestId: "http-error", type: "Stylesheet", documentURL: `${base}/orders?session=private`, initiator: { type: "parser", url: `${base}/orders?token=secret` }, request: { method: "GET", url: `${base}/required.css?token=secret`, headers: { Referer: `${base}/orders`, Authorization: "Bearer secret" } } });
          this.emit("Network.responseReceived", { requestId: "http-error", type: "Stylesheet", response: { url: `${base}/required.css?token=secret`, status, mimeType: "text/html", protocol: "h2", remoteIPAddress: "203.0.113.9", remotePort: 443, headers: { Server: "cloudflare", "CF-Ray": "fixture-IST", "Retry-After": "3", "Set-Cookie": "private" } } });
          this.emit("Network.loadingFinished", { requestId: "http-error", encodedDataLength: 128 });
        }
        if (this.mode === "loading-failed") this.emit("Network.loadingFailed", { requestId: "partial", type: "Stylesheet", errorText: "net::ERR_CONNECTION_RESET token=secret", canceled: false, blockedReason: "other" });
        if (this.mode === "timeout") {
          this.emit("Runtime.consoleAPICalled", { type: "error", args: [{ value: "Bearer top-secret manager@example.com" }] });
          this.emit("Network.requestWillBeSent", { requestId: "secret", type: "Fetch", request: { method: "GET", url: `${base}/orders?token=top-secret`, headers: { Authorization: "Bearer top-secret" } } });
        }
        return { frameId: "frame", loaderId: "direct-loader" };
      }
      this.emit("Page.lifecycleEvent", { name: "init", frameId: "frame", loaderId: "login-loader" });
      return { frameId: "frame", loaderId: "login-loader" };
    }
    if (method === "Page.reload") return { frameId: "frame", loaderId: "reload-loader" };
    if (method === "Runtime.evaluate") {
      if (params.expression === "!!document.querySelector('input[type=email]')") return { result: { value: !this.signedIn } };
      if (params.expression.includes("button[type=submit]")) { this.signedIn = true; return { result: { value: true } }; }
      if (params.expression.includes("serviceWorker.getRegistrations")) return { result: { value: { supported: true, ready: true, controller: true, registrations: [{ scope: `${base}/`, active: "activated", waiting: null, installing: null }] } } };
      if (params.expression.startsWith("({url:location.href")) return { result: { value: this.currentState() } };
      return { result: { value: true } };
    }
    if (method === "Accessibility.getFullAXTree") return { nodes: [{ ignored: false, role: { value: "main" } }] };
    if (method === "Page.captureScreenshot") return { data: Buffer.from("fixture screenshot").toString("base64") };
    if (method === "Network.getResponseBody") {
      if (this.mode === "incomplete-body") throw new Error("No resource with given identifier token=private");
      return { body: "rate limit response password=secret", base64Encoded: false };
    }
    return {};
  }
  close() { this.closed = true; }
}

async function runQualificationFixture(t, mode, overrides = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), `alias-access-${mode}-`));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const cdp = new QualificationCdp(mode);
  let closed = false, profilePath = null;
  const options = {
    accountName: "manager",
    account: { email: "manager@example.invalid", password: "fixture-password" },
    expectedPath: "/dashboard",
    directPath: "/orders",
    baseUrl: base,
    directory,
    chromePath: "fixture-chrome",
    openChromeImpl: async (_chromePath, profile) => { profilePath = profile; return { version: { Browser: "Chrome/fixture" }, port: 43128, cdp, processHandle: { exitCode: 0 } }; },
    closeChromeImpl: async () => { closed = true; cdp.close(); },
    sleep: async () => {},
    waitAttempts: 4,
    waitIntervalMs: 0,
    ...overrides,
  };
  return { directory, cdp, options, wasClosed: () => closed, profileRemoved: () => Boolean(profilePath && !fs.existsSync(profilePath)) };
}

test("real qualification flow persists successful direct-route restoration evidence", async t => {
  const fixture = await runQualificationFixture(t, "success");
  const result = await qualifyAccount(fixture.options);
  assert.equal(result.passed, true);
  assert.equal(result.authenticated.operational, true);
  assert.equal(result.authenticated.diagnostic.accessResolved, true);
  assert.equal(result.restored.path, "/orders");
  assert.equal(result.navigationObservations.length, 2);
  assert.ok(result.lifecycleObservations.length >= 2);
  assert.equal(result.screenshot.captured, true);
  const persisted = fs.readFileSync(path.join(fixture.directory, "immutable-manager-access-evidence.json"), "utf8");
  assert.equal(persisted.includes("manager@example.invalid"), false);
  assert.equal(persisted.includes("fixture-password"), false);
  assert.equal(fixture.wasClosed(), true);
  assert.equal(fixture.profileRemoved(), true);
});

test("delayed direct-route restoration succeeds without weakening the final criterion", async t => {
  const fixture = await runQualificationFixture(t, "delayed");
  const result = await qualifyAccount(fixture.options);
  assert.equal(result.passed, true);
  assert.equal(result.restored.path, "/orders");
  assert.equal(result.restored.operational, true);
  assert.equal(fixture.cdp.directSnapshots, 3);
});

for (const [mode, classification, expectedPath] of [
  ["redirect", "DIRECT_ROUTE_TIMEOUT", "/login"],
  ["overlay", "DIRECT_ROUTE_TIMEOUT", "/orders"],
]) {
  test(`${mode} failure persists final browser state before throwing`, async t => {
    const fixture = await runQualificationFixture(t, mode);
    await assert.rejects(() => qualifyAccount(fixture.options), /did not reach \/orders/);
    const evidence = JSON.parse(fs.readFileSync(path.join(fixture.directory, "immutable-manager-access-evidence.json"), "utf8"));
    assert.equal(evidence.passed, false);
    assert.equal(evidence.failureClassification, classification);
    assert.equal(evidence.finalState.path, expectedPath);
    assert.equal(evidence.finalUrl, `${base}${expectedPath}`);
    assert.equal(evidence.screenshot.captured, true);
    assert.equal(evidence.navigationObservations.at(-1).result.loaderId, "direct-loader");
    assert.equal(evidence.serviceWorkerReady, true);
    assert.equal(fixture.wasClosed(), true);
  });
}

test("same-origin HTTP failure is classified and persisted after rendering", async t => {
  const fixture = await runQualificationFixture(t, "http");
  await assert.rejects(() => qualifyAccount(fixture.options), /SAME_ORIGIN_HTTP_ERROR/);
  const evidence = JSON.parse(fs.readFileSync(path.join(fixture.directory, "immutable-manager-access-evidence.json"), "utf8"));
  assert.equal(evidence.failureClassification, "QUALIFICATION_FAILED");
  assert.equal(evidence.finalState.path, "/orders");
  assert.equal(evidence.httpErrors.length, 1);
  assert.equal(evidence.httpErrors[0].status, 404);
  assert.ok(evidence.blockers.includes("SAME_ORIGIN_HTTP_ERROR"));
});

test("HTTP 401, 403, and 500 remain mandatory qualification failures", () => {
  for (const status of [401, 403, 500]) {
    const result = evaluateBrowserQualification(valid({ httpErrors: [{ url: `${base}/required.json`, path: "/required.json", status, type: "Fetch" }] }));
    assert.equal(result.passed, false);
    assert.ok(result.blockers.includes("SAME_ORIGIN_HTTP_ERROR"));
  }
});

test("exhaustive account qualification continues after ordinary failures", async () => {
  const cases = [{ name: "pending", expected: "/pending" }, { name: "suspended", expected: "/suspended" }, { name: "owner", expected: "/dashboard", direct: "/orders" }, { name: "manager", expected: "/dashboard", direct: "/orders" }];
  const seen = [];
  const result = await qualifyAccountsExhaustively({ cases, qualify: async item => { seen.push(item.name); if (["pending", "owner"].includes(item.name)) throw new Error("ordinary failure"); return { account: item.name, passed: true }; } });
  assert.deepEqual(seen, cases.map(item => item.name));
  assert.equal(result.classification, "FAIL");
  assert.deepEqual(result.results.map(row => row.status), ["FAIL", "PASS", "FAIL", "PASS"]);
});

test("exhaustive account qualification stops only for a safety condition", async () => {
  const cases = [{ name: "pending", expected: "/pending" }, { name: "suspended", expected: "/suspended" }, { name: "owner", expected: "/dashboard" }];
  const seen = [], error = new Error("identity mismatch"); error.code = "IDENTITY_MISMATCH";
  const result = await qualifyAccountsExhaustively({ cases, qualify: async item => { seen.push(item.name); if (item.name === "suspended") throw error; return { account: item.name, passed: true }; } });
  assert.equal(isSafetyQualificationError(error), true);
  assert.deepEqual(seen, ["pending", "suspended"]);
  assert.equal(result.classification, "BLOCKED");
  assert.deepEqual(result.results.map(row => row.status), ["PASS", "BLOCKED", "NOT EXECUTED"]);
});

test("HTTP 429 persists delivery metadata and hashed body before throwing", async t => {
  const fixture = await runQualificationFixture(t, "http429");
  await assert.rejects(() => qualifyAccount(fixture.options), /SAME_ORIGIN_HTTP_ERROR/);
  const text = fs.readFileSync(path.join(fixture.directory, "immutable-manager-access-evidence.json"), "utf8"), evidence = JSON.parse(text);
  const row = evidence.httpErrors[0];
  assert.equal(row.status, 429);
  assert.equal(row.failureClassification, "RATE_LIMIT_RESPONSE");
  assert.equal(row.safeHeaders.server, "cloudflare");
  assert.equal(row.safeHeaders["cf-ray"], "fixture-IST");
  assert.equal(row.safeHeaders["retry-after"], "3");
  assert.equal(row.errorBody.available, true);
  assert.match(row.errorBody.sha256, /^[a-f0-9]{64}$/);
  assert.equal(row.errorBody.contentPersisted, false);
  assert.equal(evidence.requestInventory.at(-1).initiator.type, "parser");
  assert.equal(text.includes("Bearer secret"), false);
  assert.equal(text.includes("password=secret"), false);
  assert.equal(text.includes("Set-Cookie"), false);
  assert.equal(text.includes("token=secret"), false);
});

test("incomplete CDP response-body capture remains explicit and fail closed", async t => {
  const fixture = await runQualificationFixture(t, "incomplete-body");
  await assert.rejects(() => qualifyAccount(fixture.options), /SAME_ORIGIN_HTTP_ERROR/);
  const text = fs.readFileSync(path.join(fixture.directory, "immutable-manager-access-evidence.json"), "utf8"), evidence = JSON.parse(text);
  assert.equal(evidence.passed, false);
  assert.equal(evidence.httpErrors[0].status, 429);
  assert.equal(evidence.httpErrors[0].errorBody.available, false);
  assert.equal(evidence.httpErrors[0].errorBody.byteLength, 128);
  assert.match(evidence.httpErrors[0].errorBody.error, /token=\[REDACTED\]/);
  assert.equal(text.includes("private"), false);
});

test("partial network failure is sanitized and atomically persisted before throwing", async t => {
  const fixture = await runQualificationFixture(t, "loading-failed");
  await assert.rejects(() => qualifyAccount(fixture.options), /NETWORK_LOADING_FAILURE/);
  const text = fs.readFileSync(path.join(fixture.directory, "immutable-manager-access-evidence.json"), "utf8"), evidence = JSON.parse(text);
  assert.equal(evidence.passed, false);
  assert.equal(evidence.failedRequests.length, 1);
  assert.equal(evidence.failedRequests[0].requestId, "partial");
  assert.equal(evidence.failedRequests[0].errorText, "net::ERR_CONNECTION_RESET token=[REDACTED]");
  assert.equal(text.includes("token=secret"), false);
  assert.ok(evidence.blockers.includes("NETWORK_LOADING_FAILURE"));
  assert.equal(fixture.wasClosed(), true);
});

test("timeout evidence is sanitized, complete, and cleanup is deterministic", async t => {
  const fixture = await runQualificationFixture(t, "timeout");
  await assert.rejects(() => qualifyAccount(fixture.options), /did not reach \/orders/);
  const evidencePath = path.join(fixture.directory, "immutable-manager-access-evidence.json");
  const text = fs.readFileSync(evidencePath, "utf8"), evidence = JSON.parse(text);
  assert.equal(text.includes("top-secret"), false);
  assert.equal(text.includes("manager@example.com"), false);
  assert.equal(evidence.requestInventory[0].path, "/orders");
  assert.deepEqual(evidence.requestInventory[0].queryParameterNames, ["token"]);
  assert.deepEqual(evidence.requestInventory[0].credentialHeaderNames, ["authorization"]);
  assert.equal(evidence.failureClassification, "DIRECT_ROUTE_TIMEOUT");
  assert.equal(evidence.finalState.path, "/login");
  assert.equal(evidence.observableAuthentication.accessResolved, false);
  assert.equal(evidence.screenshot.captured, true);
  assert.equal(fixture.wasClosed(), true);
  assert.equal(fixture.profileRemoved(), true);
});

test("navigation exceptions persist the failed attempt before propagating", async t => {
  const fixture = await runQualificationFixture(t, "navigate-error");
  await assert.rejects(() => qualifyAccount(fixture.options), /navigation failed/);
  const text = fs.readFileSync(path.join(fixture.directory, "immutable-manager-access-evidence.json"), "utf8"), evidence = JSON.parse(text);
  assert.equal(text.includes("top-secret"), false);
  assert.equal(evidence.failureClassification, "DIRECT_ROUTE_NAVIGATION_FAILED");
  assert.equal(evidence.navigationObservations.at(-1).result, null);
  assert.equal(evidence.navigationObservations.at(-1).error, "navigation failed token=[REDACTED]");
  assert.ok(evidence.navigationObservations.at(-1).completedAt);
  assert.equal(evidence.screenshot.captured, true);
});
