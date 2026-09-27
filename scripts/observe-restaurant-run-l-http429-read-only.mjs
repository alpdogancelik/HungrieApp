#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  CONTRACT,
  prepareAuthority,
  sha256,
  validatePreparedAuthority,
  verifyProtectedManifest,
} from "./validate-restaurant-run-l-http429-observation-authority.mjs";

const SAFE_HEADERS = new Set(["age", "cache-control", "cf-cache-status", "cf-ray", "content-length", "content-type", "date", "etag", "last-modified", "retry-after", "server", "server-timing", "via", "x-cache", "x-cache-hits", "x-request-id", "x-served-by", "x-timer"]);
const CREDENTIAL_PATTERN = /(?:bearer\s+\S+|authorization|cookie|password|secret|token|api[-_]?key|[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})/i;
const canonical = value => `${JSON.stringify(value, null, 2)}\n`;
const sleep = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

function atomicWrite(file, value) {
  const temporary = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, Buffer.isBuffer(value) ? value : canonical(value), { mode: 0o600 });
  fs.renameSync(temporary, file);
  fs.chmodSync(file, 0o600);
}

function sanitizeText(value) {
  return String(value || "")
    .replace(/Bearer\s+[^\s"']+/gi, "Bearer [REDACTED]")
    .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, "[REDACTED_JWT]")
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[REDACTED_EMAIL]")
    .replace(/\b(authorization|cookie|password|secret|token|api[-_]?key)\s*[:=]\s*[^\s,;]+/gi, "$1=[REDACTED]");
}

function sanitizeUrl(value) {
  const url = new URL(value);
  if (url.origin !== CONTRACT.origin) throw safetyError("UNEXPECTED_ORIGIN", `Unexpected observation origin: ${url.origin}.`);
  url.search = "";
  url.hash = "";
  return url.href;
}

function safeHeaders(headers = {}) {
  const entries = headers instanceof Headers ? [...headers.entries()] : Object.entries(headers);
  return Object.fromEntries(entries.map(([name, value]) => [String(name).toLowerCase(), String(value)]).filter(([name]) => SAFE_HEADERS.has(name)).map(([name, value]) => [name, sanitizeText(value).slice(0, 512)]).sort(([a], [b]) => a.localeCompare(b)));
}

function safetyError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function assertSanitized(value) {
  const serialized = JSON.stringify(value);
  if (CREDENTIAL_PATTERN.test(serialized.replace(/credentialValuesPersisted|allowAuthentication|authorizationTextSha256|authorityValidation/gi, ""))) throw safetyError("CREDENTIAL_EXPOSURE", "Credential-shaped value detected in observation evidence.");
}

function createEvidenceDirectory(repoRoot) {
  const directory = path.join(repoRoot, CONTRACT.evidenceDirectory);
  const parent = path.dirname(directory);
  fs.mkdirSync(parent, { recursive: true, mode: 0o700 });
  fs.chmodSync(parent, 0o700);
  fs.mkdirSync(directory, { recursive: false, mode: 0o700 });
  fs.chmodSync(directory, 0o700);
  return directory;
}

function writeEvidence(directory, name, value) {
  assertSanitized(value);
  atomicWrite(path.join(directory, name), value);
}

function allowedArtifactPaths(repoRoot) {
  const file = path.join(repoRoot, CONTRACT.artifactManifestPath);
  if (sha256(fs.readFileSync(file)) !== CONTRACT.artifactManifestFileSha256) throw safetyError("EVIDENCE_INTEGRITY_FAILURE", "Accepted artifact manifest file changed.");
  const manifest = JSON.parse(fs.readFileSync(file, "utf8"));
  if (manifest.artifactManifestSha256 !== CONTRACT.acceptedArtifactManifestSha256) throw safetyError("EVIDENCE_INTEGRITY_FAILURE", "Accepted artifact identity changed.");
  const paths = new Set(manifest.files.map(row => `/${row.path}`));
  for (const route of manifest.routes || []) {
    if (route === "index.html") paths.add("/");
    else if (route.endsWith(".html")) paths.add(`/${route.slice(0, -5)}`);
  }
  for (const route of ["/suspended", "/suspended/", "/favicon.ico"]) paths.add(route);
  return paths;
}

function sanitizeInitiator(initiator = {}, documentURL = null) {
  const cleanUrl = value => { try { return sanitizeUrl(value); } catch { return null; } };
  return {
    type: sanitizeText(initiator.type || "unknown").slice(0, 64),
    url: cleanUrl(initiator.url),
    documentUrl: cleanUrl(documentURL),
    stack: (initiator.stack?.callFrames || []).slice(0, 8).map(frame => ({ functionName: sanitizeText(frame.functionName).slice(0, 160), url: cleanUrl(frame.url), lineNumber: Number.isInteger(frame.lineNumber) ? frame.lineNumber : null, columnNumber: Number.isInteger(frame.columnNumber) ? frame.columnNumber : null })),
  };
}

class Cdp {
  constructor(socket) {
    this.socket = socket; this.id = 0; this.pending = new Map(); this.listeners = [];
    socket.addEventListener("message", event => {
      const message = JSON.parse(event.data);
      if (message.id) { const pending = this.pending.get(message.id); if (!pending) return; this.pending.delete(message.id); message.error ? pending.reject(new Error(message.error.message)) : pending.resolve(message.result); }
      else this.listeners.forEach(listener => listener(message));
    });
  }
  send(method, params = {}) { const id = ++this.id; this.socket.send(JSON.stringify({ id, method, params })); return new Promise((resolve, reject) => this.pending.set(id, { resolve, reject })); }
  on(listener) { this.listeners.push(listener); }
  close() { this.socket.close(); }
}

async function openChrome(chromePath, profile) {
  const child = spawn(chromePath, ["--headless=new", "--disable-gpu", "--no-first-run", "--no-default-browser-check", "--remote-debugging-port=0", `--user-data-dir=${profile}`, "about:blank"], { stdio: "ignore" });
  const active = path.join(profile, "DevToolsActivePort");
  let port, version;
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try {
      port = Number(fs.readFileSync(active, "utf8").split(/\r?\n/)[0]);
      const response = await fetch(`http://127.0.0.1:${port}/json/version`);
      if (response.ok) { version = await response.json(); break; }
    } catch {}
    await sleep(100);
  }
  if (!version) { child.kill("SIGTERM"); throw new Error("Owned Chrome DevTools endpoint unavailable."); }
  const pageResponse = await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: "PUT" });
  if (!pageResponse.ok) { child.kill("SIGTERM"); throw new Error("Owned Chrome page endpoint unavailable."); }
  const page = await pageResponse.json();
  const endpoint = new URL(page.webSocketDebuggerUrl);
  if (endpoint.hostname !== "127.0.0.1" || Number(endpoint.port) !== port || !endpoint.pathname.startsWith("/devtools/page/")) throw new Error("Chrome page endpoint ownership mismatch.");
  const socket = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.addEventListener("open", resolve, { once: true }); socket.addEventListener("error", reject, { once: true }); });
  return { child, version: version.Browser, cdp: new Cdp(socket) };
}

