import assert from "node:assert/strict";
import crypto from "node:crypto";
import http from "node:http";
import test, { after, before } from "node:test";
import {
  ALIAS_PARITY_DIAGNOSTIC_POLICY,
  ALIAS_PARITY_POLICY,
  observeRequest,
  sanitizeError,
  sanitizePersistentUrl,
  verifyAliasParity,
} from "./restaurant-alias-parity-verifier.mjs";

const hash = value => crypto.createHash("sha256").update(value).digest("hex");
const candidateHtml = Buffer.from('<!doctype html><html><head><link href="/app.css" rel="stylesheet"></head><body><script src="/app.js"></script></body></html>');
const oldHtml = Buffer.from('<!doctype html><html><head><link href="/old.css" rel="stylesheet"></head><body><script src="/old.js"></script></body></html>');
const candidateJs = Buffer.from("globalThis.CANDIDATE=true;");
const candidateCss = Buffer.from("body{color:#123456}");
const oldJs = Buffer.from("globalThis.OLD=true;");
const oldCss = Buffer.from("body{color:#654321}");
const expected = {
  deploymentIdentifier: "candidate-deployment",
  routes: [{ route: "/login", sha256: hash(candidateHtml) }, { route: "/dashboard", sha256: hash(candidateHtml) }],
  criticalAssets: [{ asset: "/app.js", sha256: hash(candidateJs) }, { asset: "/app.css", sha256: hash(candidateCss) }],
};

let server;
let origin;
let behavior;
let requests;
const ephemeralCredential = crypto.randomUUID();

before(async () => {
  server = http.createServer((request, response) => {
    const url = new URL(request.url, "http://local.test");
    const attempt = Number(url.searchParams.get("__parity_attempt") || url.searchParams.get("attempt") || 1);
    requests.push({ method: request.method, pathname: url.pathname, attempt });
    const state = behavior(attempt, url.pathname);
    response.setHeader("cache-control", state.cacheControl || "public, max-age=60");
    response.setHeader("age", String(state.age ?? attempt));
    response.setHeader("etag", state.etag || `W/\"attempt-${attempt}\"`);
    response.setHeader("date", new Date("2026-09-24T12:00:00.000Z").toUTCString());
    response.setHeader("server", "local-parity-test");
    response.setHeader("x-cache", state.xCache || "MISS");
    response.setHeader("set-cookie", "credential=must-not-persist");
    if (state.redirect) { response.writeHead(302, { location: state.redirect }); response.end(); return; }
    if (state.status && state.status !== 200) { response.writeHead(state.status); response.end(`status-${state.status}`); return; }
    if (url.pathname === "/metadata") {
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify({ deploymentIdentifier: state.metadata, updatedAt: `2026-09-24T12:00:0${Math.min(attempt, 9)}.000Z` }));
      return;
    }
    if (url.pathname === "/redirected") { response.end(candidateHtml); return; }
    if (url.pathname === "/app.js") { response.end(state.assetGeneration === "new" ? candidateJs : oldJs); return; }
    if (url.pathname === "/app.css") { response.end(state.assetGeneration === "new" ? candidateCss : oldCss); return; }
    response.end(state.routeGeneration === "new" ? candidateHtml : oldHtml);
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  origin = `http://127.0.0.1:${server.address().port}`;
});

after(async () => new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve())));

const makeClock = () => {
  let current = Date.parse("2026-09-24T12:00:00.000Z");
  return { now: () => current, sleep: async milliseconds => { current += milliseconds; }, advance: milliseconds => { current += milliseconds; } };
};

const defaultState = { metadata: "candidate-deployment", routeGeneration: "new", assetGeneration: "new" };

