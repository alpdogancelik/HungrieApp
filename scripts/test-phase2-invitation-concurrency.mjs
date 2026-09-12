import { spawn, spawnSync } from "node:child_process";

const container = "supabase_db_hungrie-app";
const email = "phase2-race@example.invalid";
const operations = [
  { id: "00000000-0000-4000-8000-000000000201", token: "a" },
  { id: "00000000-0000-4000-8000-000000000202", token: "b" },
];

const runSql = (sql) => {
  const result = spawnSync("docker", ["exec", "-i", container, "psql", "-U", "postgres",
    "-v", "ON_ERROR_STOP=1", "-At"], { input: sql, encoding: "utf8" });
  if (result.status !== 0) throw new Error(String(result.stderr || "Local Phase 2 SQL failed").trim());
  return String(result.stdout || "").trim();
};

const clean = () => runSql(`
  delete from private.account_provisioning_operations where operation_id in
    ('${operations[0].id}', '${operations[1].id}');
  delete from private.account_email_reservations where normalized_email='${email}';
  delete from private.account_invitations where normalized_email='${email}';
  delete from private.audit_log where metadata->>'operation_id' in
    ('${operations[0].id}', '${operations[1].id}');
  delete from private.account_access where profile_id='fixture_super_admin';
`);

const invite = ({ id, token }) => new Promise((resolve) => {
  const child = spawn("docker", ["exec", "-i", container, "psql", "-U", "postgres",
    "-v", "ON_ERROR_STOP=1", "-At"], { stdio: ["pipe", "pipe", "pipe"] });
  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (chunk) => { stdout += chunk; });
  child.stderr.on("data", (chunk) => { stderr += chunk; });
  child.on("close", (code) => resolve({ code, stdout, stderr }));
  child.stdin.end(`
    begin;
    select set_config('request.jwt.claims', jsonb_build_object(
      'role','authenticated',
      'iss','https://securetoken.google.com/hungrieapp-a2288',
      'aud','hungrieapp-a2288',
      'sub','fixture_firebase_super_admin',
      'email_verified',true,
      'auth_time',extract(epoch from statement_timestamp())::bigint,
      'firebase',jsonb_build_object('sign_in_second_factor','totp'))::text,true);
    select public.admin_invite_restaurant_account_v1(
      '${email}', 'fixture_restaurant_a', 'manager',
      encode(extensions.digest(repeat('${token}',40),'sha256'),'hex'), '${id}');
    commit;
  `);
});

try {
  clean();
  runSql(`insert into private.account_access(profile_id,account_type,status,
    activated_at,admin_role,admin_mfa_enrolled_at)
    values('fixture_super_admin','admin','active',statement_timestamp(),
      'super_admin',statement_timestamp());`);
  const results = await Promise.all(operations.map(invite));
  if (results.some(({ code }) => code !== 0)) {
    throw new Error(`Concurrent invitations failed: ${results.map(({ stderr }) => stderr.trim()).join(" | ")}`);
  }
  const counts = runSql(`select
    (select count(*) from private.account_invitations where normalized_email='${email}'),
    (select count(*) from private.account_invitations where normalized_email='${email}' and state='pending'),
    (select count(*) from private.account_invitations where normalized_email='${email}' and state='revoked'),
    (select count(*) from private.account_email_reservations where normalized_email='${email}'),
    (select count(*) from private.account_provisioning_operations where operation_id in
      ('${operations[0].id}', '${operations[1].id}') and state='completed');`);
  if (counts !== "2|1|1|1|2") {
    throw new Error(`Concurrent invitations left inconsistent state: ${counts}`);
  }
  process.stdout.write("Phase 2 concurrent invitation reissue test passed.\n");
} finally {
  clean();
}
