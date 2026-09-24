import crypto from "node:crypto";

export const ALIAS_PARITY_POLICY = Object.freeze({
  maximumAttempts: 10,
  pollingIntervalMs: 5_000,
  maximumObservationMs: 50_000,
});

export const ALIAS_PARITY_DIAGNOSTIC_POLICY = Object.freeze({
  name: "diagnostic-10-minute",
  maximumAttempts: 60,
  pollingIntervalMs: 10_000,
  maximumObservationMs: 600_000,
  requiredCompleteObservations: 3,
  stabilitySpacingMs: 30_000,
});

const SAFE_RESPONSE_HEADERS = Object.freeze([
  "cache-control", "age", "etag", "date", "last-modified", "server", "via",
  "cf-ray", "x-served-by", "x-cache", "x-cache-hits", "x-timer", "x-request-id",
  "x-amz-cf-id", "x-amz-cf-pop", "fly-request-id",
]);
const CREDENTIAL_KEY = /(?:authorization|token|secret|password|passwd|cookie|session|credential|api[-_]?key)/i;
const REDACT_VALUE = /(?:bearer\s+)[a-z0-9._~+/=-]+|(?:token|secret|password|cookie|session|credential|api[-_]?key)\s*[:=]\s*[^\s,;]+/gi;

const sha256 = value => crypto.createHash("sha256").update(value).digest("hex");
const iso = milliseconds => new Date(milliseconds).toISOString();

export function sanitizePersistentUrl(value) {
  const url = new URL(value);
  for (const key of [...url.searchParams.keys()]) if (CREDENTIAL_KEY.test(key)) url.searchParams.set(key, "[REDACTED]");
  url.username = "";
  url.password = "";
  return url.toString();
}

export function sanitizeError(error) {
  const raw = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  return raw.replace(REDACT_VALUE, match => match.split(/[:=\s]/, 1)[0] + " [REDACTED]").slice(0, 1_000);
}

function safeHeaders(headers) {
  return Object.fromEntries(SAFE_RESPONSE_HEADERS.flatMap(name => {
    const value = headers.get(name);
    return value === null ? [] : [[name, value]];
  }));
}

function cacheBustedUrl(base, { runId, attempt, resourceKind }) {
  const url = new URL(base);
  url.searchParams.set("__parity_run", runId);
  url.searchParams.set("__parity_attempt", String(attempt));
  url.searchParams.set("__parity_resource", resourceKind);
  return url;
}

export async function observeRequest({
  fetchImpl = fetch,
  url,
  init = {},
  attempt,
  resourceKind,
  cacheBust = null,
  clock,
  record,
  deadlineSignal,
}) {
  const requested = cacheBust ? cacheBustedUrl(url, cacheBust) : new URL(url);
  const startedMs = clock.now();
  const base = {
    attempt,
    resourceKind,
    startedAt: iso(startedMs),
    requestedUrl: sanitizePersistentUrl(requested),
    cacheBust: cacheBust ? { runId: cacheBust.runId, attempt, resourceKind } : null,
  };
  try {
    const response = await fetchImpl(requested, { ...init, redirect: "follow", signal: deadlineSignal });
    const body = Buffer.from(await response.arrayBuffer());
    const endedMs = clock.now();
    const observation = {
      ...base,
      endedAt: iso(endedMs),
      elapsedMs: Math.max(0, endedMs - startedMs),
      finalUrl: sanitizePersistentUrl(response.url || requested),
      status: response.status,
      responseSha256: sha256(body),
      byteLength: body.length,
      headers: safeHeaders(response.headers),
      error: null,
    };
    await record(observation);
    return { response, body, observation };
  } catch (error) {
    const endedMs = clock.now();
    const observation = {
      ...base,
      endedAt: iso(endedMs),
      elapsedMs: Math.max(0, endedMs - startedMs),
      finalUrl: null,
      status: null,
      responseSha256: null,
      byteLength: null,
      headers: {},
      error: sanitizeError(error),
    };
    await record(observation);
    throw error;
  }
}

function expectedReference(expected) {
  if (!expected?.deploymentIdentifier || !Array.isArray(expected.routes) || !Array.isArray(expected.criticalAssets)) throw new Error("A fixed immutable parity reference is required.");
  const routes = expected.routes.map(row => ({ route: row.route, sha256: row.sha256 }));
  const assets = [...new Map(expected.criticalAssets.map(row => [row.asset, { asset: row.asset, sha256: row.sha256 }])).values()];
  if (!routes.length || !assets.length || routes.some(row => !row.route || !row.sha256) || assets.some(row => !row.asset || !row.sha256)) throw new Error("The immutable parity reference is incomplete.");
  return { deploymentIdentifier: expected.deploymentIdentifier, routes, criticalAssets: assets };
}