async function closeChrome(browser) {
  browser.cdp.close();
  if (browser.child.exitCode === null) browser.child.kill("SIGTERM");
  for (let attempt = 0; attempt < 40 && browser.child.exitCode === null; attempt += 1) await sleep(50);
  if (browser.child.exitCode === null) browser.child.kill("SIGKILL");
}

export async function collectBrowserObservations({ repoRoot, directory, chromePath = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", now = () => Date.now(), wait = sleep }) {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), "restaurant-http429-observation-"));
  const allowed = allowedArtifactPaths(repoRoot);
  const evidence = { schemaVersion: 1, observationId: CONTRACT.observationId, deploymentId: CONTRACT.deploymentId, origin: CONTRACT.origin, browser: null, startedAt: new Date(now()).toISOString(), completedAt: null, documentLoads: [], requestStarts: [], responses: [], failures: [], serviceWorker: null, credentialValuesPersisted: false };
  let browser;
  const persist = () => writeEvidence(directory, "browser-observations.json", evidence);
  try {
    browser = await openChrome(chromePath, profile); evidence.browser = browser.version; persist();
    const cdp = browser.cdp, bodyTasks = [], responseRows = new Map();
    await Promise.all([cdp.send("Page.enable"), cdp.send("Network.enable"), cdp.send("Runtime.enable"), cdp.send("Fetch.enable", { patterns: [{ urlPattern: "*", requestStage: "Request" }] })]);
    cdp.on(message => {
      if (message.method === "Fetch.requestPaused") {
        const request = message.params.request, url = new URL(request.url);
        const isHttp = ["http:", "https:"].includes(url.protocol);
        const row = { requestId: message.params.requestId, observedAt: new Date(now()).toISOString(), method: request.method, protocol: url.protocol, url: url.origin === CONTRACT.origin ? sanitizeUrl(request.url) : isHttp ? `${url.protocol}//${url.host}${url.pathname}` : null, path: isHttp ? url.pathname : null, resourceType: message.params.resourceType || null };
        evidence.requestStarts.push(row); persist();
        if (!isHttp) return cdp.send("Fetch.continueRequest", { requestId: message.params.requestId }).catch(() => {});
        if (url.origin !== CONTRACT.origin || request.method !== "GET" || !allowed.has(url.pathname) || evidence.requestStarts.filter(item => item.url?.startsWith(CONTRACT.origin)).length > CONTRACT.limits.browserSameOriginRequestStarts) {
          evidence.failures.push({ code: url.origin !== CONTRACT.origin ? "UNEXPECTED_ORIGIN" : request.method !== "GET" ? "UNAUTHORIZED_METHOD" : !allowed.has(url.pathname) ? "UNEXPECTED_RESOURCE_ACCESS" : "REQUEST_BUDGET_EXHAUSTED", observedAt: row.observedAt, path: url.pathname }); persist();
          return cdp.send("Fetch.failRequest", { requestId: message.params.requestId, errorReason: "BlockedByClient" }).catch(() => {});
        }
        cdp.send("Fetch.continueRequest", { requestId: message.params.requestId }).catch(() => {});
      }
      if (message.method === "Network.responseReceived") {
        try {
          const response = message.params.response, url = new URL(response.url);
          if (url.origin !== CONTRACT.origin) return;
          const row = { requestId: message.params.requestId, observedAt: new Date(now()).toISOString(), url: sanitizeUrl(response.url), path: url.pathname, resourceType: message.params.type || null, status: response.status, protocol: sanitizeText(response.protocol).slice(0, 32), timing: response.timing ? { requestTime: response.timing.requestTime ?? null, receiveHeadersEnd: response.timing.receiveHeadersEnd ?? null } : null, safeHeaders: safeHeaders(response.headers), cache: { fromDiskCache: Boolean(response.fromDiskCache), fromPrefetchCache: Boolean(response.fromPrefetchCache), fromServiceWorker: Boolean(response.fromServiceWorker) }, remoteEndpoint: response.remoteIPAddress ? { address: sanitizeText(response.remoteIPAddress).slice(0, 128), port: Number.isInteger(response.remotePort) ? response.remotePort : null } : null, errorBody: null };
          evidence.responses.push(row); responseRows.set(message.params.requestId, row); persist();
        } catch (error) { evidence.failures.push({ code: "RESPONSE_SANITIZATION_FAILED", observedAt: new Date(now()).toISOString(), error: sanitizeText(error.message) }); persist(); }
      }
      if (message.method === "Network.requestWillBeSent") {
        const last = evidence.requestStarts.findLast(row => row.path === (() => { try { return new URL(message.params.request.url).pathname; } catch { return null; } })());
        if (last) last.initiator = sanitizeInitiator(message.params.initiator, message.params.documentURL);
        persist();
      }
      if (message.method === "Network.loadingFinished") {
        const row = responseRows.get(message.params.requestId);
        if (row?.status >= 400) {
          bodyTasks.push(cdp.send("Network.getResponseBody", { requestId: message.params.requestId }).then(result => {
            const bytes = Buffer.from(result.body || "", result.base64Encoded ? "base64" : "utf8");
            row.errorBody = { byteLength: bytes.length, sha256: sha256(bytes), withinLimit: bytes.length <= 65536, contentPersisted: false }; persist();
          }).catch(error => { row.errorBody = { byteLength: Number.isFinite(message.params.encodedDataLength) ? message.params.encodedDataLength : null, sha256: null, withinLimit: false, contentPersisted: false, error: sanitizeText(error.message) }; persist(); }));
        }
      }
    });
    const navigate = async (kind, ignoreCache) => {
      const row = { kind, startedAt: new Date(now()).toISOString(), completedAt: null };
      evidence.documentLoads.push(row); persist();
      if (ignoreCache) await cdp.send("Network.setCacheDisabled", { cacheDisabled: true });
      await cdp.send("Page.navigate", { url: `${CONTRACT.origin}/suspended` });
      await wait(5000);
      row.completedAt = new Date(now()).toISOString(); persist();
    };
    await navigate("INITIAL", false);
    await navigate("CACHE_BYPASS_RESTORATION", true);
    await Promise.allSettled(bodyTasks);
    evidence.serviceWorker = await cdp.send("Runtime.evaluate", { expression: `(async()=>{if(!('serviceWorker' in navigator))return {supported:false,controller:false,registrations:[]};const registrations=await navigator.serviceWorker.getRegistrations();return {supported:true,controller:Boolean(navigator.serviceWorker.controller),registrations:registrations.map(value=>({scope:value.scope,active:value.active?.state||null}))}})()`, awaitPromise: true, returnByValue: true }).then(result => result.result.value).catch(error => ({ error: sanitizeText(error.message) }));
    evidence.completedAt = new Date(now()).toISOString(); persist();
    return evidence;
  } finally {
    if (browser) await closeChrome(browser);
    fs.rmSync(profile, { recursive: true, force: true });
  }
}

export async function collectDirectGetObservations({ directory, fetchImpl = fetch, now = () => Date.now() }) {
  const evidence = { schemaVersion: 1, observationId: CONTRACT.observationId, deploymentId: CONTRACT.deploymentId, startedAt: new Date(now()).toISOString(), completedAt: null, boundedConcurrency: 1, retries: 0, observations: [], credentialValuesPersisted: false };
  const persist = () => writeEvidence(directory, "direct-get-observations.json", evidence);
  persist();
  for (const resource of CONTRACT.resources) {
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 10000);
    const startedAt = new Date(now()).toISOString();
    try {
      const response = await fetchImpl(`${CONTRACT.origin}${resource.path}`, { method: "GET", redirect: "manual", credentials: "omit", signal: controller.signal, headers: { accept: "*/*" } });
      const bytes = Buffer.from(await response.arrayBuffer());
      const final = new URL(response.url || `${CONTRACT.origin}${resource.path}`);
      if (final.origin !== CONTRACT.origin || final.pathname !== resource.path) throw safetyError("UNEXPECTED_RESOURCE_ACCESS", "Direct GET final URL differs from the fixed resource.");
      evidence.observations.push({ requestId: `direct-${evidence.observations.length + 1}`, startedAt, completedAt: new Date(now()).toISOString(), method: "GET", requestedUrl: `${CONTRACT.origin}${resource.path}`, finalUrl: final.href, path: resource.path, status: response.status, safeHeaders: safeHeaders(response.headers), byteLength: bytes.length, sha256: sha256(bytes), contentPersisted: false, expected: resource, exactContentParity: response.status === 200 && bytes.length === resource.bytes && sha256(bytes) === resource.sha256 });
      persist();
    } catch (error) {
      evidence.observations.push({ requestId: `direct-${evidence.observations.length + 1}`, startedAt, completedAt: new Date(now()).toISOString(), method: "GET", requestedUrl: `${CONTRACT.origin}${resource.path}`, finalUrl: null, path: resource.path, status: null, error: sanitizeText(error.message), contentPersisted: false, expected: resource, exactContentParity: false }); persist();
      throw error;
    } finally { clearTimeout(timer); }
  }
  evidence.completedAt = new Date(now()).toISOString(); persist();
  return evidence;
}

