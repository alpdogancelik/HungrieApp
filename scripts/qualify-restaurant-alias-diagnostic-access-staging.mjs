#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn, spawnSync } from "node:child_process";
import { DIAGNOSTIC_OPERATOR, REJECTED_DEPLOYMENTS, validateAuthority } from "./deploy-restaurant-alias-10-minute-diagnostic-staging.mjs";

const sha256 = value => crypto.createHash("sha256").update(value).digest("hex");
const delay = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
const canonical = value => `${JSON.stringify(value, null, 2)}\n`;

function parseOptions(argv) {
  return Object.fromEntries(argv.filter(value => value.startsWith("--") && value.includes("=")).map(value => {
    const index = value.indexOf("="); return [value.slice(2, index), value.slice(index + 1)];
  }));
}

function atomicWrite(file, value) {
  const temporary = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, canonical(value), { mode: 0o600 });
  fs.renameSync(temporary, file);
  fs.chmodSync(file, 0o600);
}

export function sanitizeRequest(request, { initiator = null, documentURL = null } = {}) {
  const url = new URL(request.url);
  const headerNames = Object.keys(request.headers || {}).map(value => value.toLowerCase()).sort();
  return {
    method: request.method,
    protocol: url.protocol,
    origin: url.origin,
    host: url.host,
    path: url.pathname,
    queryParameterNames: [...url.searchParams.keys()].sort(),
    headerNames,
    credentialHeaderNames: headerNames.filter(value => /authorization|cookie|token|api[-_]?key/i.test(value)),
    initiator: sanitizeInitiator(initiator, documentURL),
  };
}

const SAFE_RESPONSE_HEADERS = new Set([
  "age", "cache-control", "cf-cache-status", "cf-ray", "content-length", "content-type",
  "content-security-policy", "content-security-policy-report-only",
  "date", "etag", "last-modified", "retry-after", "server", "server-timing", "via",
  "x-cache", "x-cache-hits", "x-request-id", "x-served-by", "x-timer",
]);
const ERROR_BODY_LIMIT = 64 * 1024;

export function sanitizeResponseHeaders(headers = {}) {
  return Object.fromEntries(Object.entries(headers)
    .map(([name, value]) => [String(name).toLowerCase(), value])
    .filter(([name]) => SAFE_RESPONSE_HEADERS.has(name))
    .map(([name, value]) => [name, sanitizeDiagnosticText(String(value)).slice(0, 512)])
    .sort(([left], [right]) => left.localeCompare(right)));
}

export function sanitizeInitiator(initiator, documentURL) {
  const frames = (initiator?.stack?.callFrames || []).slice(0, 8).map(frame => ({
    functionName: sanitizeDiagnosticText(frame.functionName || "").slice(0, 160),
    url: sanitizeObservedUrl(frame.url),
    lineNumber: Number.isInteger(frame.lineNumber) ? frame.lineNumber : null,
    columnNumber: Number.isInteger(frame.columnNumber) ? frame.columnNumber : null,
  }));
  return {
    type: sanitizeDiagnosticText(initiator?.type || "unknown").slice(0, 64),
    url: sanitizeObservedUrl(initiator?.url),
    lineNumber: Number.isInteger(initiator?.lineNumber) ? initiator.lineNumber : null,
    columnNumber: Number.isInteger(initiator?.columnNumber) ? initiator.columnNumber : null,
    stack: frames,
    documentUrl: sanitizeObservedUrl(documentURL),
  };
}

export function classifyHttpFailure({ status, path: responsePath, type }) {
  if (status === 404 && type === "Other" && responsePath === "/favicon.ico") return "OPTIONAL_FAVICON_NOT_FOUND";
  if (status === 429) return "RATE_LIMIT_RESPONSE";
  if (status === 404) return "REQUIRED_RESOURCE_NOT_FOUND";
  if (status >= 500) return "UPSTREAM_SERVER_ERROR";
  return "HTTP_ERROR_RESPONSE";
}

export function sanitizeErrorBody(body, { base64Encoded = false } = {}) {
  try {
    const bytes = Buffer.from(String(body || ""), base64Encoded ? "base64" : "utf8");
    return {
      available: true,
      byteLength: bytes.length,
      sha256: sha256(bytes),
      withinCaptureLimit: bytes.length <= ERROR_BODY_LIMIT,
      contentPersisted: false,
    };
  } catch (error) {
    return { available: false, byteLength: null, sha256: null, withinCaptureLimit: false, contentPersisted: false, error: sanitizeDiagnosticText(error?.message || error) };
  }
}

export function sanitizeResponse(response, { type = null } = {}) {
  const url = new URL(response.url);
  return {
    protocol: url.protocol,
    origin: url.origin,
    host: url.host,
    path: url.pathname,
    queryParameterNames: [...url.searchParams.keys()].sort(),
    status: response.status,
    mimeType: response.mimeType,
    httpProtocol: sanitizeDiagnosticText(response.protocol || "").slice(0, 32) || null,
    remoteEndpoint: response.remoteIPAddress ? { address: sanitizeDiagnosticText(response.remoteIPAddress).slice(0, 128), port: Number.isInteger(response.remotePort) ? response.remotePort : null } : null,
    cache: {
      fromDiskCache: Boolean(response.fromDiskCache),
      fromPrefetchCache: Boolean(response.fromPrefetchCache),
      fromServiceWorker: Boolean(response.fromServiceWorker),
    },
    safeHeaders: sanitizeResponseHeaders(response.headers),
    failureClassification: response.status >= 400 ? classifyHttpFailure({ status: response.status, path: url.pathname, type }) : null,
  };
}

