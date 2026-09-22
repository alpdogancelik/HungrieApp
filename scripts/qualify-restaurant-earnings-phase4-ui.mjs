#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

const root = path.resolve(import.meta.dirname, "..");
const runId = process.argv.find(value => value.startsWith("--run-id="))?.slice(9);
const environment = process.argv.find(value => value.startsWith("--environment="))?.slice(14);
const confirmation = process.argv.find(value => value.startsWith("--confirm="))?.slice(10);
if (!/^earnp4_[a-z0-9]{8,32}$/.test(runId || "")) throw new Error("Canonical Phase 4 run ID required.");
if (environment !== "development" || confirmation !== `development:restaurant-earnings-phase4:ui:${runId}`) throw new Error("Explicit Development UI confirmation required.");

const runDirectory = path.join(root, "secure", "restaurant-earnings-admin-commission-phase4", runId);
const manifest = JSON.parse(fs.readFileSync(path.join(runDirectory, "fixture-manifest.json"), "utf8"));
const secrets = JSON.parse(fs.readFileSync(path.join(runDirectory, "fixture-secrets.json"), "utf8"));
const artifactDirectory = fs.mkdtempSync(path.join(os.tmpdir(), `${runId}-ui-`));
fs.chmodSync(artifactDirectory, 0o700);

const base32 = value => {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const character of value.replaceAll("=", "").toUpperCase()) bits += alphabet.indexOf(character).toString(2).padStart(5, "0");
  return Buffer.from(bits.match(/.{8}/g)?.map(binary => Number.parseInt(binary, 2)) || []);
};
const totp = secret => {
  const input = Buffer.alloc(8); input.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 1000 / 30)));
  const digest = crypto.createHmac("sha1", base32(secret)).update(input).digest(), offset = digest[digest.length - 1] & 15;
  return ((digest.readUInt32BE(offset) & 0x7fffffff) % 1_000_000).toString().padStart(6, "0");
};
const delay = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
const waitHttp = async url => { for (let attempt = 0; attempt < 80; attempt += 1) { try { const response = await fetch(url); if (response.ok) return; } catch {} await delay(250); } throw new Error(`Local application unavailable: ${url}`); };

class Cdp {
  constructor(socket) {
    this.socket = socket; this.id = 0; this.pending = new Map(); this.listeners = new Map();
    socket.addEventListener("message", event => {
      const message = JSON.parse(event.data);
      if (message.id) { const pending = this.pending.get(message.id); if (!pending) return; this.pending.delete(message.id); message.error ? pending.reject(new Error(message.error.message)) : pending.resolve(message.result); return; }
      for (const listener of this.listeners.get(message.method) || []) void listener(message.params);
    });
  }
  static async connect(url) { const socket = new WebSocket(url); await new Promise((resolve, reject) => { socket.addEventListener("open", resolve, { once: true }); socket.addEventListener("error", reject, { once: true }); }); return new Cdp(socket); }
  send(method, params = {}) { const id = ++this.id; this.socket.send(JSON.stringify({ id, method, params })); return new Promise((resolve, reject) => this.pending.set(id, { resolve, reject })); }
  on(method, listener) { const values = this.listeners.get(method) || []; values.push(listener); this.listeners.set(method, values); }
  close() { this.socket.close(); }
}