export function classifyObservation(browser, direct) {
  const failures = [...(browser.failures || [])];
  const observations = [...(browser.responses || []), ...(direct.observations || [])];
  if (browser.documentLoads?.length !== CONTRACT.limits.documentLoads || browser.requestStarts.filter(row => row.url?.startsWith(CONTRACT.origin)).length > CONTRACT.limits.browserSameOriginRequestStarts || direct.observations?.length !== CONTRACT.limits.directGetRequests) failures.push({ code: "INCOMPLETE_OR_OVER_BUDGET_OBSERVATION" });
  const http429 = observations.filter(row => row.status === 429);
  const ambiguous = http429.filter(row => !["server", "cf-ray", "via", "x-cache", "x-request-id", "x-served-by"].some(name => row.safeHeaders?.[name]));
  const directInvalid = direct.observations.filter(row => (row.status !== 200 && row.status !== 429) || (row.status === 200 && row.exactContentParity !== true));
  if (failures.length || directInvalid.length) return { classification: "FAIL", passed: false, reason: failures[0]?.code || "DIRECT_GET_HTTP_FAILURE", http429: http429.length, ambiguous: ambiguous.length };
  if (!http429.length || ambiguous.length) return { classification: "INCONCLUSIVE", passed: false, reason: !http429.length ? "NO_RATE_LIMIT_OBSERVED" : "RATE_LIMIT_LAYER_UNATTRIBUTABLE", http429: http429.length, ambiguous: ambiguous.length };
  return { classification: "PASS", passed: true, reason: "RATE_LIMIT_LAYER_METADATA_CAPTURED", http429: http429.length, ambiguous: 0 };
}