async function run(scenario, overrides = {}) {
  behavior = scenario;
  requests = [];
  const clock = makeClock();
  const snapshots = [];
  const timedFetch = async (...args) => { const response = await fetch(...args); clock.advance(7); return response; };
  const retrieveMetadata = overrides.retrieveMetadata || (async ({ attempt, record, signal }) => {
    const result = await observeRequest({ fetchImpl: timedFetch, url: `${origin}/metadata?attempt=${attempt}`, init: { headers: { authorization: ["Bearer", ephemeralCredential].join(" "), cookie: ["session", ephemeralCredential].join("=") } }, attempt, resourceKind: "alias-metadata", clock, record, deadlineSignal: signal });
    const payload = JSON.parse(result.body.toString("utf8"));
    return payload;
  });
  const evidence = await verifyAliasParity({
    aliasUrl: origin,
    runId: "ruip6a_localtest",
    expected,
    retrieveMetadata,
    persist: async value => snapshots.push(structuredClone(value)),
    fetchImpl: timedFetch,
    clock,
    policy: overrides.policy || ALIAS_PARITY_POLICY,
    deadlineSignal: () => new AbortController().signal,
  });
  return { evidence, snapshots, requests };
}

test("old metadata and content converge to the intended deployment", async () => {
  const { evidence } = await run(attempt => attempt < 3 ? { metadata: "rollback", routeGeneration: "old", assetGeneration: "old" } : defaultState);
  assert.equal(evidence.passed, true);
  assert.equal(evidence.attempts.length, 3);
  assert.deepEqual(evidence.attempts.map(row => row.result.completeParity), [false, false, true]);
});

test("new metadata with old content never passes", async () => {
  const { evidence } = await run(() => ({ metadata: "candidate-deployment", routeGeneration: "old", assetGeneration: "old" }));
  assert.equal(evidence.passed, false);
  assert.equal(evidence.rollbackRequired, true);
  assert.ok(evidence.attempts.every(row => row.result.metadataConverged && !row.result.contentConverged));
});

test("old metadata with new content never passes", async () => {
  const { evidence } = await run(() => ({ metadata: "rollback", routeGeneration: "new", assetGeneration: "new" }));
  assert.equal(evidence.passed, false);
  assert.ok(evidence.attempts.every(row => !row.result.metadataConverged && row.result.contentConverged));
});

test("mixed route and asset generations remain a hard mismatch", async () => {
  const { evidence } = await run((_attempt, pathname) => ({ ...defaultState, routeGeneration: pathname === "/dashboard" ? "old" : "new", assetGeneration: pathname === "/app.css" ? "old" : "new" }));
  assert.equal(evidence.passed, false);
  assert.equal(evidence.rollbackRequired, true);
});

test("one incorrect critical asset prevents parity", async () => {
  const { evidence } = await run((_attempt, pathname) => ({ ...defaultState, assetGeneration: pathname === "/app.js" ? "old" : "new" }));
  assert.equal(evidence.passed, false);
  assert.ok(evidence.attempts.every(row => !row.result.contentConverged));
});

test("transient 404 and 5xx observations are retained before convergence", async () => {
  const { evidence } = await run((attempt, pathname) => ({ ...defaultState, status: attempt === 1 && pathname === "/login" ? 404 : attempt === 2 && pathname === "/app.js" ? 503 : 200 }));
  assert.equal(evidence.passed, true);
  assert.equal(evidence.attempts.length, 3);
  assert.equal(evidence.attempts[0].routes.find(row => row.route === "/login").observation.status, 404);
  assert.equal(evidence.attempts[1].criticalAssets.find(row => row.asset === "/app.js").observation.status, 503);
});

test("a redirect with candidate bytes fails final-URL parity", async () => {
  const { evidence } = await run((_attempt, pathname) => ({ ...defaultState, redirect: pathname === "/login" ? "/redirected" : null }));
  assert.equal(evidence.passed, false);
  assert.ok(evidence.attempts.every(row => row.routes.find(route => route.route === "/login").finalUrlMatched === false));
});

test("the final permitted attempt starts at +45 seconds and may pass", async () => {
  const { evidence } = await run(attempt => attempt === 10 ? defaultState : { metadata: "rollback", routeGeneration: "old", assetGeneration: "old" });
  assert.equal(evidence.passed, true);
  assert.equal(evidence.attempts.length, ALIAS_PARITY_POLICY.maximumAttempts);
  const start = Date.parse(evidence.startedAt), finalStart = Date.parse(evidence.attempts.at(-1).startedAt);
  assert.equal(finalStart - start, 45_000);
  assert.ok(Date.parse(evidence.completedAt) - start < 50_000);
});