export function sanitizeDiagnosticText(value) {
  return String(value || "")
    .replace(/Bearer\s+[^\s"']+/gi, "Bearer [REDACTED]")
    .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, "[REDACTED_JWT]")
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[REDACTED_EMAIL]")
    .replace(/\b(authorization|cookie|password|token|api[-_]?key)\s*[:=]\s*[^\s,;]+/gi, "$1=[REDACTED]");
}

export function sanitizeObservedUrl(value) {
  try {
    const url = new URL(value);
    for (const key of [...url.searchParams.keys()]) url.searchParams.set(key, "[REDACTED]");
    url.hash = "";
    return url.href;
  } catch { return null; }
}

const sanitizePageState = state => state && typeof state === "object" ? {
  ...state,
  url: sanitizeObservedUrl(state.url),
  diagnostic: state.diagnostic ? { ...state.diagnostic, errors: (state.diagnostic.errors || []).map(sanitizeDiagnosticText) } : state.diagnostic,
} : state;

const sanitizeNavigationResult = result => result ? {
  frameId: result.frameId || null,
  loaderId: result.loaderId || null,
  errorText: result.errorText ? sanitizeDiagnosticText(result.errorText) : null,
  isDownload: Boolean(result.isDownload),
} : null;

export function routeStateReady(state, expectedPath, { operational = false } = {}) {
  if (state?.path !== expectedPath || !state.heading || state.blank || state.overlay) return false;
  return !operational || Boolean(state.operational && state.diagnostic?.accessResolved);
}

export function documentScopedAutomationHeaders({ requestUrl, resourceType, exactOrigin }) {
  let url;
  try { url = new URL(requestUrl); } catch { throw new Error("Paused browser request URL is invalid."); }
  if (resourceType !== "Document" || url.origin !== exactOrigin) return [];
  return [{ name: "x-vercel-skip-toolbar", value: "1" }];
}

export function mergeDocumentAutomationHeaders(existing = [], additions = []) {
  const forbidden = existing.filter(header => /^(?:x-vercel-skip-toolbar|x-vercel-protection-bypass|x-vercel-set-bypass-cookie)$/i.test(header.name || ""));
  if (forbidden.length) throw new Error("Browser request already contains a protected automation header.");
  return [...existing.map(header => ({ name: String(header.name), value: String(header.value) })), ...additions];
}

class Cdp {
  constructor(socket) {
    this.socket = socket; this.identifier = 0; this.pending = new Map(); this.listeners = [];
    socket.addEventListener("message", event => {
      const message = JSON.parse(event.data);
      if (message.id) {
        const pending = this.pending.get(message.id); if (!pending) return;
        this.pending.delete(message.id); message.error ? pending.reject(new Error(message.error.message)) : pending.resolve(message.result);
      } else this.listeners.forEach(listener => listener(message));
    });
  }
  send(method, params = {}) { const id = ++this.identifier; this.socket.send(JSON.stringify({ id, method, params })); return new Promise((resolve, reject) => this.pending.set(id, { resolve, reject })); }
  on(listener) { this.listeners.push(listener); }
  close() { this.socket.close(); }
}

export async function openChrome(chromePath, profile, { spawnImpl = spawn, fetchImpl = fetch, socketFactory = url => new WebSocket(url), sleep = delay } = {}) {
  const processHandle = spawnImpl(chromePath, ["--headless=new", "--disable-gpu", "--no-first-run", "--no-default-browser-check", "--remote-debugging-port=0", `--user-data-dir=${profile}`, "about:blank"], { stdio: "ignore" });
  const activePortFile = path.join(profile, "DevToolsActivePort");
  let version, port, browserSocketPath;
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (processHandle.exitCode !== null) break;
    try {
      const [portText, socketPath] = fs.readFileSync(activePortFile, "utf8").trim().split(/\r?\n/);
      const discoveredPort = Number(portText);
      if (!Number.isInteger(discoveredPort) || discoveredPort < 1 || discoveredPort > 65535 || !/^\/devtools\/browser\/[A-Za-z0-9-]+$/.test(socketPath || "")) throw new Error("Invalid owned Chrome DevTools endpoint.");
      const response = await fetchImpl(`http://127.0.0.1:${discoveredPort}/json/version`);
      if (response.ok) {
        const candidate = await response.json();
        const endpoint = new URL(candidate.webSocketDebuggerUrl);
        if (endpoint.hostname !== "127.0.0.1" || Number(endpoint.port) !== discoveredPort || endpoint.pathname !== socketPath) throw new Error("Chrome DevTools endpoint does not belong to the spawned profile.");
        version = candidate; port = discoveredPort; browserSocketPath = socketPath; break;
      }
    } catch {}
    await sleep(100);
  }
  if (!version) { processHandle.kill("SIGTERM"); throw new Error("Local Chrome DevTools endpoint unavailable."); }
  const pageResponse = await fetchImpl(`http://127.0.0.1:${port}/json/new?about:blank`, { method: "PUT" });
  if (!pageResponse.ok) { processHandle.kill("SIGTERM"); throw new Error("Owned Chrome page endpoint unavailable."); }
  const page = await pageResponse.json();
  const pageEndpoint = new URL(page.webSocketDebuggerUrl);
  if (pageEndpoint.hostname !== "127.0.0.1" || Number(pageEndpoint.port) !== port || !pageEndpoint.pathname.startsWith("/devtools/page/")) { processHandle.kill("SIGTERM"); throw new Error("Chrome page endpoint does not belong to the spawned profile."); }
  const socket = socketFactory(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.addEventListener("open", resolve, { once: true }); socket.addEventListener("error", reject, { once: true }); });
  return { processHandle, version, port, browserSocketPath, profile, cdp: new Cdp(socket) };
}