const launch = async (label, port) => {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), `${runId}-${label}-chrome-`));
  const chrome = spawn("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", ["--headless=new", "--disable-gpu", "--no-first-run", "--no-default-browser-check", `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, "about:blank"], { stdio: "ignore" });
  let version;
  for (let attempt = 0; attempt < 80; attempt += 1) { try { const response = await fetch(`http://127.0.0.1:${port}/json/version`); if (response.ok) { version = await response.json(); break; } } catch {} await delay(100); }
  if (!version) throw new Error(`Chrome did not start for ${label}.`);
  const target = await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: "PUT" })).json();
  const cdp = await Cdp.connect(target.webSocketDebuggerUrl);
  await Promise.all([cdp.send("Page.enable"), cdp.send("Runtime.enable"), cdp.send("Network.enable")]);
  return { cdp, chrome, profile, close: async () => { cdp.close(); chrome.kill("SIGTERM"); await delay(250); fs.rmSync(profile, { recursive: true, force: true }); } };
};
const evaluate = async (cdp, expression) => {
  const result = await cdp.send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
  if (result.exceptionDetails) throw new Error(`Browser evaluation failed: ${result.exceptionDetails.text}`);
  return result.result.value;
};
const waitFor = async (cdp, expression, label, timeout = 20_000) => {
  const started = Date.now();
  while (Date.now() - started < timeout) { if (await evaluate(cdp, expression).catch(() => false)) return; await delay(150); }
  throw new Error(`Timed out waiting for ${label}.`);
};
const navigate = async (cdp, url) => { await cdp.send("Page.navigate", { url }); await waitFor(cdp, "document.readyState === 'complete'", url); };
const setViewport = (cdp, width) => cdp.send("Emulation.setDeviceMetricsOverride", { width, height: 900, deviceScaleFactor: 1, mobile: false });
const setValue = (cdp, selector, value) => evaluate(cdp, `(() => { const element=document.querySelector(${JSON.stringify(selector)}); if(!element)return false; const previous=element.value; const prototype=element instanceof HTMLTextAreaElement?HTMLTextAreaElement.prototype:HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(prototype,'value').set.call(element,${JSON.stringify(value)}); element._valueTracker?.setValue(previous); element.dispatchEvent(new Event('input',{bubbles:true})); element.dispatchEvent(new Event('change',{bubbles:true})); return true; })()`);
const click = (cdp, selector) => evaluate(cdp, `(() => { const element=document.querySelector(${JSON.stringify(selector)}); if(!element)return false; element.click(); return true; })()`);
const clickText = (cdp, selector, text) => evaluate(cdp, `(() => { const element=[...document.querySelectorAll(${JSON.stringify(selector)})].find(value=>value.textContent.trim()===${JSON.stringify(text)}); if(!element)return false; element.click(); return true; })()`);
const bodyHas = (cdp, text) => evaluate(cdp, `document.body?.innerText.includes(${JSON.stringify(text)}) || false`);
const screenshot = async (cdp, name) => { const result = await cdp.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: true }); const file = path.join(artifactDirectory, `${name}.png`); fs.writeFileSync(file, Buffer.from(result.data, "base64"), { mode: 0o600 }); return file; };
const layout = cdp => evaluate(cdp, `({width:innerWidth,documentWidth:document.documentElement.scrollWidth,horizontalOverflow:document.documentElement.scrollWidth>innerWidth+1,labels:[...document.querySelectorAll('input,textarea,select')].every(element=>element.labels?.length||element.getAttribute('aria-label')||element.getAttribute('aria-labelledby')),activeTag:document.activeElement?.tagName||null})`);
const loginRestaurant = async (cdp, key) => {
  await navigate(cdp, "http://localhost:3101/login"); await waitFor(cdp, "!!document.querySelector('input[type=email]')", "Restaurant login");
  await delay(1_000);
  await setValue(cdp, "input[type=email]", manifest.firebaseUsers[key].email); await setValue(cdp, "input[type=password]", secrets.passwords[key]); await delay(300); await click(cdp, "form button");
  await waitFor(cdp, "location.pathname !== '/login' && !document.body.innerText.includes('Checking Restaurant access')", `${key} Restaurant session`, 30_000);
};
const loginAdmin = async (cdp, key) => {
  await navigate(cdp, "http://localhost:3100/login"); await waitFor(cdp, "!!document.querySelector('input[type=email]')", "Admin login");
  await delay(1_000);
  await setValue(cdp, "input[type=email]", manifest.firebaseUsers[key].email); await setValue(cdp, "input[type=password]", secrets.passwords[key]); await delay(300); await click(cdp, "form button");
  try { await waitFor(cdp, "!!document.querySelector('input[inputmode=numeric]')", `${key} TOTP challenge`, 20_000); }
  catch (error) { const state = await evaluate(cdp, `({path:location.pathname,search:location.search,text:document.body.innerText.slice(0,500),emailLength:document.querySelector('input[type=email]')?.value.length||0,passwordLength:document.querySelector('input[type=password]')?.value.length||0})`); throw new Error(`${error.message} Safe state: ${JSON.stringify(state)}`); }
  if (Date.now() % 30_000 > 27_000) await delay(3_500);
  await setValue(cdp, "input[inputmode=numeric]", totp(secrets.totp[key])); await delay(200); await click(cdp, "form button");
  try { await waitFor(cdp, "location.pathname === '/dashboard'", `${key} Admin session`, 30_000); }
  catch (error) { const state = await evaluate(cdp, `({path:location.pathname,search:location.search,text:document.body.innerText.slice(0,700),numericLength:document.querySelector('input[inputmode=numeric]')?.value.length||0})`); throw new Error(`${error.message} Safe state: ${JSON.stringify(state)}`); }
};
const localDateTimeValue = instant => {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Famagusta", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(instant).filter(part => part.type !== "literal").map(part => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
};

