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

async function qualifyAccount({ accountName, account, expectedPath, directPath, baseUrl, directory, chromePath, port }) {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), `restaurant-alias-diagnostic-${accountName}-`));
  const { processHandle, version, cdp } = await openChrome(chromePath, profile, port);
  try {
    await Promise.all([cdp.send("Page.enable"), cdp.send("Runtime.enable"), cdp.send("Network.enable"), cdp.send("Accessibility.enable")]);
    await cdp.send("Emulation.setDeviceMetricsOverride", { width: 1024, height: 768, deviceScaleFactor: 1, mobile: false });
    await cdp.send("Page.addScriptToEvaluateOnNewDocument", { source: `window.__diagnostic={navigations:[],mutations:0,errors:[],accessResolved:false,protectedBeforeReady:false};for(const key of ['pushState','replaceState']){const original=history[key];history[key]=function(...args){const result=original.apply(this,args);__diagnostic.navigations.push({type:key,path:location.pathname});return result}}addEventListener('popstate',()=>__diagnostic.navigations.push({type:'popstate',path:location.pathname}));addEventListener('error',event=>__diagnostic.errors.push(String(event.error?.message||event.message)));addEventListener('unhandledrejection',event=>__diagnostic.errors.push(String(event.reason?.message||event.reason)));addEventListener('DOMContentLoaded',()=>new MutationObserver(()=>{__diagnostic.mutations++;const main=document.querySelector('.app-shell main');if(main&&!__diagnostic.accessResolved)__diagnostic.protectedBeforeReady=true}).observe(document.body,{subtree:true,childList:true,attributes:true}));` });
    const exceptions = [], consoleErrors = [], failedRequests = [], requests = [];
    cdp.on(message => {
      if (message.method === "Runtime.exceptionThrown") exceptions.push(message.params.exceptionDetails?.exception?.description || message.params.exceptionDetails?.text);
      if (message.method === "Runtime.consoleAPICalled" && ["error", "assert"].includes(message.params.type)) consoleErrors.push(message.params.args.map(value => value.value || value.description || value.type).join(" "));
      if (message.method === "Network.loadingFailed" && !String(message.params.errorText || "").includes("ERR_ABORTED") && message.params.type !== "Other") failedRequests.push({ type: message.params.type, errorText: message.params.errorText });
      if (message.method === "Network.requestWillBeSent") requests.push(sanitizeRequest(message.params.request));
      if (message.method === "Network.responseReceived" && new URL(message.params.response.url).pathname.endsWith("/get_my_access_context_v1")) cdp.send("Runtime.evaluate", { expression: "window.__diagnostic.accessResolved=true" }).catch(() => {});
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
    const errors = [...exceptions, ...consoleErrors, ...authenticated.diagnostic.errors, ...restored.diagnostic.errors];
    const accessRequests = requests.filter(request => request.path.endsWith("/get_my_access_context_v1")).length;
    const earningsRequests = requests.filter(request => /restaurant_(?:get|list)_earnings/i.test(request.path)).length;
    const operationalExpected = expectedPath === "/dashboard";
    if (authenticated.operational !== operationalExpected || restored.operational !== operationalExpected || mainCount !== 1 || failedRequests.length || errors.some(value => /maximum update|React error #185|runtime is unavailable/i.test(value)) || authenticated.diagnostic.navigations.length > 8 || restored.diagnostic.navigations.length > 8 || authenticated.diagnostic.protectedBeforeReady || restored.diagnostic.protectedBeforeReady || (accountName === "manager" && (authenticated.earningsLink || restored.earningsLink || earningsRequests))) throw new Error(`${accountName} immutable access qualification failed.`);
    const screenshot = await cdp.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
    const screenshotName = `immutable-${accountName}-access.png`, screenshotPath = path.join(directory, screenshotName);
    fs.writeFileSync(screenshotPath, Buffer.from(screenshot.data, "base64"), { mode: 0o600 });
    return { passed: true, account: accountName, browser: version.Browser, expectedPath, directPath, authenticated, restored, mainCount, accessRequests, earningsRequests, uncaughtErrors: errors, failedRequests, requestInventory: requests, screenshot: { file: screenshotName, sha256: sha256(fs.readFileSync(screenshotPath)) } };
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