export async function closeChrome(browser, { sleep = delay } = {}) {
  browser.cdp.close();
  if (browser.processHandle.exitCode === null) browser.processHandle.kill("SIGTERM");
  for (let attempt = 0; attempt < 40 && browser.processHandle.exitCode === null; attempt += 1) await sleep(50);
  if (browser.processHandle.exitCode === null) {
    browser.processHandle.kill("SIGKILL");
    for (let attempt = 0; attempt < 20 && browser.processHandle.exitCode === null; attempt += 1) await sleep(50);
  }
  if (browser.processHandle.exitCode === null) throw new Error("Owned Chrome process did not terminate.");
}

export function evaluateBrowserQualification({ accountName, expectedPath, directPath, baseUrl, authenticated, restored, mainCount, exceptions = [], consoleErrors = [], failedRequests = [], httpErrors = [], requests = [], serviceWorkerReady = false }) {
  const errors = [...exceptions, ...consoleErrors, ...(authenticated?.diagnostic?.errors || []), ...(restored?.diagnostic?.errors || [])].filter(Boolean);
  const allowedOrigins = [new URL(baseUrl).origin, "https://identitytoolkit.googleapis.com", "https://securetoken.googleapis.com", "https://firebase.googleapis.com", "https://www.gstatic.com", "https://fcmregistrations.googleapis.com"];
  const unexpectedRequests = requests.filter(request => { try { const url = request.origin ? { origin: request.origin, protocol: request.protocol } : new URL(request.url || request.requestedUrl); if (!["http:", "https:"].includes(url.protocol)) return false; return !allowedOrigins.includes(url.origin) && !url.origin.endsWith(".supabase.co"); } catch { return true; } });
  const ignoredOptionalHttpErrors = httpErrors.filter(response => {
    try { return response.status === 404 && response.type === "Other" && (response.path || new URL(response.url).pathname) === "/favicon.ico"; } catch { return false; }
  });
  const requiredHttpErrors = httpErrors.filter(response => !ignoredOptionalHttpErrors.includes(response));
  const operationalExpected = expectedPath === "/dashboard";
  const completeRendering = authenticated?.path === expectedPath && restored?.path === (directPath || expectedPath) && authenticated?.heading && restored?.heading && !authenticated.blank && !restored.blank && authenticated.operational === operationalExpected && restored.operational === operationalExpected;
  const earningsRequests = requests.filter(request => /restaurant_(?:get|list)_earnings/i.test(request.path || "")).length;
  const blockers = [];
  if (!completeRendering) blockers.push("INCOMPLETE_OPERATIONAL_RENDERING");
  if (mainCount !== 1) blockers.push("MAIN_LANDMARK_INVALID");
  if (errors.length) blockers.push("UNCAUGHT_OR_CONSOLE_ERROR");
  if (failedRequests.length) blockers.push("NETWORK_LOADING_FAILURE");
  if (requiredHttpErrors.length) blockers.push("SAME_ORIGIN_HTTP_ERROR");
  if (unexpectedRequests.length) blockers.push("UNEXPECTED_RUNTIME_REQUEST");
  if (!serviceWorkerReady) blockers.push("SERVICE_WORKER_NOT_READY");
  if ((authenticated?.diagnostic?.navigations?.length || 0) > 8 || (restored?.diagnostic?.navigations?.length || 0) > 8) blockers.push("UNBOUNDED_NAVIGATION");
  if (authenticated?.diagnostic?.protectedBeforeReady || restored?.diagnostic?.protectedBeforeReady) blockers.push("PROTECTED_CONTENT_BEFORE_AUTHORIZATION");
  if (accountName === "manager" && (authenticated?.earningsLink || restored?.earningsLink || earningsRequests)) blockers.push("MANAGER_FINANCIAL_ACCESS");
  return { passed: blockers.length === 0, blockers, errors, httpErrors: requiredHttpErrors, ignoredOptionalHttpErrors, failedRequests, unexpectedRequests, earningsRequests, completeRendering };
}