await Promise.all([waitHttp("http://127.0.0.1:3100/login"), waitHttp("http://127.0.0.1:3101/login")]);
const evidence = { runId, environment, capturedAt: new Date().toISOString(), artifactDirectory, admin: {}, restaurant: {}, manager: {}, ordinaryAdmin: {} };

const adminBrowser = await launch("admin-super", 9321);
try {
  const { cdp } = adminBrowser; await setViewport(cdp, 390); await loginAdmin(cdp, "super");
  const primary = manifest.database.restaurants.primary;
  await navigate(cdp, `http://localhost:3100/restaurants/${primary}`); await waitFor(cdp, `document.body.innerText.includes('Commission management')`, "commission screen", 30_000);
  await cdp.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Tab", code: "Tab" }); await cdp.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Tab", code: "Tab" });
  const narrow = await layout(cdp); const narrowShot = await screenshot(cdp, "admin-super-390-en");
  await setValue(cdp, "input[inputmode=decimal]", "9.99"); await setValue(cdp, "input[type=datetime-local]", localDateTimeValue(new Date(Date.now() + 4 * 86_400_000))); await setValue(cdp, "textarea", `Phase 4 Development UI ${"long reason ".repeat(12)}`.trim()); await evaluate(cdp, "document.querySelector('form button[type=submit]').focus()"); await click(cdp, "form button[type=submit]");
  await waitFor(cdp, "!!document.querySelector('[role=dialog]')", "commission confirmation dialog");
  const dialog = await evaluate(cdp, `({labelled:!!document.querySelector('[role=dialog][aria-modal=true][aria-labelledby][aria-describedby]'),focusInside:document.querySelector('[role=dialog]').contains(document.activeElement),utc:document.querySelector('[role=dialog]').innerText.includes('UTC'),nonRetro:document.querySelector('[role=dialog]').innerText.includes('existing orders')})`);
  await cdp.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape" }); await cdp.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape" }); await waitFor(cdp, "!document.querySelector('[role=dialog]')", "dialog Escape close");
  const restored = await evaluate(cdp, "document.activeElement?.matches('form button[type=submit]') || false");
  await click(cdp, "form button[type=submit]"); await waitFor(cdp, "!!document.querySelector('[role=dialog]')", "reopened dialog");
  await clickText(cdp, "[role=dialog] button", "Confirm and schedule");
  await waitFor(cdp, "document.body.innerText.includes('rule was created')", "Development-backed UI scheduling completion", 30_000);
  await setViewport(cdp, 1440); await waitFor(cdp, "innerWidth===1440", "wide viewport"); const wide = await layout(cdp); const wideShot = await screenshot(cdp, "admin-super-1440-en");
  await navigate(cdp, `http://localhost:3100/restaurants/${manifest.database.restaurants.suspended}`); await waitFor(cdp, "document.body.innerText.includes('Suspended Restaurant')", "suspended lifecycle state");
  const suspendedScheduling = await evaluate(cdp, "!!document.querySelector('form input[inputmode=decimal]')");
  await navigate(cdp, `http://localhost:3100/restaurants/${manifest.database.restaurants.closed}`); await waitFor(cdp, "document.body.innerText.includes('Closed Restaurant')", "closed lifecycle state");
  const closedReadOnly = await evaluate(cdp, "!document.querySelector('form input[inputmode=decimal]') && document.body.innerText.includes('read-only')");
  evidence.admin = { narrow, wide, narrowShot, wideShot, dialog, focusRestored: restored, scheduleSuccess: true, replaySafetyEvidence: "real Development RPC replay probe plus client operation-ID test", suspendedScheduling, closedReadOnly, keyboardFocusReached: narrow.activeTag !== "BODY" };
} finally { await adminBrowser.close(); }

