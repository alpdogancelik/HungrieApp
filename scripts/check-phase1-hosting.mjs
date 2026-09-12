import assert from "node:assert/strict";
import fs from "node:fs";
import https from "node:https";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";

const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "hungrie-phase1-tls-"));
let admin;
let server;
try {
  const key = path.join(temporary, "key.pem");
  const certificate = path.join(temporary, "cert.pem");
  const cert = spawnSync("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-keyout", key,
    "-out", certificate, "-days", "1", "-subj", "/CN=localhost"], { stdio: "ignore" });
  if (cert.status !== 0) throw new Error("Local TLS certificate generation failed");
  const dist = path.resolve("apps/restaurant/dist");
  server = https.createServer({ key: fs.readFileSync(key), cert: fs.readFileSync(certificate) }, (request, response) => {
    const pathname = new URL(request.url, "https://localhost").pathname;
    const file = pathname === "/" ? "index.html" : pathname.slice(1);
    if (!new Set(["index.html", "sw.js", "manifest.webmanifest"]).has(file)) {
      response.writeHead(404).end();
      return;
    }
    const mime = file.endsWith(".js") ? "text/javascript" : file.endsWith(".webmanifest") ? "application/manifest+json" : "text/html";
    response.writeHead(200, { "content-type": mime, "cache-control": "no-store" });
    fs.createReadStream(path.join(dist, file)).pipe(response);
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const tlsPort = server.address().port;
  const getTls = (route) => new Promise((resolve, reject) => {
    https.get(`https://localhost:${tlsPort}${route}`, { rejectUnauthorized: false, family: 4 }, (response) => {
      let body = "";
      response.on("data", (chunk) => { body += chunk; });
      response.on("end", () => resolve({ status: response.statusCode, headers: response.headers, body }));
    }).on("error", reject);
  });
  const [home, worker, manifest] = await Promise.all([getTls("/"), getTls("/sw.js"), getTls("/manifest.webmanifest")]);
  assert.equal(home.status, 200);
  assert.equal(worker.status, 200);
  assert.equal(manifest.status, 200);
  assert.match(home.body, /rel="manifest" href="\/manifest\.webmanifest"/);
  assert.match(worker.headers["content-type"], /javascript/);
  assert.equal(JSON.parse(manifest.body).scope, "/");

  const reservation = net.createServer();
  await new Promise((resolve) => reservation.listen(0, "127.0.0.1", resolve));
  const adminPort = reservation.address().port;
  await new Promise((resolve) => reservation.close(resolve));
  admin = spawn(process.execPath, [path.resolve("node_modules/next/dist/bin/next"), "start", "--port", String(adminPort)], {
    cwd: path.resolve("apps/admin-web"), stdio: "ignore"
  });
  let privateResponse;
  for (let attempt = 0; attempt < 40; attempt += 1) {
    if (admin.exitCode !== null) throw new Error("Admin local hosting process exited");
    try {
      privateResponse = await fetch(`http://127.0.0.1:${adminPort}/private`);
      break;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
  assert.ok(privateResponse, "Admin local hosting did not start");
  assert.equal(privateResponse.status, 200);
  assert.match(privateResponse.headers.get("cache-control") || "", /no-store/);
  assert.equal(privateResponse.headers.get("x-content-type-options"), "nosniff");
  assert.equal(privateResponse.headers.get("x-frame-options"), "DENY");
  console.log("Restaurant TLS asset/scope and Admin private-response header checks passed locally.");
} finally {
  admin?.kill();
  server?.close();
  fs.rmSync(temporary, { recursive: true, force: true });
}
