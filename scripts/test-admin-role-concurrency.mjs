import { spawn, spawnSync } from "node:child_process";

const container = "supabase_db_hungrie-app";
const operations = [
  {
    target: "fixture_admin",
    actor: "fixture_super_admin",
    id: "00000000-0000-4000-8000-000000000101",
  },
  {
    target: "fixture_super_admin",
    actor: "fixture_admin",
    id: "00000000-0000-4000-8000-000000000102",
  },
];

const runSql = (sql) => {
  const result = spawnSync(
    "docker",
    ["exec", "-i", container, "psql", "-U", "postgres", "-v", "ON_ERROR_STOP=1", "-At"],
    { input: sql, encoding: "utf8" },
  );
  if (result.status !== 0) throw new Error(String(result.stderr || "Local admin concurrency SQL failed").trim());
  return String(result.stdout || "").trim();
};

const revoke = ({ target, actor, id }) => new Promise((resolve) => {
  const child = spawn(
    "docker",
    ["exec", "-i", container, "psql", "-U", "postgres", "-v", "ON_ERROR_STOP=1", "-At"],
    { stdio: ["pipe", "pipe", "pipe"] },
  );
  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (chunk) => { stdout += chunk; });
  child.stderr.on("data", (chunk) => { stderr += chunk; });
  child.on("close", (code) => resolve({ code, stdout, stderr }));
  child.stdin.end(`
    begin;
    select private.apply_platform_admin_role(
      '${target}', null, '${actor}', false, '${id}', 'admin_provisioning_cli'
    );
    commit;
  `);
});

try {
  runSql(`
    delete from private.user_roles
    where profile_id in ('fixture_admin', 'fixture_super_admin')
      and role in ('admin'::public.platform_role, 'super_admin'::public.platform_role);
    insert into private.user_roles(profile_id, role) values
      ('fixture_admin', 'super_admin'),
      ('fixture_super_admin', 'super_admin');
  `);

  const results = await Promise.all(operations.map(revoke));
  if (results.filter((result) => result.code === 0).length !== 1
      || results.filter((result) => result.code !== 0).length !== 1) {
    throw new Error("Exactly one concurrent super-admin revocation must succeed.");
  }
  if (runSql("select count(*) from private.user_roles where role='super_admin'") !== "1") {
    throw new Error("Concurrent revocations did not preserve exactly one super-admin.");
  }
  process.stdout.write("Admin role concurrency test passed.\n");
} finally {
  runSql(`
    delete from private.audit_log
    where metadata->>'operation_id' in (
      '00000000-0000-4000-8000-000000000101',
      '00000000-0000-4000-8000-000000000102'
    );
    delete from private.user_roles
    where profile_id in ('fixture_admin', 'fixture_super_admin')
      and role in ('admin'::public.platform_role, 'super_admin'::public.platform_role);
    insert into private.user_roles(profile_id, role) values
      ('fixture_admin', 'admin'),
      ('fixture_super_admin', 'super_admin');
  `);
}
