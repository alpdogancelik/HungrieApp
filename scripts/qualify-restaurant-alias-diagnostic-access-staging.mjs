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

export function sanitizeRequest(request) {
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
  };
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

async function openChrome(chromePath, profile, port) {
  const processHandle = spawn(chromePath, ["--headless=new", "--disable-gpu", "--no-first-run", "--no-default-browser-check", `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, "about:blank"], { stdio: "ignore" });
  let version;
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try { const response = await fetch(`http://127.0.0.1:${port}/json/version`); if (response.ok) { version = await response.json(); break; } } catch {}
    await delay(100);
  }
  if (!version) { processHandle.kill("SIGTERM"); throw new Error("Local Chrome DevTools endpoint unavailable."); }
  const page = await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: "PUT" })).json();
  const socket = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.addEventListener("open", resolve, { once: true }); socket.addEventListener("error", reject, { once: true }); });
  return { processHandle, version, cdp: new Cdp(socket) };
}

export function evaluateBrowserQualification({ accountName, expectedPath, directPath, baseUrl, authenticated, restored, mainCount, exceptions = [], consoleErrors = [], failedRequests = [], httpErrors = [], requests = [], serviceWorkerReady = false }) {
  const errors = [...exceptions, ...consoleErrors, ...(authenticated?.diagnostic?.errors || []), ...(restored?.diagnostic?.errors || [])].filter(Boolean);
  const allowedOrigins = [new URL(baseUrl).origin, "https://identitytoolkit.googleapis.com", "https://securetoken.googleapis.com", "https://firebase.googleapis.com", "https://www.gstatic.com", "https://fcmregistrations.googleapis.com"];
  const unexpectedRequests = requests.filter(request => { try { const url = request.origin ? { origin: request.origin, protocol: request.protocol } : new URL(request.url || request.requestedUrl); if (!["http:", "https:"].includes(url.protocol)) return false; return !allowedOrigins.includes(url.origin) && !url.origin.endsWith(".supabase.co"); } catch { return true; } });
  const ignoredOptionalHttpErrors = httpErrors.filter(response => {
    try { return response.status === 404 && response.type === "Other" && new URL(response.url).pathname === "/favicon.ico"; } catch { return false; }
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
    const state = await evaluate(`(async()=>{if(!('serviceWorker' in navigator))return {supported:false,ready:false,registrations:[]};const registrations=await navigator.serviceWorker.getRegistrations();const ready=registrations.some(registration=>registration.active?.state==='activated'&&registration.scope===location.origin+'/');return {supported:true,ready,controller:Boolean(navigator.serviceWorker.controller),registrations:registrations.map(registration=>({scope:registration.scope,active:registration.active?.state||null,waiting:registration.waiting?.state||null,installing:registration.installing?.state||null}))}})()`).catch(error => ({ supported: true, ready: false, registrations: [], error: String(error?.message || error) }));
    if (state.ready) return { ...state, attempt };
    if (attempt < attempts) await sleep(intervalMs);
    else return { ...state, attempt };
  }
  return { supported: false, ready: false, registrations: [], attempt: 0 };
}

async function qualifyAccount({ accountName, account, expectedPath, directPath, baseUrl, directory, chromePath, port }) {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), `restaurant-alias-diagnostic-${accountName}-`));
  const { processHandle, version, cdp } = await openChrome(chromePath, profile, port);
  try {
    await Promise.all([cdp.send("Page.enable"), cdp.send("Runtime.enable"), cdp.send("Network.enable"), cdp.send("Accessibility.enable")]);
    await cdp.send("Emulation.setDeviceMetricsOverride", { width: 1024, height: 768, deviceScaleFactor: 1, mobile: false });
    await cdp.send("Page.addScriptToEvaluateOnNewDocument", { source: `window.__diagnostic={navigations:[],mutations:0,errors:[],accessResolved:false,protectedBeforeReady:false};for(const key of ['pushState','replaceState']){const original=history[key];history[key]=function(...args){const result=original.apply(this,args);__diagnostic.navigations.push({type:key,path:location.pathname});return result}}addEventListener('popstate',()=>__diagnostic.navigations.push({type:'popstate',path:location.pathname}));addEventListener('error',event=>__diagnostic.errors.push(String(event.error?.message||event.message)));addEventListener('unhandledrejection',event=>__diagnostic.errors.push(String(event.reason?.message||event.reason)));addEventListener('DOMContentLoaded',()=>new MutationObserver(()=>{__diagnostic.mutations++;const main=document.querySelector('.app-shell main');if(main&&!__diagnostic.accessResolved)__diagnostic.protectedBeforeReady=true}).observe(document.body,{subtree:true,childList:true,attributes:true}));` });
    const exceptions = [], consoleErrors = [], failedRequests = [], httpErrors = [], responses = [], requests = [];
    cdp.on(message => {
      if (message.method === "Runtime.exceptionThrown") exceptions.push(message.params.exceptionDetails?.exception?.description || message.params.exceptionDetails?.text);
      if (message.method === "Runtime.consoleAPICalled" && ["error", "assert"].includes(message.params.type)) consoleErrors.push(message.params.args.map(value => value.value || value.description || value.type).join(" "));
      if (message.method === "Network.loadingFailed" && !String(message.params.errorText || "").includes("ERR_ABORTED") && message.params.type !== "Other") failedRequests.push({ type: message.params.type, errorText: message.params.errorText });
      if (message.method === "Network.requestWillBeSent") requests.push({ observedAt: new Date().toISOString(), requestId: message.params.requestId, type: message.params.type, ...sanitizeRequest(message.params.request) });
      if (message.method === "Network.responseReceived") {
        const response = message.params.response, row = { observedAt: new Date().toISOString(), requestId: message.params.requestId, url: response.url, status: response.status, mimeType: response.mimeType, type: message.params.type };
        responses.push(row);
        try { if (new URL(response.url).origin === new URL(baseUrl).origin && response.status >= 400) httpErrors.push(row); } catch {}
        if (new URL(response.url).pathname.endsWith("/get_my_access_context_v1")) cdp.send("Runtime.evaluate", { expression: "window.__diagnostic.accessResolved=true" }).catch(() => {});
      }
    });
    const evaluate = async expression => { const result = await cdp.send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true }); if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text); return result.result.value; };
    const snapshot = () => evaluate(`({path:location.pathname,heading:document.querySelector('main h1')?.textContent?.trim()||null,blank:!document.body.innerText.trim(),operational:Boolean(document.querySelector('.app-shell main')),earningsLink:Boolean(document.querySelector('a[href="/earnings"]')),diagnostic:window.__diagnostic})`);
    const waitFor = async expected => { for (let attempt = 0; attempt < 600; attempt += 1) { const state = await snapshot().catch(() => null); if (state?.path === expected && state.heading && !state.blank) return state; await delay(50); } throw new Error(`${accountName} did not reach ${expected}.`); };
    await cdp.send("Page.navigate", { url: new URL("/dashboard", baseUrl).href });
    for (let attempt = 0; attempt < 600 && !(await evaluate("!!document.querySelector('input[type=email]')").catch(() => false)); attempt += 1) await delay(50);
    if (!(await evaluate("!!document.querySelector('input[type=email]')"))) throw new Error(`${accountName} login form unavailable.`);
    await evaluate("document.querySelector('input[type=email]').focus()"); await cdp.send("Input.insertText", { text: account.email });
    await evaluate("document.querySelector('input[type=password]').focus()"); await cdp.send("Input.insertText", { text: account.password });
    await evaluate("document.querySelector('button[type=submit],form button')?.click()");
    const authenticated = await waitFor(expectedPath);
    let restored = null;
    if (directPath) { await cdp.send("Page.navigate", { url: new URL(directPath, baseUrl).href }); restored = await waitFor(directPath); }
    else { await cdp.send("Page.reload", { ignoreCache: true }); restored = await waitFor(expectedPath); }
    const ax = await cdp.send("Accessibility.getFullAXTree");
    const mainCount = ax.nodes.filter(node => !node.ignored && node.role?.value === "main").length;
    const accessRequests = requests.filter(request => request.path.endsWith("/get_my_access_context_v1")).length;
    const serviceWorker = await waitForServiceWorkerReady(evaluate);
    const serviceWorkerReady = serviceWorker.ready;
    const decision = evaluateBrowserQualification({ accountName, expectedPath, directPath, baseUrl, authenticated, restored, mainCount, exceptions, consoleErrors, failedRequests, httpErrors, requests, serviceWorkerReady });
    const accountEvidence = { schemaVersion: 1, capturedAt: new Date().toISOString(), passed: decision.passed, account: accountName, browser: version.Browser, expectedPath, directPath, authenticated, restored, mainCount, accessRequests, earningsRequests: decision.earningsRequests, uncaughtErrors: decision.errors, failedRequests, httpErrors: decision.httpErrors, ignoredOptionalHttpErrors: decision.ignoredOptionalHttpErrors, unexpectedRequests: decision.unexpectedRequests, responseInventory: responses, serviceWorker, serviceWorkerReady, requestInventory: requests, blockers: decision.blockers, credentialValuesPersisted: false };
    atomicWrite(path.join(directory, `immutable-${accountName}-access-evidence.json`), accountEvidence);
    if (!decision.passed) throw new Error(`${accountName} immutable access qualification failed: ${decision.blockers.join(",")}.`);
    const screenshot = await cdp.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
    const screenshotName = `immutable-${accountName}-access.png`, screenshotPath = path.join(directory, screenshotName);
    fs.writeFileSync(screenshotPath, Buffer.from(screenshot.data, "base64"), { mode: 0o600 });
    return { ...accountEvidence, screenshot: { file: screenshotName, sha256: sha256(fs.readFileSync(screenshotPath)) } };
  } finally { cdp.close(); processHandle.kill("SIGTERM"); await delay(150); fs.rmSync(profile, { recursive: true, force: true }); }
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
  const results = [];
  for (let index = 0; index < cases.length; index += 1) results.push(await qualifyAccount({ accountName: cases[index].name, account: accounts[cases[index].name], expectedPath: cases[index].expected, directPath: cases[index].direct, baseUrl: deployment.url, directory, chromePath, port: 9580 + index }));
  const evidence = { schemaVersion: 1, passed: true, capturedAt: new Date().toISOString(), runId: authority.runId, qualificationId: `${authority.runId}:${deployment.deploymentIdentifier}:immutable-access`, deploymentIdentifier: deployment.deploymentIdentifier, immutableUrl: deployment.url, sourceCommit: authority.sourceCommit, sourceManifestSha256: authority.sourceManifestSha256, artifactManifestSha256: DIAGNOSTIC_OPERATOR.artifactManifestSha256, immutableEvidenceSha256, credentialValuesPersisted: false, results };
  const evidencePath = path.join(directory, "immutable-access-qualification.json"); atomicWrite(evidencePath, evidence);
  return { passed: true, deploymentIdentifier: deployment.deploymentIdentifier, cases: results.map(result => ({ account: result.account, path: result.restored.path, navigationCount: result.restored.diagnostic.navigations.length, screenshotSha256: result.screenshot.sha256 })), evidenceSha256: sha256(fs.readFileSync(evidencePath)) };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) runAccessQualification().then(result => process.stdout.write(`${JSON.stringify(result)}\n`)).catch(error => { process.stderr.write(`${error.message}\n`); process.exitCode = 1; });