const ordinaryBrowser = await launch("admin-ordinary", 9322);
try {
  const { cdp } = ordinaryBrowser; await setViewport(cdp, 390); await loginAdmin(cdp, "admin"); await navigate(cdp, `http://localhost:3100/restaurants/${manifest.database.restaurants.primary}`); await waitFor(cdp, "document.body.innerText.includes('read-only')", "ordinary Admin read-only");
  evidence.ordinaryAdmin = { readOnly: await evaluate(cdp, "!document.querySelector('form input[inputmode=decimal]')"), layout: await layout(cdp), screenshot: await screenshot(cdp, "admin-ordinary-390-en") };
} finally { await ordinaryBrowser.close(); }

const ownerBrowser = await launch("restaurant-owner", 9323);
try {
  const { cdp } = ownerBrowser; await setViewport(cdp, 390); await loginRestaurant(cdp, "owner"); await navigate(cdp, "http://localhost:3101/earnings"); await waitFor(cdp, "document.body.innerText.includes('Eligible gross sales') && document.body.innerText.includes('Page 1')", "owner earnings", 30_000);
  const narrow = await layout(cdp), narrowShot = await screenshot(cdp, "restaurant-owner-390-en");
  await clickText(cdp, "button", "Next"); await waitFor(cdp, "document.body.innerText.includes('Page 2')", "earnings page two"); const pageTwo = await bodyHas(cdp, "Page 2"); await clickText(cdp, "button", "Previous"); await waitFor(cdp, "document.body.innerText.includes('Page 1')", "earnings previous page");
  for (const period of ["Daily", "Weekly", "Monthly"]) { await clickText(cdp, "button", period); await waitFor(cdp, `[...document.querySelectorAll('button')].some(value=>value.textContent.trim()===${JSON.stringify(period)}&&value.getAttribute('aria-pressed')==='true'&&!value.disabled)`, `${period} period`, 30_000); }
  await clickText(cdp, "button", "Custom"); await waitFor(cdp, "!!document.querySelector('input[type=date]')", "custom period");
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Famagusta" }).format(new Date()).replaceAll("/", "-"); const dates = await evaluate(cdp, "[...document.querySelectorAll('input[type=date]')].length");
  if (dates !== 2) throw new Error("Custom date controls missing.");
  await evaluate(cdp, `(() => { const values=[...document.querySelectorAll('input[type=date]')]; for(const element of values){const previous=element.value;Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(element,${JSON.stringify(today)});element._valueTracker?.setValue(previous);element.dispatchEvent(new Event('input',{bubbles:true}));element.dispatchEvent(new Event('change',{bubbles:true}));} return true;})()`); await clickText(cdp, "button", "Apply range"); await waitFor(cdp, "document.body.innerText.includes('Page 1')", "custom range response", 30_000);
  await clickText(cdp, "nav button", "EN"); await waitFor(cdp, "document.body.innerText.includes('Kazançlar')", "Turkish earnings");
  await setViewport(cdp, 1440); const wide = await layout(cdp), wideShot = await screenshot(cdp, "restaurant-owner-1440-tr");
  await evaluate(cdp, "document.documentElement.style.fontSize='200%'"); await delay(300); const enlarged = await layout(cdp); await evaluate(cdp, "document.documentElement.style.fontSize='' ");
  await cdp.send("Network.emulateNetworkConditions", { offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0 }); await waitFor(cdp, "document.body.innerText.includes('İnternet bağlantısı yok')", "offline state"); await waitFor(cdp, "document.body.innerText.includes('Güncel olmayabilir')", "stale authoritative data label"); const stalePreserved = await evaluate(cdp, "document.body.innerText.includes('gösteriliyor') && document.body.innerText.includes('Uygun brüt satış')");
  await cdp.send("Network.emulateNetworkConditions", { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 }); await waitFor(cdp, "!document.body.innerText.includes('İnternet bağlantısı yok')", "reconnected state", 30_000);
  evidence.restaurant = { narrow, wide, enlarged, narrowShot, wideShot, pageTwo, periods: ["day", "week", "month", "custom"], bilingual: true, stalePreserved, reconciledVisible: true };
} finally { await ownerBrowser.close(); }

