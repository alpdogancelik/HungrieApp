import { spawn, spawnSync } from "node:child_process";

const container = "supabase_db_hungrie-app";
const actor = `concurrent-${process.pid}-${Date.now()}`;
const operation = "concurrency-proof";
const limit = 5;

const run = (sql) => {
  const result = spawnSync("docker", ["exec", "-i", container, "psql", "-U", "postgres", "-v", "ON_ERROR_STOP=1", "-At"], {
    input: sql,
    encoding: "utf8",
  });
  if (result.status !== 0) throw new Error(String(result.stderr || "Local SQL failed").trim());
  return String(result.stdout || "").trim();
};

const consume = () => new Promise((resolve) => {
  const child = spawn("docker", ["exec", "-i", container, "psql", "-U", "postgres", "-v", "ON_ERROR_STOP=1", "-At"], {
    stdio: ["pipe", "pipe", "pipe"],
  });
  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (chunk) => { stdout += chunk; });
  child.stderr.on("data", (chunk) => { stderr += chunk; });
  child.on("close", (code) => resolve({ code, stdout: stdout.trim(), stderr: stderr.trim() }));
  child.stdin.end(`select private.consume_abuse_quota('${actor}','${operation}',${limit},60);`);
});

try {
  const results = await Promise.all(Array.from({ length: 20 }, consume));
  const failures = results.filter(({ code }) => code !== 0);
  if (failures.length) throw new Error(failures.map(({ stderr }) => stderr).join("\n"));
  const accepted = results.filter(({ stdout }) => stdout === "t").length;
  const denied = results.filter(({ stdout }) => stdout === "f").length;
  if (accepted !== limit || denied !== 20 - limit) {
    throw new Error(`Expected ${limit} accepted and ${20 - limit} denied; received ${accepted} and ${denied}.`);
  }
  process.stdout.write("Concurrent durable abuse limiter test passed.\n");
} finally {
  run(`delete from private.api_abuse_limits where actor_hash=encode(extensions.digest('${actor}','sha256'),'hex') and operation='${operation}';`);
}
