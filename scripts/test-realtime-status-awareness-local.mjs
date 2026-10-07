#!/usr/bin/env node
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";

const root = new URL("../", import.meta.url).pathname;
const statusResult = spawnSync("supabase", ["status", "-o", "json"], { cwd: root, encoding: "utf8" });
if (statusResult.status !== 0) throw new Error("Local Supabase is not running.");
const status = JSON.parse(statusResult.stdout);
const sql = statement => {
  const result = spawnSync("supabase", ["db", "query", "--local", statement], { cwd: root, encoding: "utf8" });
  if (result.status !== 0) throw new Error(`Local Realtime fixture SQL failed: ${String(result.stdout || result.stderr || result.error || "unknown error").trim()}`);
};
const base64url = value => Buffer.from(JSON.stringify(value)).toString("base64url");
const now = Math.floor(Date.now() / 1000);
const header = base64url({ alg: "HS256", typ: "JWT" });
const payload = base64url({
  role: "authenticated",
  iss: "https://securetoken.google.com/hungrieapp-a2288",
  aud: "hungrieapp-a2288",
  sub: "fixture_firebase_customer",
  iat: now,
  exp: now + 3600,
});
const signature = crypto.createHmac("sha256", status.JWT_SECRET).update(`${header}.${payload}`).digest("base64url");
const token = `${header}.${payload}.${signature}`;
const wait = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

const client = createClient(status.API_URL, status.ANON_KEY, {
  accessToken: async () => token,
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});
let channel;
let deniedClient;
let deniedChannel;
try {
  sql("insert into private.account_access(profile_id,account_type,status,activated_at) values('fixture_customer','customer','active',statement_timestamp()) on conflict(profile_id) do update set status='active',activated_at=statement_timestamp(),suspended_at=null");
  const discovered = await client.rpc("my_customer_order_realtime_topics_v1");
  const topic = discovered.data?.[0]?.topic;
  if (discovered.error || typeof topic !== "string" || !topic) throw discovered.error || new Error("Customer topic discovery failed.");
  await client.realtime.setAuth(token);
  const events = [];
  channel = client.channel(topic, { config: { private: true } }).on("broadcast", { event: "order_changed" }, event => events.push(event));
  const joined = await new Promise(resolve => {
    const timer = setTimeout(() => resolve("TIMEOUT"), 8000);
    channel.subscribe(value => {
      if (["SUBSCRIBED", "CHANNEL_ERROR", "TIMED_OUT", "CLOSED"].includes(value)) {
        clearTimeout(timer);
        resolve(value);
      }
    });
  });
  if (joined !== "SUBSCRIBED") throw new Error(`Active Customer channel did not join (${joined}).`);
  sql("update public.orders set updated_at=statement_timestamp() where id='fixture_order'");
  await wait(750);
  if (events.length === 0) throw new Error("Active Customer did not receive the control invalidation.");
  const beforeSuspension = events.length;

  sql("update private.account_access set status='suspended',suspended_at=statement_timestamp() where profile_id='fixture_customer'");
  sql("update public.orders set updated_at=statement_timestamp() where id='fixture_order'");
  await wait(1000);
  if (events.length !== beforeSuspension) throw new Error("Already-open suspended Customer channel received an invalidation.");

  deniedClient = createClient(status.API_URL, status.ANON_KEY, {
    accessToken: async () => token,
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  await deniedClient.realtime.setAuth(token);
  deniedChannel = deniedClient.channel(topic, { config: { private: true } });
  const deniedStatus = await new Promise(resolve => {
    const timer = setTimeout(() => resolve("TIMEOUT"), 8000);
    deniedChannel.subscribe(value => {
      if (["SUBSCRIBED", "CHANNEL_ERROR", "TIMED_OUT", "CLOSED"].includes(value)) {
        clearTimeout(timer);
        resolve(value);
      }
    });
  });
  if (deniedStatus === "SUBSCRIBED") throw new Error("Suspended Customer established a fresh protected channel.");
  console.log(JSON.stringify({ passed: true, activeControlEvents: beforeSuspension, existingSuspendedChannelEvents: events.length - beforeSuspension, freshSuspendedJoin: deniedStatus }));
} finally {
  if (channel) await client.removeChannel(channel).catch(() => undefined);
  client.realtime.disconnect();
  if (deniedChannel) await deniedClient?.removeChannel(deniedChannel).catch(() => undefined);
  deniedClient?.realtime.disconnect();
  sql("delete from private.account_access where profile_id='fixture_customer'");
}
