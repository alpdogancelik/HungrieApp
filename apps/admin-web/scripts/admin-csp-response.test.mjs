import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const nextBin = path.resolve(root, "../../node_modules/next/dist/bin/next");
const routes = [
  "/login", "/dashboard", "/accounts", "/restaurants", "/restaurants/csp-test",
  "/orders", "/incidents", "/audit", "/reviews", "/security", "/invite/csp-test",
  "/onboarding/mfa", "/suspended", "/missing-csp-test",
];

const reservePort = () => new Promise((resolve, reject) => {
  const server = net.createServer();
  server.unref();
  server.on("error", reject);
  server.listen(0, "127.0.0.1", () => {
    const address = server.address();
    server.close(() => resolve(address.port));
  });
});

const nonceFromPolicy = (policy) => policy.match(/(?:^|\s)'nonce-([a-f0-9]{32})'(?:\s|;|$)/)?.[1];
const scriptTags = (html) => html.match(/<script\b[^>]*>/g) || [];
const nonceFromTag = (tag) => tag.match(/\bnonce=["']([^"']+)["']/)?.[1];
const fetchFromServer = async (url) => {
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      return await fetch(url);
    } catch (error) {
      lastError = error;
      assert.equal(child.exitCode, null, `Admin server exited during request.\n${output}`);
      if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
  throw lastError;
};

const port = await reservePort();
const child = spawn(process.execPath, [nextBin, "start", "--hostname", "127.0.0.1", "--port", String(port)], {
  cwd: root,
  env: { ...process.env, NODE_ENV: "production" },
  stdio: ["ignore", "pipe", "pipe"],
});

let output = "";
child.stdout.on("data", (chunk) => { output += chunk; });
child.stderr.on("data", (chunk) => { output += chunk; });

try {
  const deadline = Date.now() + 15_000;
  while (!output.includes("Ready")) {
    assert(Date.now() < deadline, `Admin server did not become ready.\n${output}`);
    assert.equal(child.exitCode, null, `Admin server exited early.\n${output}`);
    await new Promise((resolve) => setTimeout(resolve, 50));
  }

  const observed = [];
  for (const route of routes) {
    const response = await fetchFromServer(`http://127.0.0.1:${port}${route}`);
    const html = await response.text();
    const policy = response.headers.get("content-security-policy") || "";
    const nonce = nonceFromPolicy(policy);
    const scripts = scriptTags(html);

    assert(nonce, `${route}: response CSP must contain one valid nonce`);
    assert(!policy.includes("script-src 'self' 'unsafe-inline'"), `${route}: script unsafe-inline must be absent`);
    assert(!policy.includes("'unsafe-eval'"), `${route}: unsafe-eval must be absent in Production`);
    assert(!/script-src[^;]*\s\*/.test(policy), `${route}: script wildcard must be absent`);
    assert(!/connect-src[^;]*\s\*/.test(policy), `${route}: connect wildcard must be absent`);
    assert(!/(localhost|127\.0\.0\.1)/.test(policy), `${route}: development origins must be absent`);
    assert(policy.includes("https://content-firebaseappcheck.googleapis.com"), `${route}: App Check exchange endpoint must remain allowed`);
    assert(policy.includes("https://identitytoolkit.googleapis.com"), `${route}: Firebase Auth endpoint must remain allowed`);
    assert(policy.includes("https://securetoken.googleapis.com"), `${route}: Firebase token refresh endpoint must remain allowed`);
    assert(/https:\/\/us-central1-[a-z0-9-]+\.cloudfunctions\.net/.test(policy), `${route}: exact Firebase callable origin must remain allowed`);
    assert(/https:\/\/[a-z0-9]+\.supabase\.co/.test(policy), `${route}: exact Supabase origin must remain allowed`);
    assert.match(response.headers.get("cache-control") || "", /private[^\r\n]*no-store|no-store[^\r\n]*private/, `${route}: document must not be publicly cached`);
    assert.equal(response.headers.get("x-frame-options"), "DENY", `${route}: legacy anti-framing header must remain`);
    assert(scripts.length > 0, `${route}: expected Next bootstrap scripts`);
    assert(scripts.every((tag) => nonceFromTag(tag) === nonce), `${route}: every generated script must carry the response nonce`);
    observed.push({ route, nonce, status: response.status, scripts: scripts.length });
  }

  const first = await fetchFromServer(`http://127.0.0.1:${port}/login`);
  const second = await fetchFromServer(`http://127.0.0.1:${port}/login`);
  const firstNonce = nonceFromPolicy(first.headers.get("content-security-policy") || "");
  const secondNonce = nonceFromPolicy(second.headers.get("content-security-policy") || "");
  assert.notEqual(firstNonce, secondNonce, "consecutive responses must use different nonces");

  // With no unsafe-inline or matching hash, a hypothetical nonce-less inline
  // script is not a source expression authorized by this policy.
  const policy = first.headers.get("content-security-policy") || "";
  const scriptDirective = policy.split(";").find((directive) => directive.trim().startsWith("script-src")) || "";
  assert(!scriptDirective.includes("'unsafe-inline'"));
  assert(!scriptDirective.includes("'sha256-"));

  console.log(JSON.stringify({ passed: true, routes: observed, consecutiveNoncesDiffer: true }, null, 2));
} finally {
  child.kill("SIGTERM");
  await new Promise((resolve) => child.once("exit", resolve));
}