test("content completing after the 50-second deadline cannot pass", async () => {
  behavior = () => defaultState;
  requests = [];
  const clock = makeClock();
  const slowFetch = async (...args) => { const response = await fetch(...args); clock.advance(50_001); return response; };
  const evidence = await verifyAliasParity({
    aliasUrl: origin,
    runId: "ruip6a_localtest",
    expected,
    retrieveMetadata: async () => ({ deploymentIdentifier: "candidate-deployment" }),
    persist: async () => {},
    fetchImpl: slowFetch,
    clock,
    deadlineSignal: () => new AbortController().signal,
  });
  assert.equal(evidence.passed, false);
  assert.equal(evidence.rollbackRequired, true);
  assert.equal(evidence.attempts.length, 1);
  assert.equal(evidence.attempts[0].result.withinObservationWindow, false);
});

test("persistent mismatch exhausts the bound and requires rollback without promotion", async () => {
  const { evidence, requests: seen } = await run(() => ({ metadata: "rollback", routeGeneration: "old", assetGeneration: "old" }));
  assert.equal(evidence.passed, false);
  assert.equal(evidence.rollbackRequired, true);
  assert.equal(evidence.attempts.length, 10);
  assert.equal(seen.some(row => /promote/i.test(row.pathname)), false);
});

test("network errors and thrown metadata parsing errors survive in evidence", async () => {
  let call = 0;
  const retrieveMetadata = async ({ attempt, record, signal }) => {
    call += 1;
    if (call === 1) {
      await observeRequest({ url: `http://127.0.0.1:1/metadata?token=${ephemeralCredential}`, attempt, resourceKind: "alias-metadata", clock: { now: () => Date.parse("2026-09-24T12:00:00Z") }, record, deadlineSignal: signal });
    }
    throw new Error(`metadata token=${ephemeralCredential} could not be parsed`);
  };
  const { evidence, snapshots } = await run(() => defaultState, { retrieveMetadata });
  assert.equal(evidence.passed, false);
  assert.ok(evidence.attempts[0].observations[0].error);
  assert.equal(JSON.stringify(snapshots).includes(ephemeralCredential), false);
  assert.ok(evidence.attempts.every(row => row.errors.some(error => error.stage === "metadata")));
});

test("timing, hashes, byte lengths, cache headers, and cache busting are complete and sanitized", async () => {
  const { evidence } = await run(() => defaultState);
  const observations = evidence.attempts[0].observations;
  assert.equal(evidence.passed, true);
  assert.equal(observations.length, 5);
  for (const row of observations) {
    assert.ok(row.startedAt && row.endedAt);
    assert.equal(row.elapsedMs, 7);
    assert.ok(row.requestedUrl && row.finalUrl);
    assert.equal(row.status, 200);
    assert.match(row.responseSha256, /^[a-f0-9]{64}$/);
    assert.ok(row.byteLength > 0);
    assert.ok(row.headers["cache-control"]);
    assert.ok(row.headers.age);
    assert.ok(row.headers.etag);
    assert.ok(row.headers.date);
    assert.equal(row.headers.server, "local-parity-test");
    assert.equal(row.headers["x-cache"], "MISS");
    assert.equal("set-cookie" in row.headers, false);
  }
  assert.equal(JSON.stringify(evidence).includes(ephemeralCredential), false);
  assert.equal(evidence.attempts[0].metadata.deploymentIdentifier, "candidate-deployment");
  assert.ok(evidence.attempts[0].metadata.updatedAt);
  assert.ok(evidence.attempts[0].metadata.retrievedAt);
});

