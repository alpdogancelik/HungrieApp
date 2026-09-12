import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const secure = path.join(root, "secure");
const state = JSON.parse(fs.readFileSync(path.join(secure, "supabase-projects.local.json"), "utf8"));
const development = state.projects?.development;
if (!development?.ref || !development?.databasePassword || development.name !== "HungrieApp Development" ||
  development.ref === state.projects?.staging?.ref || development.ref === state.projects?.production?.ref) {
  throw new Error("Development environment identity is incomplete or overlaps another environment.");
}
const token = fs.readFileSync(path.join(secure, "supabase-cli-hungrie", "access-token"), "utf8").trim();
if (!token) throw new Error("Development management token is unavailable.");
const destination = path.join(secure, "phase2-development-backup");
fs.mkdirSync(destination, { recursive: true, mode: 0o700 });
fs.chmodSync(destination, 0o700);
const files = [
  { name: "schema.sql", args: [] },
  { name: "data.sql", args: ["--data-only", "--use-copy"] }
];
for (const entry of files) {
  const output = path.join(destination, entry.name);
  const result = spawnSync("supabase", ["db", "dump", "--project-ref", development.ref,
    "--password", development.databasePassword, "--file", output, ...entry.args], {
    cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, SUPABASE_HOME: path.join(secure, "supabase-cli-hungrie"),
      SUPABASE_ACCESS_TOKEN: token }
  });
  if (result.status !== 0 || !fs.existsSync(output) || fs.statSync(output).size < 1024) {
    throw new Error(`Development ${entry.name} dump failed; command output withheld.`);
  }
  fs.chmodSync(output, 0o600);
}
const sha256 = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const manifest = {
  environment: "development", projectRef: development.ref, recordedAt: new Date().toISOString(),
  files: files.map(({ name }) => ({ name, bytes: fs.statSync(path.join(destination, name)).size,
    sha256: sha256(path.join(destination, name)) }))
};
fs.writeFileSync(path.join(destination, "manifest.json"), JSON.stringify(manifest, null, 2), { mode: 0o600 });
console.log(JSON.stringify({ environment: "development", directory: destination,
  files: manifest.files.map(({ name, bytes, sha256 }) => ({ name, bytes, sha256 })) }));