function evidenceManifest(directory) {
  const files = fs.readdirSync(directory).filter(name => name !== "evidence-manifest.tsv").sort();
  return Buffer.from(files.map(name => { const file = path.join(directory, name), content = fs.readFileSync(file); return `${sha256(content)}\t${content.length}\t${name}\n`; }).join(""));
}

export async function executeObservation({ repoRoot, authorityPath, sourceManifestPath, confirm, now = () => Date.now(), browserCollector = collectBrowserObservations, directCollector = collectDirectGetObservations, authorityValidator = validatePreparedAuthority, protectedVerifier = verifyProtectedManifest }) {
  const validated = authorityValidator({ repoRoot, authorityPath, sourceManifestPath, now: now() });
  if (confirm !== `OBSERVE_HTTP429_READ_ONLY_${CONTRACT.observationId}`) throw new Error("Action-specific confirmation mismatch.");
  const directory = createEvidenceDirectory(repoRoot);
  const started = now();
  writeEvidence(directory, "authority-validation.json", { schemaVersion: 1, observationId: CONTRACT.observationId, validatedAt: new Date(started).toISOString(), authoritySha256: sha256(fs.readFileSync(authorityPath)), sourceManifestSha256: validated.approval.sourceManifestSha256, sourceCommit: validated.approval.sourceCommit, deploymentId: CONTRACT.deploymentId, origin: CONTRACT.origin, limits: CONTRACT.limits, credentialValuesPersisted: false });
  writeEvidence(directory, "progress.json", { schemaVersion: 1, state: "STARTED", observationId: CONTRACT.observationId, startedAt: new Date(started).toISOString(), browserComplete: false, directComplete: false });
  let terminal;
  try {
    writeEvidence(directory, "browser-observations.json", { schemaVersion: 1, observationId: CONTRACT.observationId, deploymentId: CONTRACT.deploymentId, origin: CONTRACT.origin, state: "INITIALIZING", requestStarts: [], responses: [], failures: [], credentialValuesPersisted: false });
    const browser = await browserCollector({ repoRoot, directory, now });
    assertSanitized(browser);
    if (now() - started >= CONTRACT.limits.observationDurationMs) throw safetyError("OBSERVATION_DURATION_EXHAUSTED", "Observation duration exhausted before direct GETs.");
    writeEvidence(directory, "progress.json", { schemaVersion: 1, state: "BROWSER_COMPLETE", observationId: CONTRACT.observationId, startedAt: new Date(started).toISOString(), browserComplete: true, directComplete: false });
    writeEvidence(directory, "direct-get-observations.json", { schemaVersion: 1, observationId: CONTRACT.observationId, deploymentId: CONTRACT.deploymentId, state: "INITIALIZING", observations: [], credentialValuesPersisted: false });
    const direct = await directCollector({ directory, now });
    assertSanitized(direct);
    if (now() - started > CONTRACT.limits.observationDurationMs) throw safetyError("OBSERVATION_DURATION_EXHAUSTED", "Observation duration exceeded.");
    const decision = classifyObservation(browser, direct);
    terminal = { schemaVersion: 1, observationId: CONTRACT.observationId, deploymentId: CONTRACT.deploymentId, completedAt: new Date(now()).toISOString(), ...decision, promotionEligible: false, deploymentEligible: false, mutationPerformed: false, credentialValuesPersisted: false };
  } catch (error) {
    terminal = { schemaVersion: 1, observationId: CONTRACT.observationId, deploymentId: CONTRACT.deploymentId, completedAt: new Date(now()).toISOString(), classification: error.code?.startsWith("UNEXPECTED") || error.code === "CREDENTIAL_EXPOSURE" || error.code === "EVIDENCE_INTEGRITY_FAILURE" ? "FAIL" : "ABORTED", passed: false, reason: error.code || "OPERATOR_EXCEPTION", error: sanitizeText(error.message), promotionEligible: false, deploymentEligible: false, mutationPerformed: false, credentialValuesPersisted: false };
  }
  writeEvidence(directory, "terminal-result.json", terminal);
  const manifest = evidenceManifest(directory); atomicWrite(path.join(directory, "evidence-manifest.tsv"), manifest);
  protectedVerifier(repoRoot);
  return terminal;
}

