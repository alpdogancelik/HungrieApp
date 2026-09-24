#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { spawn } from "node:child_process";
import { phase5Scenarios, renderPhase5Scenario } from "../apps/restaurant/test/qualification/phase5Adapter.mjs";

const root = path.resolve(import.meta.dirname, "..");
const evidence = path.join(root, "docs/restaurant-responsive-ui-phase5-evidence/safari-desktop");
const cssDirectory = path.join(root, "apps/restaurant/src/design");
const webPort = Number(process.env.PHASE5_SAFARI_WEB_PORT || 4185);
const driverPort = Number(process.env.PHASE5_SAFARI_DRIVER_PORT || 9357);
const driverOrigin = `http://127.0.0.1:${driverPort}`;
const delay = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

fs.rmSync(evidence, { recursive: true, force: true });
fs.mkdirSync(evidence, { recursive: true, mode: 0o700 });

const server = http.createServer((request, response) => {
  const url = new URL(request.url, "http://local");
  if (url.pathname.startsWith("/phase5-assets/")) {
    const file = path.join(cssDirectory, path.basename(url.pathname));
    if (!file.startsWith(`${cssDirectory}${path.sep}`) || !fs.existsSync(file)) return response.writeHead(404).end();
    response.setHeader("Content-Type", "text/css; charset=utf-8");
    return response.end(fs.readFileSync(file));
  }
  const scenario = url.searchParams.get("scenario") || "dashboard";
  const locale = url.searchParams.get("locale") === "tr" ? "tr" : "en";
  if (!phase5Scenarios.includes(scenario)) return response.writeHead(404).end();
  response.setHeader("Content-Type", "text/html; charset=utf-8");
  response.end(renderPhase5Scenario(scenario, locale));
});

await new Promise((resolve, reject) => {
  server.once("error", reject);
  server.listen(webPort, "127.0.0.1", resolve);
});

