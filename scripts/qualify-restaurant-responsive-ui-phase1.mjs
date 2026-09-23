#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

const root = path.resolve(import.meta.dirname, "..");
const dist = path.join(root, "apps/restaurant/dist");
const evidence = path.join(root, "docs/restaurant-responsive-ui-phase1-evidence/visual");
const chromePath = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
if (!fs.existsSync(chromePath)) throw new Error("Google Chrome is required for Phase 1 visual qualification.");
fs.rmSync(evidence, { recursive: true, force: true });
fs.mkdirSync(evidence, { recursive: true, mode: 0o700 });

const mime = file => file.endsWith(".html") ? "text/html" : file.endsWith(".css") ? "text/css" : file.endsWith(".js") ? "text/javascript" : file.endsWith(".png") ? "image/png" : file.endsWith(".ttf") ? "font/ttf" : "application/octet-stream";
const server = http.createServer((request, response) => {
  let pathname = decodeURIComponent(new URL(request.url, "http://local").pathname);
  if (pathname === "/") pathname = "/index.html";
  else if (!path.extname(pathname)) pathname += ".html";
  const file = path.resolve(dist, `.${pathname}`);
  if (!file.startsWith(dist + path.sep)) { response.writeHead(403).end(); return; }
  fs.readFile(file, (error, body) => {
    if (error) { response.writeHead(404).end(); return; }
    response.setHeader("Content-Type", mime(file));
    response.end(body);
  });
});
await new Promise((resolve, reject) => { server.once("error", reject); server.listen(4181, "127.0.0.1", resolve); });

const delay = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
class Cdp {
  constructor(socket) { this.socket = socket; this.id = 0; this.pending = new Map(); socket.addEventListener("message", event => { const message = JSON.parse(event.data); if (!message.id) return; const pending = this.pending.get(message.id); if (!pending) return; this.pending.delete(message.id); message.error ? pending.reject(new Error(message.error.message)) : pending.resolve(message.result); }); }
  send(method, params = {}) { const id = ++this.id; this.socket.send(JSON.stringify({ id, method, params })); return new Promise((resolve, reject) => this.pending.set(id, { resolve, reject })); }
  close() { this.socket.close(); }
}