test("omitted asset references and exact-hash changes cannot pass", async () => {
  const withoutCss = Buffer.from('<!doctype html><html><body><script src="/app.js"></script></body></html>');
  behavior = () => defaultState;
  requests = [];
  const altered = { ...expected, routes: expected.routes.map(row => ({ ...row, sha256: hash(withoutCss) })) };
  const clock = makeClock();
  const fetchImpl = async input => {
    const url = new URL(input);
    if (url.pathname === "/login" || url.pathname === "/dashboard") return new Response(withoutCss, { status: 200, headers: { "content-type": "text/html" } });
    return fetch(input);
  };
  const evidence = await verifyAliasParity({ aliasUrl: origin, runId: "ruip6a_localtest", expected: altered, retrieveMetadata: async () => ({ deploymentIdentifier: "candidate-deployment" }), persist: async () => {}, fetchImpl, clock, deadlineSignal: () => new AbortController().signal });
  assert.equal(evidence.passed, false);
  assert.ok(evidence.attempts.every(row => row.routes.every(route => route.expectedAssetsReferenced === false)));
});

test("credential-shaped URLs and errors are redacted", () => {
  const sanitized = sanitizePersistentUrl("https://example.invalid/path?token=abc&safe=value&next=ok");
  assert.equal(sanitized.includes("abc"), false);
  assert.match(sanitized, /%5BREDACTED%5D/);
  assert.equal(sanitizeError(new Error("Bearer abc.def token=secret-value")).includes("abc.def"), false);
  assert.equal(sanitizeError(new Error("Bearer abc.def token=secret-value")).includes("secret-value"), false);
});

test("the diagnostic policy is the reviewed 600-second configuration", () => {
  assert.deepEqual(ALIAS_PARITY_DIAGNOSTIC_POLICY, {
    name: "diagnostic-10-minute",
    maximumAttempts: 60,
    pollingIntervalMs: 10_000,
    maximumObservationMs: 600_000,
    requiredCompleteObservations: 3,
    stabilitySpacingMs: 30_000,
  });
});

test("diagnostic convergence requires three complete observations thirty seconds apart", async () => {
  const { evidence } = await run(
    attempt => attempt < 3 ? { metadata: "rollback", routeGeneration: "old", assetGeneration: "old" } : defaultState,
    { policy: ALIAS_PARITY_DIAGNOSTIC_POLICY },
  );
  assert.equal(evidence.classification, "PASS");
  assert.equal(evidence.reason, "STABLE_COMPLETE_PARITY");
  assert.deepEqual(evidence.stability.selectedAttempts.map(row => row.number), [3, 6, 9]);
  assert.equal(evidence.attempts.length, 9);
  assert.ok(evidence.attempts.slice(2).every(row => row.result.completeParity));
});

test("persistent diagnostic mismatch uses all sixty scheduled starts and fails closed", async () => {
  const { evidence } = await run(
    () => ({ metadata: "candidate-deployment", routeGeneration: "old", assetGeneration: "old" }),
    { policy: ALIAS_PARITY_DIAGNOSTIC_POLICY },
  );
  assert.equal(evidence.classification, "FAIL");
  assert.equal(evidence.reason, "COMPLETE_PARITY_NOT_OBSERVED");
  assert.equal(evidence.rollbackRequired, true);
  assert.equal(evidence.attempts.length, 60);
  const start = Date.parse(evidence.startedAt);
  assert.equal(Date.parse(evidence.attempts.at(-1).startedAt) - start, 590_000);
  assert.ok(evidence.attempts.every(row => Date.parse(row.startedAt) - start < 600_000));
});

test("the latest feasible initial diagnostic success may stabilize at +590 seconds", async () => {
  const { evidence } = await run(
    attempt => attempt < 54 ? { metadata: "rollback", routeGeneration: "old", assetGeneration: "old" } : defaultState,
    { policy: ALIAS_PARITY_DIAGNOSTIC_POLICY },
  );
  assert.equal(evidence.classification, "PASS");
  assert.deepEqual(evidence.stability.selectedAttempts.map(row => row.number), [54, 57, 60]);
  assert.ok(Date.parse(evidence.completedAt) <= Date.parse(evidence.deadlineAt));
});

test("first convergence at +540 seconds is inconclusive and requires rollback", async () => {
  const { evidence } = await run(
    attempt => attempt < 55 ? { metadata: "rollback", routeGeneration: "old", assetGeneration: "old" } : defaultState,
    { policy: ALIAS_PARITY_DIAGNOSTIC_POLICY },
  );
  assert.equal(evidence.classification, "INCONCLUSIVE");
  assert.equal(evidence.reason, "FIRST_COMPLETE_PARITY_TOO_LATE_FOR_STABILITY");
  assert.equal(evidence.rollbackRequired, true);
  assert.equal(evidence.attempts.length, 55);
});

