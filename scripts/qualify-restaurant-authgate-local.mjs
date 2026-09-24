#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

const root = path.resolve(import.meta.dirname, "..");
const dist = path.join(root, "apps/restaurant/dist");
const evidence = path.join(root, "docs/restaurant-authgate-remediation-evidence");
const chromePath = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const serverPort = 4189;
const debugPort = 9361;
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const sha256 = value => crypto.createHash("sha256").update(value).digest("hex");

if (!fs.existsSync(chromePath)) throw new Error("Google Chrome is required for the local AuthGate browser qualification.");
if (!fs.existsSync(path.join(dist, "login.html"))) throw new Error("Export apps/restaurant before running the browser qualification.");
fs.rmSync(evidence, { recursive: true, force: true });
fs.mkdirSync(evidence, { recursive: true, mode: 0o700 });

const mime = file => file.endsWith(".html") ? "text/html; charset=utf-8" : file.endsWith(".css") ? "text/css" : file.endsWith(".js") ? "text/javascript" : file.endsWith(".json") || file.endsWith(".webmanifest") ? "application/json" : file.endsWith(".png") ? "image/png" : "application/octet-stream";
const server = http.createServer((request, response) => {
  let pathname = decodeURIComponent(new URL(request.url, "http://local").pathname);
  if (pathname === "/") pathname = "/index.html";
  else if (!path.extname(pathname)) pathname += ".html";
  const file = path.resolve(dist, `.${pathname}`);
  if (!file.startsWith(`${dist}${path.sep}`)) return response.writeHead(403).end();
  fs.readFile(file, (error, body) => {
    if (error) return response.writeHead(404).end();
    response.writeHead(200, { "Content-Type": mime(file), "Cache-Control": "no-store" });
    response.end(body);
  });
});
await new Promise((resolve, reject) => { server.once("error", reject); server.listen(serverPort, "127.0.0.1", resolve); });

class Cdp {
  constructor(socket) {
    this.socket = socket;
    this.id = 0;
    this.pending = new Map();
    this.listeners = [];
    socket.addEventListener("message", event => {
      const message = JSON.parse(event.data);
      if (message.id) {
        const pending = this.pending.get(message.id);
        if (!pending) return;
        this.pending.delete(message.id);
        message.error ? pending.reject(new Error(message.error.message)) : pending.resolve(message.result);
      } else this.listeners.forEach(listener => listener(message));
    });
  }
  send(method, params = {}) {
    const id = ++this.id;
    this.socket.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => this.pending.set(id, { resolve, reject }));
  }
  on(listener) { this.listeners.push(listener); }
  close() { this.socket.close(); }
}