let driver;
let sessionId;
const request = async (method, endpoint, body) => {
  const response = await fetch(`${driverOrigin}${endpoint}`, {
    method,
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.value?.error) throw new Error(`${method} ${endpoint}: ${JSON.stringify(payload.value || payload)}`);
  return payload.value;
};

try {
  driver = spawn("safaridriver", ["-p", String(driverPort)], { stdio: "ignore" });
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try {
      const status = await fetch(`${driverOrigin}/status`);
      if (status.ok) break;
    } catch {}
    await delay(100);
  }
  const session = await request("POST", "/session", {
    capabilities: { alwaysMatch: { browserName: "safari", "safari:automaticInspection": false, "safari:automaticProfiling": false } },
  });
  sessionId = session.sessionId;
  const base = `/session/${sessionId}`;
  const execute = script => request("POST", `${base}/execute/sync`, { script, args: [] });
  const navigate = async (scenario, locale) => {
    await request("POST", `${base}/url`, { url: `http://127.0.0.1:${webPort}/?scenario=${encodeURIComponent(scenario)}&locale=${locale}` });
    for (let attempt = 0; attempt < 100; attempt += 1) {
      if (await execute("return document.readyState === 'complete' && !!document.querySelector('main h1')").catch(() => false)) return;
      await delay(25);
    }
    const state = await execute("return {url:location.href,state:document.readyState,title:document.title,body:document.body?.innerText?.slice(0,200),main:Boolean(document.querySelector('main')),h1:Boolean(document.querySelector('main h1'))}").catch(error => ({ executeError: error.message }));
    throw new Error(`Page did not load: ${scenario}-${locale}: ${JSON.stringify(state)}`);
  };
  const setViewport = async (width, height) => {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const inner = await execute("return {width: innerWidth, height: innerHeight}");
      const rect = await request("GET", `${base}/window/rect`);
      await request("POST", `${base}/window/rect`, {
        x: 0,
        y: 0,
        width: Math.max(320, Math.round(rect.width + width - inner.width)),
        height: Math.max(500, Math.round(rect.height + height - inner.height)),
      });
      await delay(100);
    }
    const actual = await execute("return {width: innerWidth, height: innerHeight}");
    if (Math.abs(actual.width - width) > 1 || Math.abs(actual.height - height) > 1) {
      throw new Error(`Could not set Safari viewport ${width}x${height}; got ${actual.width}x${actual.height}`);
    }
    return actual;
  };
  const audit = () => execute(`
    const visible=e=>{const s=getComputedStyle(e),r=e.getBoundingClientRect();return s.display!=='none'&&s.visibility!=='hidden'&&r.width>0&&r.height>0};
    const controls=[...document.querySelectorAll('button,a,input,select,textarea,[role="switch"]')].filter(visible);
    const headings=[...document.querySelectorAll('main h1,main h2,main h3,main h4,main h5,main h6')].filter(visible).map(e=>Number(e.tagName.slice(1)));
    const labels=[...document.querySelectorAll('input,select,textarea')].filter(e=>visible(e)&&!(e.labels?.length||e.getAttribute('aria-label')||e.getAttribute('aria-labelledby')));
    const parse=v=>{const m=v.match(/[\\d.]+/g)?.map(Number)||[];return[m[0]||0,m[1]||0,m[2]||0,m.length>3?m[3]:1]};
    const luminance=rgb=>{const c=rgb.slice(0,3).map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4});return .2126*c[0]+.7152*c[1]+.0722*c[2]};
    const background=e=>{for(let n=e;n;n=n.parentElement){const c=parse(getComputedStyle(n).backgroundColor);if(c[3]>.01)return c;}return[255,255,255,1]};
    const contrast=[];
    for(const e of document.querySelectorAll('h1,h2,h3,p,small,strong,span,dt,dd,label,button,a,th,td')){
      if(!visible(e)||e.closest('[aria-hidden="true"]')||e.children.length)continue;
      const text=e.textContent?.trim();if(!text)continue;
      const style=getComputedStyle(e);if(Number(style.opacity)<.5)continue;
      const fg=parse(style.color),bg=background(e),a=fg[3],blend=fg.slice(0,3).map((v,i)=>v*a+bg[i]*(1-a)),l1=luminance(blend),l2=luminance(bg),ratio=(Math.max(l1,l2)+.05)/(Math.min(l1,l2)+.05),large=parseFloat(style.fontSize)>=24||(parseFloat(style.fontSize)>=18.66&&Number(style.fontWeight)>=700),required=large?3:4.5;
      contrast.push({tag:e.tagName,text:text.slice(0,40),ratio:+ratio.toFixed(2),required});
    }
    const dialog=document.querySelector('[role="dialog"]');
    return {
      width:innerWidth,height:innerHeight,documentWidth:document.documentElement.scrollWidth,
      horizontalOverflow:document.documentElement.scrollWidth>innerWidth+1,
      mainLandmarks:document.querySelectorAll('main').length,visibleH1:document.querySelectorAll('main h1').length,
      headingOrderValid:headings.every((value,index)=>index===0?value===1:value<=headings[index-1]+1),unlabelled:labels.length,
      smallTargets:controls.filter(e=>{const r=e.getBoundingClientRect();return r.width<44||r.height<44}).map(e=>{const r=e.getBoundingClientRect();return{tag:e.tagName,text:e.textContent?.trim().slice(0,30),width:+r.width.toFixed(1),height:+r.height.toFixed(1)}}),
      badContrast:contrast.filter(x=>x.ratio+0.01<x.required).slice(0,10),minimumContrast:contrast.reduce((min,x)=>Math.min(min,x.ratio),99),
      documentLanguage:document.documentElement.lang,title:document.title,dialog:Boolean(dialog),dialogName:dialog?.getAttribute('aria-labelledby')?document.getElementById(dialog.getAttribute('aria-labelledby'))?.textContent?.trim():null,
      modalBackgroundHidden:dialog?document.querySelector('#root')?.getAttribute('aria-hidden')==='true':true,modalBackgroundInert:dialog?document.querySelector('#root')?.inert===true:true,
      focusInsideDialog:dialog?Boolean(document.activeElement?.closest('[role="dialog"]')):true,
      bottomClearance:innerWidth<1024?(document.querySelector('.app-content')?parseFloat(getComputedStyle(document.querySelector('.app-content')).paddingBottom)>=96:true):true,
      stickyOpaque:[...document.querySelectorAll('.app-topbar,.app-bottom-nav,.order-actions')].filter(visible).every(e=>getComputedStyle(e).backgroundColor!=='rgba(0, 0, 0, 0)'),
      liveRegions:[...document.querySelectorAll('[role="status"],[role="alert"],[aria-live]')].filter(visible).map(e=>({role:e.getAttribute('role'),live:e.getAttribute('aria-live'),text:e.textContent?.trim().slice(0,80)})),
    };
  `);
  const assertAudit = (label, metrics, expectedLocale) => {
    const failure = metrics.horizontalOverflow || metrics.mainLandmarks !== 1 || metrics.visibleH1 !== 1 || !metrics.headingOrderValid || metrics.unlabelled || metrics.smallTargets.length || metrics.badContrast.length || metrics.documentLanguage !== expectedLocale || !metrics.modalBackgroundHidden || !metrics.modalBackgroundInert || !metrics.focusInsideDialog || !metrics.bottomClearance || !metrics.stickyOpaque;
    if (failure) throw new Error(`${label}: ${JSON.stringify(metrics)}`);
  };

  const browser = `${session.capabilities.browserName} ${session.capabilities.browserVersion} on ${session.capabilities.platformName} ${session.capabilities["safari:platformVersion"]}`;
  const viewports = [{ name: "1024x768", width: 1024, height: 768 }, { name: "1440x900", width: 1440, height: 900 }];
  const captures = [], semanticAudits = [];
  for (const locale of ["en", "tr"]) {
    for (const viewport of viewports) {
      await setViewport(viewport.width, viewport.height);
      for (const scenario of phase5Scenarios) {
        await navigate(scenario, locale);
        const metrics = await audit();
        assertAudit(`${scenario}-${viewport.name}-${locale}`, metrics, locale);
        const png = await request("GET", `${base}/screenshot`);
        const file = path.join(evidence, `${scenario}-${viewport.name}-${locale}.png`);
        fs.writeFileSync(file, Buffer.from(png, "base64"), { mode: 0o600 });
        captures.push({ scenario, locale, viewport, metrics, file: path.relative(root, file), sha256: crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex") });
        semanticAudits.push({ scenario, locale, viewport: viewport.name, main: metrics.mainLandmarks, heading: metrics.visibleH1, dialogName: metrics.dialogName, liveRegions: metrics.liveRegions });
      }
    }
  }

  const boundaries = [];
  for (const width of [767, 768, 1023, 1024]) {
    await setViewport(width, 800);
    await navigate("orders-many", "en");
    const value = await execute(`return {width:innerWidth,sidebar:getComputedStyle(document.querySelector('.app-sidebar')).display,bottomNav:getComputedStyle(document.querySelector('.app-bottom-nav')).display,desktop:getComputedStyle(document.querySelector('.orders-desktop')).display,mobile:getComputedStyle(document.querySelector('.orders-mobile')).display,overflow:document.documentElement.scrollWidth>innerWidth+1}`);
    if (value.overflow) throw new Error(`Safari boundary overflow: ${JSON.stringify(value)}`);
    boundaries.push(value);
  }

  const zoom = [];
  for (const viewport of viewports) {
    const effectiveWidth = Math.max(320, Math.floor(viewport.width / 2));
    await setViewport(effectiveWidth, viewport.height);
    for (const scenario of phase5Scenarios) {
      await navigate(scenario, "tr");
      const metrics = await audit();
      assertAudit(`Safari 200% zoom equivalent ${scenario}-${viewport.name}`, metrics, "tr");
    }
    zoom.push({ viewport: viewport.name, effectiveCssWidth: effectiveWidth, method: "Safari CSS viewport reduced to the width produced by 200% browser zoom", result: "PASS" });
  }

  await setViewport(1024, 900);
  const textScaling = [];
  for (const scenario of phase5Scenarios) {
    await navigate(scenario, "tr");
    await execute("document.documentElement.style.fontSize='200%'; return true");
    const metrics = await audit();
    if (metrics.horizontalOverflow) throw new Error(`Safari 200% text ${scenario}: ${JSON.stringify(metrics)}`);
  }
  textScaling.push({ viewport: "1024x900", scale: "200% root text", result: "PASS" });

  await setViewport(1024, 768);
  await navigate("dashboard", "en");
  await execute("document.querySelector('.skip-link').focus(); return true");
  const skipFocus = await execute("const e=document.activeElement,r=e.getBoundingClientRect();return{text:e.textContent.trim(),visible:e.classList.contains('skip-link')&&r.top>=0}");
  if (!skipFocus.visible) throw new Error(`Safari skip link failed: ${JSON.stringify(skipFocus)}`);

  await navigate("reviews", "en");
  await execute("const e=document.querySelector('[role=tab]');e.focus();e.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true,cancelable:true}));return true");
  const tabKeyboard = await execute("return {selected:document.activeElement?.getAttribute('aria-selected'),text:document.activeElement?.textContent?.trim()}");
  if (tabKeyboard.selected !== "true") throw new Error(`Safari tab keyboard failed: ${JSON.stringify(tabKeyboard)}`);

  await navigate("review-report", "en");
  const focusBeforeEscape = await execute("return {inside:Boolean(document.activeElement?.closest('[role=dialog]')),rootInert:document.querySelector('#root')?.inert===true}");
  await execute("document.activeElement.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}));return true");
  const focusAfterEscape = await execute("return {dialog:Boolean(document.querySelector('[role=dialog]')),mainFocused:document.activeElement?.tagName==='MAIN',rootInert:document.querySelector('#root')?.inert===true}");
  if (!focusBeforeEscape.inside || !focusBeforeEscape.rootInert || focusAfterEscape.dialog || !focusAfterEscape.mainFocused || focusAfterEscape.rootInert) throw new Error(`Safari dialog keyboard failed: ${JSON.stringify({ focusBeforeEscape, focusAfterEscape })}`);

  const manifest = {
    generatedAt: new Date().toISOString(), browser,
    adapter: "apps/restaurant/test/qualification/phase5Adapter.mjs",
    note: "Local Safari WebDriver qualification against the test-only adapter. Synthetic generic data; absent from Expo Router and production bundles. Browser accessibility-tree extraction is not exposed by Safari WebDriver, so this run records computed DOM semantics and modal isolation; accepted full AX-tree evidence is in the Chrome and Edge manifests.",
    captures, boundaries, zoom, textScaling,
    reducedMotion: { result: "PASS", method: "Production CSS source assertion plus Chrome/Edge emulated-media runtime checks; Safari WebDriver does not expose prefers-reduced-motion emulation." },
    keyboard: { skipFocus, tabKeyboard, focusBeforeEscape, focusAfterEscape }, semanticAudits,
  };
  fs.writeFileSync(path.join(evidence, "manifest.json"), JSON.stringify(manifest, null, 2), { mode: 0o600 });
  console.log(JSON.stringify({ browser, screenshots: captures.length, semanticAudits: semanticAudits.length, boundaries, zoom, textScaling, keyboard: manifest.keyboard }));
} finally {
  if (sessionId) await request("DELETE", `/session/${sessionId}`).catch(() => {});
  driver?.kill("SIGTERM");
  server.close();
  await delay(200);
}
