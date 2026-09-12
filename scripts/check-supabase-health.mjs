import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const environment = process.argv[2];
const webhookFile = process.argv.find((entry) => entry.startsWith("--alert-webhook-file="))?.slice("--alert-webhook-file=".length);
if (!new Set(["staging", "production"]).has(environment)) throw new Error("Choose staging or production.");
const state = JSON.parse(fs.readFileSync(path.join(root, "secure", "supabase-projects.local.json"), "utf8"));
const managementToken = fs.readFileSync(path.join(root, "secure", "supabase-cli-hungrie", "access-token"), "utf8").trim();
const project = state.projects?.[environment];
if (!project?.ref || !project?.publishableKey) throw new Error(`${environment} URL/publishable configuration is unavailable.`);
const url = project.url || `https://${project.ref}.supabase.co`;
let webhook = null;
if (webhookFile) {
  if (!path.isAbsolute(webhookFile) || !fs.existsSync(webhookFile)) throw new Error("Alert webhook must be an existing absolute external file.");
  webhook = fs.readFileSync(webhookFile, "utf8").trim();
}
const withTimeout = (target, init = {}) => fetch(target, { ...init, signal: AbortSignal.timeout(10_000) });
const checkRealtime = () => new Promise((resolve, reject) => {
  const websocketUrl = `${url.replace(/^http/, "ws")}/realtime/v1/websocket?apikey=${encodeURIComponent(project.publishableKey)}&vsn=1.0.0`;
  const socket = new WebSocket(websocketUrl);
  const timer = setTimeout(() => {
    socket.close();
    reject(new Error("realtime-timeout"));
  }, 10_000);
  socket.onopen = () => {
    clearTimeout(timer);
    socket.close();
    resolve(true);
  };
  socket.onerror = () => {
    clearTimeout(timer);
    reject(new Error("realtime-websocket"));
  };
});
const alert = async (reasons) => {
  if (!webhook) return;
  await withTimeout(webhook, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ application: "Hungrie", environment, status: "unhealthy", reasons }) });
};
try {
  const [api] = await Promise.all([
    withTimeout(`${url}/rest/v1/rpc/system_health`, { method: "POST", headers: { apikey: project.publishableKey, authorization: `Bearer ${project.publishableKey}`, "content-type": "application/json" }, body: "{}" }),
    checkRealtime(),
  ]);
  const query = `select
    (select count(*) from private.notification_deliveries where state in ('pending','processing') and next_attempt_at < now() - interval '5 minutes') as notification_backlog,
    (select count(*) from private.notification_deliveries where state='dead_letter' and updated_at > now() - interval '24 hours') as recent_dead_letters,
    coalesce((select extract(epoch from (now()-max(d.end_time)))::bigint from cron.job_run_details d join cron.job j on j.jobid=d.jobid where j.jobname='hungrie-expire-pending-orders' and d.status='succeeded'), 999999) as expiry_age_seconds;`;
  const database = await withTimeout(`https://api.supabase.com/v1/projects/${project.ref}/database/query`, { method: "POST", headers: { authorization: `Bearer ${managementToken}`, "content-type": "application/json" }, body: JSON.stringify({ query }) });
  if (!database.ok) throw new Error("database-management-check");
  const metrics = (await database.json())?.[0];
  const reasons = [];
  if (!api.ok) reasons.push("api");
  if (Number(metrics?.notification_backlog || 0) > 20) reasons.push("notification-backlog");
  if (Number(metrics?.recent_dead_letters || 0) > 0) reasons.push("notification-dead-letter");
  if (Number(metrics?.expiry_age_seconds || 999999) > 180) reasons.push("expiry-stale");
  if (reasons.length) {
    await alert(reasons);
    console.log(JSON.stringify({ environment, healthy: false, reasons, notificationBacklog: Number(metrics?.notification_backlog || 0), recentDeadLetters: Number(metrics?.recent_dead_letters || 0), expiryAgeSeconds: Number(metrics?.expiry_age_seconds || 0) }, null, 2));
    process.exitCode = 1;
  } else {
    console.log(JSON.stringify({ environment, healthy: true, notificationBacklog: 0, recentDeadLetters: 0, expiryWithinSeconds: 180, api: "healthy", realtime: "healthy" }, null, 2));
  }
} catch {
  await alert(["health-check-failed"]);
  console.error(JSON.stringify({ environment, healthy: false, reasons: ["health-check-failed"] }));
  process.exitCode = 1;
}