export async function waitForServiceWorkerReady(evaluate, { attempts = 100, intervalMs = 50, sleep = delay } = {}) {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const state = await evaluate(`(async()=>{if(!('serviceWorker' in navigator))return {supported:false,ready:false,controller:false,registrations:[]};const registrations=await navigator.serviceWorker.getRegistrations();const activated=registrations.some(registration=>registration.active?.state==='activated'&&registration.scope===location.origin+'/');const controller=Boolean(navigator.serviceWorker.controller);return {supported:true,ready:activated&&controller,activated,controller,registrations:registrations.map(registration=>({scope:registration.scope,active:registration.active?.state||null,waiting:registration.waiting?.state||null,installing:registration.installing?.state||null}))}})()`).catch(error => ({ supported: true, ready: false, controller: false, registrations: [], error: String(error?.message || error) }));
    if (state.ready) return { ...state, attempt };
    if (attempt < attempts) await sleep(intervalMs);
    else return { ...state, attempt };
  }
  return { supported: false, ready: false, registrations: [], attempt: 0 };
}

export function requiresServiceWorkerControllerReload(state) {
  return state?.ready !== true && state?.activated === true && state?.controller === false;
}

export async function qualifyAccount({
  accountName,
  account,
  expectedPath,
  directPath,
  baseUrl,
  directory,
  chromePath,
  openChromeImpl = openChrome,
  closeChromeImpl = closeChrome,
  sleep = delay,
  waitAttempts = 600,
  waitIntervalMs = 50,
  documentAutomationOrigin = null,
  prepareBrowser = async () => {},
}) {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), `restaurant-alias-diagnostic-${accountName}-`));
  let browser, version, cdp, evaluate, snapshot, authenticated = null, restored = null, serviceWorker = null, mainCount = null;
  let evidencePersisted = false, stage = "BROWSER_START", failureClassification = "BROWSER_QUALIFICATION_EXCEPTION", qualificationBlockers = [];
  const exceptions = [], consoleErrors = [], failedRequests = [], httpErrors = [], responses = [], requests = [], lifecycle = [], navigations = [];
  const responsesByRequestId = new Map(), networkEvidenceTasks = [], automationHeaderObservations = [];
  const evidencePath = path.join(directory, `immutable-${accountName}-access-evidence.json`);
  const screenshotName = `immutable-${accountName}-access.png`, screenshotPath = path.join(directory, screenshotName);

  const captureScreenshot = async () => {
    if (!cdp) return { file: screenshotName, captured: false, error: "CDP_UNAVAILABLE" };
    try {
      await cdp.send("Runtime.evaluate", { expression: `(()=>{for(const input of document.querySelectorAll('input,textarea'))input.value='[REDACTED]';const walker=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);for(let node;node=walker.nextNode();)if(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(node.nodeValue||''))node.nodeValue=(node.nodeValue||'').replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi,'[REDACTED_EMAIL]')})()` }).catch(() => {});
      const screenshot = await cdp.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
      fs.writeFileSync(screenshotPath, Buffer.from(screenshot.data, "base64"), { mode: 0o600 });
      return { file: screenshotName, captured: true, sha256: sha256(fs.readFileSync(screenshotPath)) };
    } catch (error) {
      return { file: screenshotName, captured: false, error: sanitizeDiagnosticText(error?.message || error) };
    }
  };
  const observeServiceWorker = async () => serviceWorker || (evaluate
    ? waitForServiceWorkerReady(evaluate, { attempts: 1, intervalMs: 0, sleep })
    : { supported: false, ready: false, registrations: [], attempt: 0, error: "EVALUATOR_UNAVAILABLE" });
  const drainNetworkEvidence = async () => {
    await Promise.allSettled([...networkEvidenceTasks]);
    for (const row of httpErrors) {
      if (!row.errorBody) row.errorBody = { available: false, byteLength: null, sha256: null, withinCaptureLimit: false, contentPersisted: false, error: "BODY_CAPTURE_INCOMPLETE" };
    }
  };
  const persistFailure = async error => {
    if (evidencePersisted) return;
    await drainNetworkEvidence();
    const finalState = snapshot
      ? await snapshot().catch(snapshotError => ({ evaluationError: sanitizeDiagnosticText(snapshotError?.message || snapshotError) }))
      : null;
    const finalServiceWorker = await observeServiceWorker();
    const screenshot = await captureScreenshot();
    const failure = {
      schemaVersion: 2,
      capturedAt: new Date().toISOString(),
      passed: false,
      account: accountName,
      stage,
      failureClassification,
      error: sanitizeDiagnosticText(error?.message || error),
      browser: version?.Browser || null,
      browserPort: browser?.port || null,
      profileOwnedEndpoint: Boolean(browser),
      expectedPath,
      directPath,
      finalUrl: finalState?.url || null,
      finalState,
      authenticated,
      restored,
      mainCount,
      observableAuthentication: {
        loginFormVisible: Boolean(finalState?.loginFormVisible),
        accessResolved: Boolean(finalState?.diagnostic?.accessResolved),
        operationalRuntimeVisible: Boolean(finalState?.operational),
      },
      navigationObservations: navigations,
      lifecycleObservations: lifecycle,
      automationHeaderObservations,
      uncaughtErrors: exceptions.map(sanitizeDiagnosticText),
      consoleErrors: consoleErrors.map(sanitizeDiagnosticText),
      failedRequests,
      httpErrors,
      responseInventory: responses,
      requestInventory: requests,
      serviceWorker: finalServiceWorker,
      serviceWorkerReady: Boolean(finalServiceWorker.ready),
      screenshot,
      blockers: qualificationBlockers.length ? qualificationBlockers : [failureClassification],
      credentialValuesPersisted: false,
    };
    atomicWrite(evidencePath, failure);
    evidencePersisted = true;
  };

  try {
    browser = await openChromeImpl(chromePath, profile);
    ({ version, cdp } = browser);
    stage = "BROWSER_INITIALIZATION";
    await Promise.all([
      cdp.send("Page.enable"),
      cdp.send("Runtime.enable"),
      cdp.send("Network.enable"),
      cdp.send("Accessibility.enable"),
      cdp.send("Page.setLifecycleEventsEnabled", { enabled: true }),
    ]);
    if (documentAutomationOrigin) {
      if (new URL(baseUrl).origin !== documentAutomationOrigin) throw new Error("Document automation origin differs from the qualification origin.");
      await cdp.send("Fetch.enable", { patterns: [{ urlPattern: `${documentAutomationOrigin}/*`, resourceType: "Document", requestStage: "Request" }] });
    }
    await prepareBrowser({ browser, cdp, baseUrl });
    await cdp.send("Emulation.setDeviceMetricsOverride", { width: 1024, height: 768, deviceScaleFactor: 1, mobile: false });
    await cdp.send("Page.addScriptToEvaluateOnNewDocument", { source: `window.__diagnostic={navigations:[],mutations:0,errors:[],accessResolved:false,protectedBeforeReady:false};const originalFetch=window.fetch.bind(window);window.fetch=async(...args)=>{const response=await originalFetch(...args);try{const requestUrl=new URL(typeof args[0]==='string'?args[0]:args[0].url,location.href);if(requestUrl.pathname.endsWith('/get_my_access_context_v1'))window.__diagnostic.accessResolved=true}catch{}return response};for(const key of ['pushState','replaceState']){const original=history[key];history[key]=function(...args){const result=original.apply(this,args);__diagnostic.navigations.push({type:key,path:location.pathname});return result}}addEventListener('popstate',()=>__diagnostic.navigations.push({type:'popstate',path:location.pathname}));addEventListener('error',event=>__diagnostic.errors.push(String(event.error?.message||event.message)));addEventListener('unhandledrejection',event=>__diagnostic.errors.push(String(event.reason?.message||event.reason)));addEventListener('DOMContentLoaded',()=>new MutationObserver(()=>{__diagnostic.mutations++;const main=document.querySelector('.app-shell main');if(main&&!__diagnostic.accessResolved)__diagnostic.protectedBeforeReady=true}).observe(document.body,{subtree:true,childList:true,attributes:true}));` });
    cdp.on(message => {
      if (message.method === "Fetch.requestPaused") {
        const additions = documentScopedAutomationHeaders({ requestUrl: message.params.request.url, resourceType: message.params.resourceType, exactOrigin: documentAutomationOrigin });
        const row = { observedAt: new Date().toISOString(), origin: new URL(message.params.request.url).origin, resourceType: message.params.resourceType, headerNames: additions.map(value => value.name), attached: additions.length === 1 };
        automationHeaderObservations.push(row);
        const task = cdp.send("Fetch.continueRequest", { requestId: message.params.requestId, headers: mergeDocumentAutomationHeaders(message.params.request.headers ? Object.entries(message.params.request.headers).map(([name, value]) => ({ name, value })) : [], additions) })
          .catch(error => { exceptions.push(`DOCUMENT_AUTOMATION_HEADER_FAILED: ${sanitizeDiagnosticText(error?.message || error)}`); });
        networkEvidenceTasks.push(task);
      }
      if (message.method === "Page.lifecycleEvent") lifecycle.push({ observedAt: new Date().toISOString(), name: message.params.name, frameId: message.params.frameId || null, loaderId: message.params.loaderId || null });
      if (message.method === "Runtime.exceptionThrown") exceptions.push(sanitizeDiagnosticText(message.params.exceptionDetails?.exception?.description || message.params.exceptionDetails?.text));
      if (message.method === "Runtime.consoleAPICalled" && ["error", "assert"].includes(message.params.type)) consoleErrors.push(sanitizeDiagnosticText(message.params.args.map(value => value.value || value.description || value.type).join(" ")));
      if (message.method === "Network.loadingFailed" && !String(message.params.errorText || "").includes("ERR_ABORTED") && message.params.type !== "Other") {
        const request = requests.find(row => row.requestId === message.params.requestId) || null;
        failedRequests.push({
          observedAt: new Date().toISOString(),
          requestId: message.params.requestId || null,
          type: message.params.type,
          method: request?.method || null,
          origin: request?.origin || null,
          path: request?.path || null,
          errorText: sanitizeDiagnosticText(message.params.errorText),
          canceled: Boolean(message.params.canceled),
          blockedReason: message.params.blockedReason ? sanitizeDiagnosticText(message.params.blockedReason) : null,
          corsErrorStatus: message.params.corsErrorStatus ? {
            corsError: sanitizeDiagnosticText(message.params.corsErrorStatus.corsError).slice(0, 120),
            failedParameter: sanitizeDiagnosticText(message.params.corsErrorStatus.failedParameter).slice(0, 200),
          } : null,
        });
      }
      if (message.method === "Network.requestWillBeSent") requests.push({ observedAt: new Date().toISOString(), requestId: message.params.requestId, type: message.params.type, ...sanitizeRequest(message.params.request, { initiator: message.params.initiator, documentURL: message.params.documentURL }) });
      if (message.method === "Network.responseReceived") {
        const response = message.params.response, row = { observedAt: new Date().toISOString(), requestId: message.params.requestId, type: message.params.type, ...sanitizeResponse(response, { type: message.params.type }) };
        responses.push(row);
        responsesByRequestId.set(message.params.requestId, row);
        try { if (new URL(response.url).origin === new URL(baseUrl).origin && response.status >= 400) httpErrors.push(row); } catch {}
        if (new URL(response.url).pathname.endsWith("/get_my_access_context_v1")) cdp.send("Runtime.evaluate", { expression: "window.__diagnostic.accessResolved=true" }).catch(() => {});
      }
      if (message.method === "Network.loadingFinished") {
        const row = responsesByRequestId.get(message.params.requestId);
        if (row?.status >= 400 && !row.errorBody) {
          const task = cdp.send("Network.getResponseBody", { requestId: message.params.requestId })
            .then(result => { row.errorBody = sanitizeErrorBody(result?.body, { base64Encoded: Boolean(result?.base64Encoded) }); })
            .catch(error => { row.errorBody = { available: false, byteLength: Number.isFinite(message.params.encodedDataLength) ? message.params.encodedDataLength : null, sha256: null, withinCaptureLimit: false, contentPersisted: false, error: sanitizeDiagnosticText(error?.message || error) }; });
          networkEvidenceTasks.push(task);
        }
      }
    });
    evaluate = async expression => {
      const result = await cdp.send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
      if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
      return result.result.value;
    };
    snapshot = () => evaluate(`({url:location.href,path:location.pathname,heading:document.querySelector('main h1')?.textContent?.trim()||null,blank:!document.body.innerText.trim(),operational:Boolean(document.querySelector('.app-shell main')),overlay:Boolean(document.querySelector('.access-overlay')),loginFormVisible:Boolean(document.querySelector('input[type=email]')),earningsLink:Boolean(document.querySelector('a[href="/earnings"]')),diagnostic:window.__diagnostic||{navigations:[],mutations:0,errors:[],accessResolved:false,protectedBeforeReady:false}})`).then(sanitizePageState);
    const waitFor = async (expected, options = {}) => {
      let lastState = null;
      for (let attempt = 1; attempt <= waitAttempts; attempt += 1) {
        lastState = await snapshot().catch(error => ({ evaluationError: sanitizeDiagnosticText(error?.message || error) }));
        if (routeStateReady(lastState, expected, options)) return lastState;
        if (attempt < waitAttempts) await sleep(waitIntervalMs);
      }
      const error = new Error(`${accountName} did not reach ${expected}.`);
      error.lastState = lastState;
      throw error;
    };
    const navigate = async (navigationStage, requestedUrl, operation) => {
      const observation = { stage: navigationStage, requestedUrl, startedAt: new Date().toISOString(), completedAt: null, result: null, error: null };
      navigations.push(observation);
      try {
        const result = await operation();
        observation.result = sanitizeNavigationResult(result);
        observation.completedAt = new Date().toISOString();
        return result;
      } catch (error) {
        observation.error = sanitizeDiagnosticText(error?.message || error);
        observation.completedAt = new Date().toISOString();
        failureClassification = navigationStage === "DIRECT_ROUTE_RESTORATION"
          ? "DIRECT_ROUTE_NAVIGATION_FAILED"
          : navigationStage === "SESSION_RESTORATION"
            ? "SESSION_RELOAD_FAILED"
            : "INITIAL_NAVIGATION_FAILED";
        throw error;
      }
    };
    const reloadAndWaitForNewDocument = async () => {
      const previousTimeOrigin = await evaluate("performance.timeOrigin");
      const result = await cdp.send("Page.reload", { ignoreCache: true });
      for (let attempt = 1; attempt <= waitAttempts; attempt += 1) {
        const currentTimeOrigin = await evaluate("performance.timeOrigin").catch(() => null);
        if (typeof currentTimeOrigin === "number" && currentTimeOrigin !== previousTimeOrigin) return { ...result, documentReplaced: true };
        if (attempt < waitAttempts) await sleep(waitIntervalMs);
      }
      throw new Error("Cache-bypassing reload did not create a new browser document within the bound.");
    };

    stage = "LOGIN_FORM";
    const initialUrl = new URL("/dashboard", baseUrl).href;
    await navigate(stage, initialUrl, () => cdp.send("Page.navigate", { url: initialUrl }));
    for (let attempt = 0; attempt < waitAttempts && !(await evaluate("!!document.querySelector('input[type=email]')").catch(() => false)); attempt += 1) await sleep(waitIntervalMs);
    if (!(await evaluate("!!document.querySelector('input[type=email]')"))) {
      failureClassification = "LOGIN_FORM_UNAVAILABLE";
      throw new Error(`${accountName} login form unavailable.`);
    }
    await evaluate("document.querySelector('input[type=email]').focus()");
    await cdp.send("Input.insertText", { text: account.email });
    await evaluate("document.querySelector('input[type=password]').focus()");
    await cdp.send("Input.insertText", { text: account.password });
    await evaluate("document.querySelector('button[type=submit],form button')?.click()");

    stage = "AUTHENTICATED_ROUTE";
    failureClassification = "AUTHENTICATED_ROUTE_TIMEOUT";
    authenticated = await waitFor(expectedPath, { operational: expectedPath === "/dashboard" });
    if (directPath) {
      stage = "DIRECT_ROUTE_RESTORATION";
      failureClassification = "DIRECT_ROUTE_TIMEOUT";
      const requestedUrl = new URL(directPath, baseUrl).href;
      await navigate(stage, requestedUrl, () => cdp.send("Page.navigate", { url: requestedUrl }));
      restored = await waitFor(directPath, { operational: true });
    } else {
      stage = "SESSION_RESTORATION";
      failureClassification = "SESSION_RESTORATION_TIMEOUT";
      const requestedUrl = new URL(expectedPath, baseUrl).href;
      await navigate(stage, requestedUrl, reloadAndWaitForNewDocument);
      restored = await waitFor(expectedPath);
    }

    stage = "QUALIFICATION";
    failureClassification = "QUALIFICATION_FAILED";
    await drainNetworkEvidence();
    const ax = await cdp.send("Accessibility.getFullAXTree");
    mainCount = ax.nodes.filter(node => !node.ignored && node.role?.value === "main").length;
    const accessRequests = requests.filter(request => request.path.endsWith("/get_my_access_context_v1")).length;
    serviceWorker = await waitForServiceWorkerReady(evaluate);
    if (requiresServiceWorkerControllerReload(serviceWorker)) {
      const qualifiedPath = directPath || expectedPath;
      stage = "SERVICE_WORKER_CONTROLLER_RESTORATION";
      failureClassification = "SERVICE_WORKER_CONTROLLER_TIMEOUT";
      await navigate(stage, new URL(qualifiedPath, baseUrl).href, reloadAndWaitForNewDocument);
      await waitFor(qualifiedPath, { operational: qualifiedPath === "/dashboard" || Boolean(directPath) });
      serviceWorker = { ...(await waitForServiceWorkerReady(evaluate)), recoveryReload: true };
    }
    const serviceWorkerReady = serviceWorker.ready;
    const decision = evaluateBrowserQualification({ accountName, expectedPath, directPath, baseUrl, authenticated, restored, mainCount, exceptions, consoleErrors, failedRequests, httpErrors, requests, serviceWorkerReady });
    qualificationBlockers = decision.blockers;
    if (!decision.passed) throw new Error(`${accountName} immutable access qualification failed: ${decision.blockers.join(",")}.`);
    const screenshot = await captureScreenshot();
    if (!screenshot.captured) throw new Error(`${accountName} screenshot capture failed.`);
    const accountEvidence = { schemaVersion: 2, capturedAt: new Date().toISOString(), passed: true, account: accountName, browser: version.Browser, expectedPath, directPath, authenticated, restored, mainCount, accessRequests, earningsRequests: decision.earningsRequests, uncaughtErrors: decision.errors, failedRequests, httpErrors: decision.httpErrors, ignoredOptionalHttpErrors: decision.ignoredOptionalHttpErrors, unexpectedRequests: decision.unexpectedRequests, responseInventory: responses, serviceWorker, serviceWorkerReady, requestInventory: requests, navigationObservations: navigations, lifecycleObservations: lifecycle, automationHeaderObservations, screenshot, blockers: [], credentialValuesPersisted: false };
    atomicWrite(evidencePath, accountEvidence);
    evidencePersisted = true;
    return accountEvidence;
  } catch (error) {
    await persistFailure(error);
    throw error;
  } finally {
    if (browser) await closeChromeImpl(browser);
    fs.rmSync(profile, { recursive: true, force: true });
  }
}

