import crypto from "node:crypto";
import { execFileSync } from "node:child_process";

const root = new URL("..", import.meta.url);
const status = JSON.parse(execFileSync("supabase", ["status", "--output", "json"], {
  cwd: root,
  encoding: "utf8",
  stdio: ["ignore", "pipe", "ignore"],
}));

const base64url = (value) => Buffer.from(value).toString("base64url");
const token = (subject) => {
  const header = base64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = base64url(JSON.stringify({
    role: "authenticated",
    sub: subject,
    iss: "https://securetoken.google.com/hungrieapp-a2288",
    aud: "hungrieapp-a2288",
    email_verified: true,
    iat: Math.floor(Date.now() / 1000) - 5,
    exp: Math.floor(Date.now() / 1000) + 300,
  }));
  const signature = crypto.createHmac("sha256", status.JWT_SECRET).update(`${header}.${payload}`).digest("base64url");
  return `${header}.${payload}.${signature}`;
};

const sql = (statement) => execFileSync("docker", [
  "exec", "-i", "supabase_db_hungrie-app", "psql", "-U", "postgres", "-v", "ON_ERROR_STOP=1", "-At",
], { input: statement, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] });

const blockedActor = `http-blocked-${process.pid}-${Date.now()}`;
const allowedActor = `http-allowed-${process.pid}-${Date.now()}`;
const operation = "customer-order-create";
const endpoint = `${status.REST_URL}/rpc/create_order_v2`;
const request = (subject) => fetch(endpoint, {
  method: "POST",
  headers: {
    apikey: status.ANON_KEY,
    authorization: `Bearer ${token(subject)}`,
    "content-type": "application/json",
  },
  body: JSON.stringify({ p_restaurant_id: "missing", p_address_id: "missing", p_payment_method: "cash", p_items: [] }),
});

try {
  sql(`
    insert into private.api_abuse_limits(actor_hash,operation,window_started_at,request_count,expires_at,updated_at)
    values(encode(extensions.digest('${blockedActor}','sha256'),'hex'),'${operation}',statement_timestamp(),12,statement_timestamp()+interval '1 day',statement_timestamp())
    on conflict(actor_hash,operation) do update set window_started_at=excluded.window_started_at,request_count=12,expires_at=excluded.expires_at,updated_at=excluded.updated_at;
  `);

  const below = await request(allowedActor);
  if (below.status === 429) throw new Error("A request below the limit was incorrectly rate limited.");

  const over = await request(blockedActor);
  const payload = await over.json();
  if (over.status !== 429 || payload.code !== "ABUSE_RATE_LIMITED" || over.headers.get("retry-after") !== "60") {
    throw new Error(`Expected stable 429 abuse response, received ${over.status} ${JSON.stringify(payload)}.`);
  }
  process.stdout.write("PostgREST abuse boundary HTTP test passed.\n");
} finally {
  sql(`delete from private.api_abuse_limits where actor_hash in (
    encode(extensions.digest('${blockedActor}','sha256'),'hex'),
    encode(extensions.digest('${allowedActor}','sha256'),'hex')
  );`);
}