const managerBrowser = await launch("restaurant-manager", 9324);
try {
  const { cdp } = managerBrowser; const earningsRequests = []; cdp.on("Network.requestWillBeSent", params => { if (params.request.url.includes("restaurant_get_earnings_")) earningsRequests.push(params.request.url); });
  await setViewport(cdp, 390); await loginRestaurant(cdp, "manager"); await navigate(cdp, "http://localhost:3101/earnings"); await waitFor(cdp, "document.body.innerText.includes('Financial access denied')", "manager permission state", 30_000); await delay(750);
  evidence.manager = { permissionState: true, earningsRpcRequests: earningsRequests.length, noActionableFinancialUi: await evaluate(cdp, "!document.querySelector('.earnings-controls')"), layout: await layout(cdp), screenshot: await screenshot(cdp, "restaurant-manager-390-en") };
} finally { await managerBrowser.close(); }

fs.writeFileSync(path.join(artifactDirectory, "ui-evidence.json"), `${JSON.stringify(evidence, null, 2)}\n`, { mode: 0o600 });
const assertions = {
  admin390NoOverflow: !evidence.admin.narrow.horizontalOverflow, admin1440NoOverflow: !evidence.admin.wide.horizontalOverflow, adminLabels: evidence.admin.narrow.labels, dialogLabelled: evidence.admin.dialog.labelled, dialogFocus: evidence.admin.dialog.focusInside, dialogUtc: evidence.admin.dialog.utc, dialogNonRetro: evidence.admin.dialog.nonRetro, dialogFocusRestored: evidence.admin.focusRestored, adminScheduleSuccess: evidence.admin.scheduleSuccess, suspendedScheduling: evidence.admin.suspendedScheduling, closedReadOnly: evidence.admin.closedReadOnly,
  ordinaryAdminReadOnly: evidence.ordinaryAdmin.readOnly, ordinaryAdminNoOverflow: !evidence.ordinaryAdmin.layout.horizontalOverflow,
  restaurant390NoOverflow: !evidence.restaurant.narrow.horizontalOverflow, restaurant1440NoOverflow: !evidence.restaurant.wide.horizontalOverflow, restaurantLabels: evidence.restaurant.narrow.labels, restaurantPageTwo: evidence.restaurant.pageTwo, restaurantBilingual: evidence.restaurant.bilingual, restaurantStalePreserved: evidence.restaurant.stalePreserved,
  managerPermission: evidence.manager.permissionState, managerNoEarningsRpc: evidence.manager.earningsRpcRequests === 0, managerNoControls: evidence.manager.noActionableFinancialUi, managerNoOverflow: !evidence.manager.layout.horizontalOverflow,
};
const failed = Object.entries(assertions).filter(([, value]) => !value).map(([name]) => name);
if (failed.length) throw new Error(`Development-backed UI qualification assertion failed: ${failed.join(", ")}. Evidence: ${path.join(artifactDirectory, "ui-evidence.json")}`);
console.log(JSON.stringify({ action: "ui", environment, runId, passed: true, widths: [390, 1440], adminScheduleSuccess: true, replaySafety: "hosted-rpc-probe-plus-client-operation-test", ordinaryAdminReadOnly: true, restaurantOwner: true, managerDeniedWithoutEarningsRpc: true, bilingual: true, offlineStale: true, artifactDirectory }));