const profile = fs.mkdtempSync(path.join(os.tmpdir(), "restaurant-ui-phase1-chrome-"));
const chrome = spawn(chromePath, ["--headless=new", "--disable-gpu", "--no-first-run", "--no-default-browser-check", "--remote-debugging-port=9341", `--user-data-dir=${profile}`, "about:blank"], { stdio: "ignore" });
let cdp;
try {
  let version;
  for (let attempt = 0; attempt < 80; attempt += 1) { try { const result = await fetch("http://127.0.0.1:9341/json/version"); if (result.ok) { version = await result.json(); break; } } catch {} await delay(100); }
  if (!version) throw new Error("Chrome did not start.");
  const target = await (await fetch("http://127.0.0.1:9341/json/new?about:blank", { method: "PUT" })).json();
  const socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.addEventListener("open", resolve, { once: true }); socket.addEventListener("error", reject, { once: true }); });
  cdp = new Cdp(socket);
  await Promise.all([cdp.send("Page.enable"), cdp.send("Runtime.enable")]);

  const evaluate = async expression => { const result = await cdp.send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true }); if (result.exceptionDetails) throw new Error(result.exceptionDetails.text); return result.result.value; };
  const waitFor = async (expression, label) => { for (let attempt = 0; attempt < 120; attempt += 1) { if (await evaluate(expression).catch(() => false)) return; await delay(100); } throw new Error(`Timed out waiting for ${label}`); };
  const navigate = async url => { await cdp.send("Page.navigate", { url }); await waitFor("document.readyState === 'complete'", url); };
  const viewports = [{ name: "360x800", width: 360, height: 800 }, { name: "390x844", width: 390, height: 844 }, { name: "768x1024", width: 768, height: 1024 }, { name: "1024x768", width: 1024, height: 768 }, { name: "1440x900", width: 1440, height: 900 }];
  const routes = ["login", "forgot-password", "invite"];
  const captures = [];
  const layout = () => evaluate(`(() => { const interactive=[...document.querySelectorAll('button,a,input,select,textarea')].filter(element=>{const style=getComputedStyle(element),rect=element.getBoundingClientRect();return style.visibility!=='hidden'&&style.display!=='none'&&rect.width>0&&rect.height>0}); return {innerWidth,documentWidth:document.documentElement.scrollWidth,horizontalOverflow:document.documentElement.scrollWidth>innerWidth+1,mainLandmarks:document.querySelectorAll('main').length,navigationLandmarks:document.querySelectorAll('nav').length,currentLinks:document.querySelectorAll('[aria-current="page"]').length,unlabelled:[...document.querySelectorAll('input,select,textarea')].filter(element=>!(element.labels?.length||element.getAttribute('aria-label')||element.getAttribute('aria-labelledby'))).length,smallTargets:interactive.filter(element=>{const rect=element.getBoundingClientRect();return rect.width<44||rect.height<44}).map(element=>({tag:element.tagName,text:element.textContent?.trim().slice(0,40),width:Math.round(element.getBoundingClientRect().width),height:Math.round(element.getBoundingClientRect().height)}))}; })()`);
  const shot = async name => { const result = await cdp.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false }); const file = path.join(evidence, `${name}.png`); fs.writeFileSync(file, Buffer.from(result.data, "base64"), { mode: 0o600 }); return { file: path.relative(root, file), sha256: crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex") }; };

  for (const locale of ["en", "tr"]) {
    await navigate("http://127.0.0.1:4181/login");
    await evaluate(`localStorage.setItem('hungrie-restaurant-locale',${JSON.stringify(locale)})`);
    for (const viewport of viewports) {
      await cdp.send("Emulation.setDeviceMetricsOverride", { width: viewport.width, height: viewport.height, deviceScaleFactor: 1, mobile: viewport.width < 768 });
      for (const route of routes) {
        await navigate(`http://127.0.0.1:4181/${route}${route === "invite" ? "?token=local-visual-evidence" : ""}`);
        await waitFor("!!document.querySelector('h1')", `${route} heading`);
        await delay(100);
        const metrics = await layout();
        if (metrics.mainLandmarks !== 1) throw new Error(`${route} must expose exactly one main landmark.`);
        const screenshot = await shot(`${route}-${viewport.name}-${locale}`);
        captures.push({ kind: "route", route, locale, viewport, metrics, ...screenshot });
      }

      const tr = locale === "tr";
      const labels = tr ? { dashboard: "Genel Bakış", orders: "Canlı siparişler", history: "Geçmiş", menu: "Menü", restaurant: "Restoran", reviews: "Değerlendirmeler", alerts: "Uyarılar", security: "Güvenlik", more: "Daha Fazla", status: "Canlı güncellemeler bağlı", workspace: "Çalışma Alanı" } : { dashboard: "Dashboard", orders: "Live orders", history: "History", menu: "Menu", restaurant: "Restaurant", reviews: "Reviews", alerts: "Alerts", security: "Security", more: "More", status: "Live updates connected", workspace: "Workspace" };
      await evaluate(`document.getElementById('root').innerHTML=${JSON.stringify(`<div class="app-shell"><a class="skip-link" href="#main-content">Skip</a><aside class="app-sidebar"><div class="app-brand"><span class="app-brand__mark">H</span><span><strong>Hungrie</strong><small>Restaurant</small></span></div><nav aria-label="Primary"><p class="app-nav__label">${labels.workspace}</p>${[["dashboard",labels.dashboard],["orders",labels.orders],["history",labels.history],["menu",labels.menu],["restaurant",labels.restaurant],["reviews",labels.reviews],["settings",labels.alerts],["security",labels.security]].map(([href,label],index)=>`<a class="app-nav-link" ${index===0?"data-active=true aria-current=page":""} href="#${href}"><span>□</span><span>${label}</span></a>`).join("")}</nav><div class="app-sidebar__footer"><span class="app-avatar">AY</span><span class="app-account"><strong>owner@example.test</strong><small>Owner</small></span><button class="app-icon-button app-icon-button--dark" aria-label="Sign out">↪</button></div></aside><div class="app-main"><header class="app-topbar"><div class="app-topbar__identity"><strong>Phase 5 Staging Pilot</strong><span class="runtime-status runtime-status--connected">● ${labels.status}</span></div><a class="app-icon-button" href="#alerts" aria-label="${labels.alerts}">♧</a><button class="app-language" aria-label="Language">${locale.toUpperCase()}</button></header><main id="main-content" class="app-content"><div class="ui-page-header"><div><h1>${labels.dashboard}</h1><p>${tr?"Restoran operasyonlarını yönetin.":"Manage Restaurant operations."}</p></div></div><div class="grid"><div class="ui-card"><h2>${tr?"Sipariş alımı":"Order acceptance"}</h2><p>${tr?"Canlı güncellemeler bağlı.":"Live updates are connected."}</p><button class="ui-button ui-button--primary">${tr?"Açık":"Open"}</button></div><div class="ui-card"><h2>${tr?"Bekleyen siparişler":"Pending orders"}</h2><p>3</p></div></div></main><nav class="app-bottom-nav" aria-label="Mobile">${[[labels.dashboard,"dashboard"],[labels.orders,"orders"],[labels.menu,"menu"],[labels.more,"more"]].map(([label,key],index)=>`<a class="app-bottom-link" ${index===0?"data-active=true aria-current=page":""} href="#${key}"><span class="app-bottom-link__icon">□</span><span>${label}</span></a>`).join("")}</nav></div></div>`)}`);
      const metrics = await layout();
      if (metrics.mainLandmarks !== 1 || metrics.navigationLandmarks !== 2 || metrics.currentLinks !== 2) throw new Error(`Shell landmark/current-route contract failed: ${JSON.stringify(metrics)}`);
      const screenshot = await shot(`shell-${viewport.name}-${locale}`);
      captures.push({ kind: "shell-style-harness", locale, viewport, metrics, ...screenshot });
    }
  }

  await cdp.send("Emulation.setDeviceMetricsOverride", { width: 512, height: 768, deviceScaleFactor: 1, mobile: false });
  await navigate("http://127.0.0.1:4181/login");
  await waitFor("!!document.querySelector('h1')", "zoom-equivalent login");
  const zoomEquivalent = await layout();
  await cdp.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Tab", code: "Tab", windowsVirtualKeyCode: 9 });
  await cdp.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Tab", code: "Tab", windowsVirtualKeyCode: 9 });
  const keyboardFocus = await evaluate(`(() => { const active=document.activeElement,style=getComputedStyle(active); return {tag:active?.tagName||null,visible:style.outlineStyle!=='none'&&parseFloat(style.outlineWidth)>0}; })()`);
  if (!keyboardFocus.visible) throw new Error(`Keyboard focus is not visibly styled: ${JSON.stringify(keyboardFocus)}`);
  const failures = captures.filter(value => value.metrics.horizontalOverflow || value.metrics.unlabelled || value.metrics.smallTargets.length);
  if (failures.length || zoomEquivalent.horizontalOverflow) throw new Error(`Responsive qualification failed: ${JSON.stringify({ failures, zoomEquivalent })}`);
  const manifest = { generatedAt: new Date().toISOString(), note: "Protected shell captures use a local CSS/semantic markup harness; no application data or hosted environment was accessed. The 512 CSS-pixel pass represents a 1024-pixel viewport at 200% zoom.", captures, zoomEquivalent, keyboardFocus };
  fs.writeFileSync(path.join(evidence, "manifest.json"), JSON.stringify(manifest, null, 2), { mode: 0o600 });
  console.log(JSON.stringify({ screenshots: captures.length, routes: routes.length, viewports: viewports.length, locales: 2, horizontalOverflow: 0, unlabelledFields: 0, smallTargets: 0, zoomEquivalentOverflow: zoomEquivalent.horizontalOverflow }));
} finally {
  cdp?.close();
  chrome.kill("SIGTERM");
  server.close();
  await delay(200);
  fs.rmSync(profile, { recursive: true, force: true });
}