test("metadata drift after initial diagnostic success is an immediate stability failure", async () => {
  const { evidence } = await run(
    attempt => attempt === 1 ? defaultState : { metadata: "rollback", routeGeneration: "new", assetGeneration: "new" },
    { policy: ALIAS_PARITY_DIAGNOSTIC_POLICY },
  );
  assert.equal(evidence.classification, "FAIL");
  assert.equal(evidence.reason, "PARITY_REGRESSED_DURING_STABILITY");
  assert.equal(evidence.attempts.length, 2);
  assert.equal(evidence.attempts[1].result.metadataConverged, false);
});

test("an HTTP failure after initial diagnostic success fails stability", async () => {
  const { evidence } = await run(
    (attempt, pathname) => ({ ...defaultState, status: attempt === 2 && pathname === "/app.js" ? 503 : 200 }),
    { policy: ALIAS_PARITY_DIAGNOSTIC_POLICY },
  );
  assert.equal(evidence.classification, "FAIL");
  assert.equal(evidence.reason, "PARITY_REGRESSED_DURING_STABILITY");
  assert.equal(evidence.attempts[1].criticalAssets.find(row => row.asset === "/app.js").observation.status, 503);
});

test("a diagnostic request completing after the deadline cannot pass", async () => {
  behavior = () => defaultState;
  requests = [];
  const clock = makeClock();
  let fetches = 0;
  const slowAfterInitialFetch = async (...args) => {
    const response = await fetch(...args);
    fetches += 1;
    clock.advance(fetches <= 5 ? 7 : 600_001);
    return response;
  };
  const evidence = await verifyAliasParity({
    aliasUrl: origin,
    runId: "ruip6a_localtest",
    expected,
    retrieveMetadata: async () => ({ deploymentIdentifier: "candidate-deployment" }),
    persist: async () => {},
    fetchImpl: slowAfterInitialFetch,
    clock,
    policy: ALIAS_PARITY_DIAGNOSTIC_POLICY,
    deadlineSignal: () => new AbortController().signal,
  });
  assert.equal(evidence.classification, "FAIL");
  assert.equal(evidence.reason, "PARITY_REGRESSED_DURING_STABILITY");
  assert.equal(evidence.rollbackRequired, true);
  assert.equal(evidence.attempts.at(-1).result.withinObservationWindow, false);
});

test("diagnostic observation persistence errors abort before a comparison can pass", async () => {
  behavior = () => defaultState;
  requests = [];
  const clock = makeClock();
  let persistedObservation = false;
  let lastPersisted = null;
  await assert.rejects(
    verifyAliasParity({
      aliasUrl: origin,
      runId: "ruip6a_localtest",
      expected,
      retrieveMetadata: async () => ({ deploymentIdentifier: "candidate-deployment" }),
      persist: async value => {
        lastPersisted = structuredClone(value);
        if (value.attempts?.[0]?.observations?.length) {
          persistedObservation = true;
          throw new Error("local persistence unavailable");
        }
      },
      fetchImpl: fetch,
      clock,
      policy: ALIAS_PARITY_DIAGNOSTIC_POLICY,
      deadlineSignal: () => new AbortController().signal,
    }),
    /local persistence unavailable/,
  );
  assert.equal(persistedObservation, true);
  assert.equal(lastPersisted.rollbackRequired, true);
});

test("unreviewed alias timing policies remain prohibited", async () => {
  await assert.rejects(
    verifyAliasParity({
      aliasUrl: origin,
      runId: "ruip6a_localtest",
      expected,
      retrieveMetadata: async () => ({ deploymentIdentifier: "candidate-deployment" }),
      persist: async () => {},
      policy: { ...ALIAS_PARITY_DIAGNOSTIC_POLICY, maximumObservationMs: 600_001 },
    }),
    /reviewed alias stabilization policy/,
  );
});