export function isSafetyQualificationError(error) {
  return [
    "AUTHORIZATION_VIOLATION",
    "CREDENTIAL_EXPOSURE",
    "EVIDENCE_INTEGRITY_FAILURE",
    "IDENTITY_MISMATCH",
    "RESOURCE_SAFETY_LIMIT",
    "UNEXPECTED_HOSTED_MUTATION",
  ].includes(error?.code);
}

export async function qualifyAccountsExhaustively({ cases, qualify, onResult = async () => {} }) {
  const results = [];
  let safetyStop = null;
  for (let index = 0; index < cases.length; index += 1) {
    const item = cases[index];
    if (safetyStop) {
      const result = { account: item.name, expectedPath: item.expected, directPath: item.direct || null, passed: false, status: "NOT EXECUTED", blockers: ["SAFETY_STOP"] };
      results.push(result);
      await onResult(result);
      continue;
    }
    try {
      const evidence = await qualify(item);
      const result = { ...evidence, status: evidence.passed === true ? "PASS" : "FAIL" };
      results.push(result);
      await onResult(result);
    } catch (error) {
      const safety = isSafetyQualificationError(error);
      const result = {
        account: item.name,
        expectedPath: item.expected,
        directPath: item.direct || null,
        passed: false,
        status: safety ? "BLOCKED" : "FAIL",
        blockers: [safety ? error.code : "QUALIFICATION_EXCEPTION"],
        error: sanitizeDiagnosticText(error?.message || error),
      };
      results.push(result);
      await onResult(result);
      if (safety) safetyStop = { account: item.name, code: error.code };
    }
  }
  return {
    passed: results.length === cases.length && results.every(result => result.status === "PASS"),
    classification: safetyStop ? "BLOCKED" : results.every(result => result.status === "PASS") ? "PASS" : "FAIL",
    safetyStop,
    results,
  };
}