const profile = fs.mkdtempSync(path.join(os.tmpdir(), "restaurant-authgate-local-"));
const chrome = spawn(chromePath, ["--headless=new", "--disable-gpu", "--no-first-run", "--no-default-browser-check", `--remote-debugging-port=${debugPort}`, `--user-data-dir=${profile}`, "about:blank"], { stdio: "ignore" });
let cdp;
try {
  let version;
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${debugPort}/json/version`);
      if (response.ok) { version = await response.json(); break; }
    } catch {}
    await delay(100);
  }
  if (!version) throw new Error("Chrome did not start.");
  const target = await (await fetch(`http://127.0.0.1:${debugPort}/json/new?about:blank`, { method: "PUT" })).json();
  const socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.addEventListener("open", resolve, { once: true }); socket.addEventListener("error", reject, { once: true }); });
  cdp = new Cdp(socket);
  await Promise.all([cdp.send("Page.enable"), cdp.send("Runtime.enable"), cdp.send("Network.enable"), cdp.send("Fetch.enable", { patterns: [{ urlPattern: "https://*", requestStage: "Request" }] })]);
  await cdp.send("Network.setBlockedURLs", { urls: ["wss://*"] });
  await cdp.send("Page.addScriptToEvaluateOnNewDocument", { source: `
    window.__authGateEvents=[];
    window.addEventListener('error',event=>window.__authGateEvents.push({type:'error',message:String(event.error?.message||event.message)}));
    window.addEventListener('unhandledrejection',event=>window.__authGateEvents.push({type:'rejection',message:String(event.reason?.message||event.reason)}));
    try { delete Navigator.prototype.serviceWorker; } catch {}
  ` });

  const now = Math.floor(Date.now() / 1000);
  const encode = value => Buffer.from(JSON.stringify(value)).toString("base64url");
  const idToken = `${encode({ alg: "RS256", typ: "JWT" })}.${encode({ iss: "https://securetoken.google.com/build-projectId", aud: "build-projectId", auth_time: now, user_id: "local-owner", sub: "local-owner", iat: now, exp: now + 3600, email: "owner@local.invalid", email_verified: true, firebase: { identities: { email: ["owner@local.invalid"] }, sign_in_provider: "password" } })}.local-signature`;
  const requests = [];
  const unexpectedHostedRequests = [];
  const consoleErrors = [];
  const exceptions = [];
  const credentialHeaderNames = new Set(["authorization", "apikey", "cookie", "proxy-authorization", "set-cookie", "x-api-key"]);
  const sanitizeRequest = request => {
    const url = new URL(request.url);
    const headerNames = Object.keys(request.headers || {}).map(name => name.toLowerCase()).sort();
    return {
      method: request.method,
      host: url.host,
      path: url.pathname,
      queryParameterNames: [...new Set(url.searchParams.keys())].sort(),
      headerNames,
      credentialHeaderNames: headerNames.filter(name => credentialHeaderNames.has(name)),
    };
  };
  const redactText = value => String(value)
    .replace(/Bearer\s+[^\s"']+/gi, "Bearer [REDACTED]")
    .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, "[REDACTED_JWT]")
    .replace(/([?&](?:key|apikey|token|password)=)[^&\s]+/gi, "$1[REDACTED]")
    .replace(/local-refresh-token/g, "[REDACTED_TOKEN]");
  const jsonResponse = (requestId, value, status = 200) => cdp.send("Fetch.fulfillRequest", { requestId, responseCode: status, responseHeaders: [{ name: "Content-Type", value: "application/json" }, { name: "Access-Control-Allow-Origin", value: `http://127.0.0.1:${serverPort}` }, { name: "Access-Control-Allow-Methods", value: "GET, POST, OPTIONS" }, { name: "Access-Control-Allow-Headers", value: "authorization, apikey, content-profile, content-type, x-client-info, x-supabase-api-version, x-client-version, x-firebase-client, x-firebase-gmpid" }], body: Buffer.from(JSON.stringify(value)).toString("base64") });
  cdp.on(message => {
    if (message.method === "Runtime.consoleAPICalled" && ["error", "assert"].includes(message.params.type)) consoleErrors.push(message.params.args.map(arg => arg.value || arg.description).join(" "));
    if (message.method === "Runtime.exceptionThrown") exceptions.push(message.params.exceptionDetails.exception?.description || message.params.exceptionDetails.text);
    if (message.method !== "Fetch.requestPaused") return;
    void (async () => {
      const { requestId, request } = message.params;
      const url = new URL(request.url);
      const requestEvidence = sanitizeRequest(request);
      requests.push(requestEvidence);
      if (request.method === "OPTIONS") return jsonResponse(requestId, {});
      if (url.host === "identitytoolkit.googleapis.com" && url.pathname.endsWith("/accounts:signInWithPassword")) {
        return jsonResponse(requestId, { kind: "identitytoolkit#VerifyPasswordResponse", localId: "local-owner", email: "owner@local.invalid", displayName: "Local Owner", idToken, registered: true, refreshToken: "local-refresh-token", expiresIn: "3600" });
      }
      if (url.host === "identitytoolkit.googleapis.com" && url.pathname.endsWith("/accounts:lookup")) {
        return jsonResponse(requestId, { kind: "identitytoolkit#GetAccountInfoResponse", users: [{ localId: "local-owner", email: "owner@local.invalid", emailVerified: true, displayName: "Local Owner", providerUserInfo: [{ providerId: "password", federatedId: "owner@local.invalid", email: "owner@local.invalid" }], validSince: String(now - 60), lastLoginAt: String(Date.now()), createdAt: String(Date.now() - 60000) }] });
      }
      if (url.host === "securetoken.googleapis.com") {
        return jsonResponse(requestId, { access_token: idToken, expires_in: "3600", token_type: "Bearer", refresh_token: "local-refresh-token", id_token: idToken, user_id: "local-owner", project_id: "build-projectId" });
      }
      if (url.host === "build-proof.supabase.co" && url.pathname.endsWith("/rest/v1/rpc/get_my_access_context_v1")) {
        return jsonResponse(requestId, { state: "resolved", profileId: "local-profile", accountType: "restaurant", accountStatus: "active", onboardingStep: "none", restaurantId: "local-restaurant", restaurantRole: "owner", restaurantStatus: "active", acceptingOrders: true });
      }
      if (url.host === "build-proof.supabase.co" && url.pathname.endsWith("/rest/v1/rpc/restaurant_get_dashboard_v1")) {
        return jsonResponse(requestId, { restaurantId: "local-restaurant", role: "owner", restaurant: { name: "Local Qualification Restaurant", lifecycleStatus: "active", acceptingOrders: true, preferredLanguage: "en" }, counts: { pending: 0, active: 0, unreadReviews: 0 }, serverTime: new Date().toISOString() });
      }
      if (url.host === "build-proof.supabase.co" && url.pathname.endsWith("/rest/v1/rpc/restaurant_list_orders_v1")) {
        return jsonResponse(requestId, { items: [], has_more: false, next_cursor: null });
      }
      unexpectedHostedRequests.push(requestEvidence);
      return jsonResponse(requestId, { error: "Blocked by local qualification" }, 599);
    })().catch(error => { exceptions.push(`interceptor: ${error.message}`); });
  });

  const evaluate = async expression => {
    const result = await cdp.send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
    return result.result.value;
  };
  const waitFor = async (expression, label) => {
    for (let attempt = 0; attempt < 300; attempt += 1) {
      if (await evaluate(expression).catch(() => false)) return;
      await delay(20);
    }
    const diagnostic = await evaluate(`({pathname:location.pathname,text:document.body?.innerText?.slice(0,1000),events:window.__authGateEvents,html:document.querySelector('form')?.outerHTML?.slice(0,1500)})`).catch(error => ({ evaluationError: error.message }));
    throw new Error(`Timed out waiting for ${label}: ${JSON.stringify({ diagnostic, requests, consoleErrors, exceptions, unexpectedHostedRequests })}`);
  };

  await cdp.send("Emulation.setDeviceMetricsOverride", { width: 1024, height: 768, deviceScaleFactor: 1, mobile: false });
  await cdp.send("Page.navigate", { url: `http://127.0.0.1:${serverPort}/login` });
  await waitFor("document.readyState==='complete' && !!document.querySelector('form input[type=email]')", "local login form");
  const beforeLogin = await evaluate(`({pathname:location.pathname,protectedMain:Boolean(document.querySelector('.app-shell main')),overlay:Boolean(document.querySelector('.access-overlay'))})`);
  await evaluate(`(()=>{const inputs=document.querySelectorAll('form input');const set=(input,value)=>{const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;setter.call(input,value);input.dispatchEvent(new Event('input',{bubbles:true}));};set(inputs[0],'owner@local.invalid');set(inputs[1],'local-password');document.querySelector('form').requestSubmit();return true})()`);
  await waitFor("location.pathname==='/dashboard' && !!document.querySelector('.app-shell main h1')", "authenticated Dashboard");
  await waitFor("document.body.textContent.includes('Local Qualification Restaurant')", "authoritative local Dashboard data");
  const afterLogin = await evaluate(`({pathname:location.pathname,heading:document.querySelector('.app-shell main h1')?.textContent?.trim(),restaurant:document.body.textContent.includes('Local Qualification Restaurant'),overlay:Boolean(document.querySelector('.access-overlay')),runtimeError:window.__authGateEvents.some(event=>event.message.includes('Restaurant runtime is unavailable'))})`);
  const screenshot = await cdp.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
  const screenshotPath = path.join(evidence, "login-to-dashboard.png");
  fs.writeFileSync(screenshotPath, Buffer.from(screenshot.data, "base64"), { mode: 0o600 });

  await cdp.send("Page.reload", { ignoreCache: true });
  await waitFor("location.pathname==='/dashboard' && !!document.querySelector('.app-shell main h1')", "restored Dashboard session");
  const afterRestore = await evaluate(`({pathname:location.pathname,heading:document.querySelector('.app-shell main h1')?.textContent?.trim(),overlay:Boolean(document.querySelector('.access-overlay')),runtimeError:window.__authGateEvents.some(event=>event.message.includes('Restaurant runtime is unavailable')),events:window.__authGateEvents})`);

  const relevantErrors = [...consoleErrors, ...exceptions].filter(value => !/WebSocket|websocket|ERR_BLOCKED_BY_CLIENT/i.test(value)).map(redactText);
  if (beforeLogin.protectedMain) throw new Error("Protected Dashboard content was visible before login.");
  if (afterLogin.pathname !== "/dashboard" || afterLogin.overlay || afterLogin.runtimeError || !afterLogin.restaurant) throw new Error(`Login-to-Dashboard failed: ${JSON.stringify(afterLogin)}`);
  if (afterRestore.overlay || afterRestore.runtimeError) throw new Error(`Session restoration failed: ${JSON.stringify(afterRestore)}`);
  if (unexpectedHostedRequests.length) throw new Error(`Unexpected hosted requests: ${JSON.stringify(unexpectedHostedRequests)}`);
  if (relevantErrors.some(value => value.includes("Restaurant runtime is unavailable"))) throw new Error(`Runtime exception observed: ${JSON.stringify(relevantErrors)}`);

  const report = {
    generatedAt: new Date().toISOString(),
    baselineCommit: "1dedebe432c29009657aa419ca0dc9f23b98d6c0",
    browser: version.Browser,
    mode: "local static export with CDP-fulfilled synthetic Firebase and Supabase responses; all HTTPS intercepted and WSS blocked",
    viewport: "1024x768",
    beforeLogin,
    afterLogin,
    afterRestore,
    requestInventory: requests,
    unexpectedHostedRequests,
    consoleErrors: relevantErrors,
    screenshot: { file: path.relative(root, screenshotPath), sha256: sha256(fs.readFileSync(screenshotPath)) },
    result: "PASS",
  };
  const reportPath = path.join(evidence, "report.json");
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), { mode: 0o600 });
  console.log(JSON.stringify({ result: report.result, browser: report.browser, beforeLogin, afterLogin, afterRestore, requests: requests.length, unexpectedHostedRequests: unexpectedHostedRequests.length, screenshotSha256: report.screenshot.sha256, reportSha256: sha256(fs.readFileSync(reportPath)) }));
} finally {
  cdp?.close();
  chrome.kill("SIGTERM");
  server.close();
  await delay(200);
  fs.rmSync(profile, { recursive: true, force: true });
}