function referencedAssets(body) {
  return new Set([...body.toString("utf8").matchAll(/(?:src|href)=["']([^"']+\.(?:js|css))(?:\?[^"']*)?["']/g)].map(match => new URL(match[1], "https://parity.invalid").pathname));
}

function sameRequestedAndFinal(observation) {
  if (!observation.finalUrl) return false;
  const requested = new URL(observation.requestedUrl), final = new URL(observation.finalUrl);
  return requested.origin === final.origin && requested.pathname === final.pathname && requested.search === final.search;
}

function attemptResult(attempt, expected) {
  const metadataConverged = attempt.metadata?.deploymentIdentifier === expected.deploymentIdentifier;
  const routeByName = new Map(attempt.routes.map(row => [row.route, row]));
  const assetByName = new Map(attempt.criticalAssets.map(row => [row.asset, row]));
  const routesComplete = expected.routes.every(reference => {
    const row = routeByName.get(reference.route);
    return row?.observation.status === 200 && row.observation.responseSha256 === reference.sha256 && row.finalUrlMatched && row.expectedAssetsReferenced;
  });
  const assetsComplete = expected.criticalAssets.every(reference => {
    const row = assetByName.get(reference.asset);
    return row?.observation.status === 200 && row.observation.responseSha256 === reference.sha256 && row.finalUrlMatched;
  });
  const contentConverged = routesComplete && assetsComplete && attempt.routes.length === expected.routes.length && attempt.criticalAssets.length === expected.criticalAssets.length;
  return { metadataConverged, contentConverged, completeParity: metadataConverged && contentConverged };
}

function samePolicy(actual, expected) {
  return Object.entries(expected).every(([key, value]) => actual?.[key] === value)
    && Object.keys(actual || {}).length === Object.keys(expected).length;
}

function policyMode(policy) {
  if (samePolicy(policy, ALIAS_PARITY_POLICY)) return "legacy";
  if (samePolicy(policy, ALIAS_PARITY_DIAGNOSTIC_POLICY)) return "diagnostic";
  throw new Error("A reviewed alias stabilization policy is required.");
}

function diagnosticTiming() {
  return "attempt 1 starts immediately; attempts 2-60 target +10s increments; attempt 60 may start at +590s; no request may start at or after +600s; success requires an initial complete observation and two additional complete observations at least +30s apart";
}

export async function verifyAliasParity({
  aliasUrl,
  runId,
  expected: inputExpected,
  retrieveMetadata,
  persist,
  fetchImpl = fetch,
  clock = { now: () => Date.now(), sleep: milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds)) },
  policy = ALIAS_PARITY_POLICY,
  deadlineSignal = remainingMs => AbortSignal.timeout(Math.max(1, remainingMs)),
}) {
  const expected = expectedReference(inputExpected);
  const mode = policyMode(policy);
  const evidence = {
    schemaVersion: 1,
    runId,
    aliasUrl: sanitizePersistentUrl(aliasUrl),
    expected,
    policy: {
      ...policy,
      timing: mode === "legacy"
        ? "attempt 1 starts immediately; attempts 2-10 target +5s increments; attempt 10 may start at +45s; no request may start at or after +50s"
        : diagnosticTiming(),
    },
    startedAt: iso(clock.now()),
    attempts: [],
    passed: false,
    rollbackRequired: false,
    completedAt: null,
  };
  if (mode === "diagnostic") {
    evidence.schemaVersion = 2;
    evidence.classification = "RUNNING";
    evidence.reason = null;
    evidence.rollbackRequired = true;
    evidence.stability = {
      requiredCompleteObservations: policy.requiredCompleteObservations,
      spacingMs: policy.stabilitySpacingMs,
      initialAttempt: null,
      selectedAttempts: [],
    };
  }
  const startMs = clock.now();
  const deadlineMs = startMs + policy.maximumObservationMs;
  if (mode === "diagnostic") evidence.deadlineAt = iso(deadlineMs);
  await persist(evidence);

  const finishDiagnostic = async (classification, reason, rollbackRequired) => {
    evidence.passed = classification === "PASS";
    evidence.classification = classification;
    evidence.reason = reason;
    evidence.rollbackRequired = rollbackRequired;
    evidence.completedAt = iso(clock.now());
    await persist(evidence);
    return evidence;
  };

  for (let number = 1; number <= policy.maximumAttempts; number += 1) {
    const targetStartMs = startMs + (number - 1) * policy.pollingIntervalMs;
    const waitMs = targetStartMs - clock.now();
    if (waitMs > 0) await clock.sleep(waitMs);
    if (clock.now() >= deadlineMs) break;

    const attempt = { number, startedAt: iso(clock.now()), metadata: null, routes: [], criticalAssets: [], errors: [], result: null, completedAt: null };
    evidence.attempts.push(attempt);
    await persist(evidence);
    const record = async observation => { attempt.observations = [...(attempt.observations || []), observation]; await persist(evidence); };
    const signal = () => deadlineSignal(Math.max(1, deadlineMs - clock.now()));

    try {
      const metadata = await retrieveMetadata({ attempt: number, record, signal: signal() });
      attempt.metadata = {
        deploymentIdentifier: metadata.deploymentIdentifier || null,
        updatedAt: metadata.updatedAt || null,
        retrievedAt: iso(clock.now()),
      };
      await persist(evidence);
    } catch (error) {
      attempt.errors.push({ stage: "metadata", error: sanitizeError(error) });
      await persist(evidence);
    }

    for (const reference of expected.routes) {
      if (clock.now() >= deadlineMs) { attempt.errors.push({ stage: "deadline", error: "Observation window expired before all routes were requested." }); await persist(evidence); break; }
      try {
        const requestUrl = new URL(reference.route, aliasUrl);
        const result = await observeRequest({ fetchImpl, url: requestUrl, init: { headers: { "cache-control": "no-cache", pragma: "no-cache" } }, attempt: number, resourceKind: `route:${reference.route}`, cacheBust: { runId, attempt: number, resourceKind: "route" }, clock, record, deadlineSignal: signal() });
        const foundAssets = referencedAssets(result.body);
        attempt.routes.push({ route: reference.route, observation: result.observation, finalUrlMatched: sameRequestedAndFinal(result.observation), expectedAssetsReferenced: expected.criticalAssets.every(asset => foundAssets.has(new URL(asset.asset, aliasUrl).pathname)) });
        await persist(evidence);
      } catch (error) {
        attempt.errors.push({ stage: `route:${reference.route}`, error: sanitizeError(error) });
        await persist(evidence);
      }
    }

    for (const reference of expected.criticalAssets) {
      if (clock.now() >= deadlineMs) { attempt.errors.push({ stage: "deadline", error: "Observation window expired before all critical assets were requested." }); await persist(evidence); break; }
      try {
        const result = await observeRequest({ fetchImpl, url: new URL(reference.asset, aliasUrl), init: { headers: { "cache-control": "no-cache", pragma: "no-cache" } }, attempt: number, resourceKind: `asset:${reference.asset}`, cacheBust: { runId, attempt: number, resourceKind: "asset" }, clock, record, deadlineSignal: signal() });
        attempt.criticalAssets.push({ asset: reference.asset, observation: result.observation, finalUrlMatched: sameRequestedAndFinal(result.observation) });
        await persist(evidence);
      } catch (error) {
        attempt.errors.push({ stage: `asset:${reference.asset}`, error: sanitizeError(error) });
        await persist(evidence);
      }
    }

    attempt.result = attemptResult(attempt, expected);
    attempt.result.withinObservationWindow = clock.now() <= deadlineMs;
    attempt.result.completeParity = attempt.result.completeParity && attempt.result.withinObservationWindow;
    attempt.completedAt = iso(clock.now());
    await persist(evidence);
    if (attempt.result.completeParity) {
      if (mode === "diagnostic") {
        const attemptStartMs = Date.parse(attempt.startedAt);
        const selected = evidence.stability.selectedAttempts;
        if (!selected.length) {
          evidence.stability.initialAttempt = number;
          selected.push({ number, startedAt: attempt.startedAt, completedAt: attempt.completedAt });
          const lastRequiredStartMs = attemptStartMs + (policy.requiredCompleteObservations - 1) * policy.stabilitySpacingMs;
          await persist(evidence);
          if (lastRequiredStartMs >= deadlineMs) return finishDiagnostic("INCONCLUSIVE", "FIRST_COMPLETE_PARITY_TOO_LATE_FOR_STABILITY", true);
          continue;
        }
        const previousSelectedStartMs = Date.parse(selected.at(-1).startedAt);
        if (attemptStartMs - previousSelectedStartMs >= policy.stabilitySpacingMs) {
          selected.push({ number, startedAt: attempt.startedAt, completedAt: attempt.completedAt });
          await persist(evidence);
        }
        if (selected.length === policy.requiredCompleteObservations) return finishDiagnostic("PASS", "STABLE_COMPLETE_PARITY", false);
        continue;
      }
      evidence.passed = true;
      evidence.rollbackRequired = false;
      evidence.completedAt = iso(clock.now());
      await persist(evidence);
      return evidence;
    }
    if (mode === "diagnostic" && evidence.stability.selectedAttempts.length) {
      return finishDiagnostic("FAIL", "PARITY_REGRESSED_DURING_STABILITY", true);
    }
  }

  if (mode === "diagnostic") {
    if (evidence.stability.selectedAttempts.length) return finishDiagnostic("INCONCLUSIVE", "DEADLINE_PREVENTED_STABILITY_CONFIRMATIONS", true);
    return finishDiagnostic("FAIL", "COMPLETE_PARITY_NOT_OBSERVED", true);
  }
  evidence.passed = false;
  evidence.rollbackRequired = true;
  evidence.completedAt = iso(clock.now());
  await persist(evidence);
  return evidence;
}