export async function runAccessQualification(argv = process.argv.slice(2)) {
  const values = parseOptions(argv);
  if (values.environment !== "staging" || !values.authority || !values.accounts || !values["source-manifest"] || !values.confirm) throw new Error("Staging authority, source manifest, accounts, and confirmation are required.");
  const authority = validateAuthority(JSON.parse(fs.readFileSync(path.resolve(values.authority), "utf8")), { runId: values["run-id"], sourceCommit: values["expect-commit"], sourceManifestSha256: values["expect-source-sha256"] });
  if (values.confirm !== `staging:restaurant-alias-diagnostic:qualify-immutable-access:${authority.runId}`) throw new Error("Action-specific confirmation mismatch.");
  const root = path.resolve(import.meta.dirname, "..");
  if (sha256(fs.readFileSync(path.resolve(values["source-manifest"]))) !== authority.sourceManifestSha256) throw new Error("Reviewed source manifest mismatch.");
  if (spawnSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).stdout.trim() !== authority.sourceCommit) throw new Error("Audited operator checkpoint mismatch.");
  if (spawnSync("git", ["rev-parse", "HEAD:apps/restaurant"], { cwd: root, encoding: "utf8" }).stdout.trim() !== DIAGNOSTIC_OPERATOR.applicationTree) throw new Error("Restaurant application tree changed.");
  const directory = path.join(root, DIAGNOSTIC_OPERATOR.evidenceRoot, authority.runId);
  const deployment = JSON.parse(fs.readFileSync(path.join(directory, "immutable-deployment.json"), "utf8"));
  const smokePath = path.join(directory, "immutable-smoke.json"), smoke = JSON.parse(fs.readFileSync(smokePath, "utf8")), immutableEvidenceSha256 = sha256(fs.readFileSync(smokePath));
  if (!smoke.passed || smoke.deploymentIdentifier !== deployment.deploymentIdentifier || REJECTED_DEPLOYMENTS.includes(deployment.deploymentIdentifier)) throw new Error("Passing new immutable candidate evidence required.");
  const accounts = JSON.parse(fs.readFileSync(path.resolve(values.accounts), "utf8"));
  for (const name of ["pending", "suspended", "owner", "manager"]) if (!accounts[name]?.email || !accounts[name]?.password) throw new Error(`Missing ${name} qualification identity.`);
  const chromePath = values.chrome || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
  const cases = [{ name: "pending", expected: "/pending" }, { name: "suspended", expected: "/suspended" }, { name: "owner", expected: "/dashboard", direct: "/orders" }, { name: "manager", expected: "/dashboard", direct: "/orders" }];
  const progressPath = path.join(directory, "immutable-access-qualification-progress.json");
  if (fs.existsSync(progressPath) || fs.existsSync(path.join(directory, "immutable-access-qualification.json"))) throw new Error("Immutable access qualification evidence already exists; replay is prohibited.");
  atomicWrite(progressPath, { schemaVersion: 1, runId: authority.runId, deploymentIdentifier: deployment.deploymentIdentifier, capturedAt: new Date().toISOString(), results: [] });
  const exhaustive = await qualifyAccountsExhaustively({
    cases,
    qualify: item => qualifyAccount({ accountName: item.name, account: accounts[item.name], expectedPath: item.expected, directPath: item.direct, baseUrl: deployment.url, directory, chromePath }),
    onResult: async result => atomicWrite(progressPath, { schemaVersion: 1, runId: authority.runId, deploymentIdentifier: deployment.deploymentIdentifier, capturedAt: new Date().toISOString(), results: [...(fs.existsSync(progressPath) ? JSON.parse(fs.readFileSync(progressPath, "utf8")).results : []), result] }),
  });
  const results = exhaustive.results;
  const evidence = { schemaVersion: 2, passed: exhaustive.passed, classification: exhaustive.classification, capturedAt: new Date().toISOString(), runId: authority.runId, qualificationId: `${authority.runId}:${deployment.deploymentIdentifier}:immutable-access`, deploymentIdentifier: deployment.deploymentIdentifier, immutableUrl: deployment.url, sourceCommit: authority.sourceCommit, sourceManifestSha256: authority.sourceManifestSha256, artifactManifestSha256: DIAGNOSTIC_OPERATOR.artifactManifestSha256, immutableEvidenceSha256, credentialValuesPersisted: false, boundedConcurrency: 1, safetyStop: exhaustive.safetyStop, results };
  const evidencePath = path.join(directory, "immutable-access-qualification.json"); atomicWrite(evidencePath, evidence);
  if (!exhaustive.passed) throw new Error(`Immutable access qualification ${exhaustive.classification.toLowerCase()}; complete evidence persisted.`);
  return { passed: true, deploymentIdentifier: deployment.deploymentIdentifier, cases: results.map(result => ({ account: result.account, path: result.restored.path, navigationCount: result.restored.diagnostic.navigations.length, screenshotSha256: result.screenshot.sha256 })), evidenceSha256: sha256(fs.readFileSync(evidencePath)) };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) runAccessQualification().then(result => process.stdout.write(`${JSON.stringify(result)}\n`)).catch(error => { process.stderr.write(`${error.message}\n`); process.exitCode = 1; });