function options(argv) {
  const [action, ...rest] = argv;
  return { action, values: Object.fromEntries(rest.filter(item => item.startsWith("--") && item.includes("=")).map(item => { const index = item.indexOf("="); return [item.slice(2, index), item.slice(index + 1)]; })) };
}

export async function run(argv = process.argv.slice(2)) {
  const { action, values } = options(argv), repoRoot = path.resolve(import.meta.dirname, "..");
  if (action === "prepare-authority") {
    if (values.confirm !== `PREPARE_HTTP429_READ_ONLY_OBSERVATION_${CONTRACT.observationId}` || !values["approval-json"]) throw new Error("Approval JSON and action-specific confirmation are required.");
    const approval = JSON.parse(fs.readFileSync(path.resolve(values["approval-json"]), "utf8"));
    return prepareAuthority({ repoRoot, approval, outputDirectory: path.join(repoRoot, CONTRACT.authorityDirectory) });
  }
  if (action === "observe") {
    if (!values.authority || !values["source-manifest"] || !values.confirm) throw new Error("Authority, source manifest, and confirmation are required.");
    return executeObservation({ repoRoot, authorityPath: path.resolve(values.authority), sourceManifestPath: path.resolve(values["source-manifest"]), confirm: values.confirm });
  }
  throw new Error("Expected prepare-authority or observe action.");
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) run().then(value => process.stdout.write(`${JSON.stringify(value)}\n`)).catch(error => { process.stderr.write(`${sanitizeText(error.message)}\n`); process.exitCode = 1; });
