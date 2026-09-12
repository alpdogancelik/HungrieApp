#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

const FIREBASE_PROJECT_ID = "hungrieapp-a2288";
export const PROVISION_EXIT_CODES = Object.freeze({
  completed: 0,
  operationalFailure: 1,
  stalePlan: 5,
  partialFailClosed: 6,
});
const ADMIN_ROLES = new Set(["admin", "super_admin"]);
const HOSTED_TARGETS = new Set(["development", "staging"]);
const REQUIRED_MIGRATIONS = ["20260906120000", "20260906130000", "20260907100000"];
const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const STATE_PATH = path.join(ROOT_DIR, "secure", "supabase-projects.local.json");
const TOKEN_PATH = path.join(ROOT_DIR, "secure", "supabase-cli-hungrie", "access-token");

const valueFor = (argv, name) => {
  const inline = argv.find((value) => value.startsWith(`${name}=`));
  if (inline) return inline.slice(name.length + 1);
  const index = argv.indexOf(name);
  return index >= 0 ? argv[index + 1] || "" : "";
};

export const parseArgs = (argv) => ({
  email: valueFor(argv, "--email"),
  uid: valueFor(argv, "--uid"),
  role: valueFor(argv, "--role"),
  remove: argv.includes("--remove"),
  bootstrap: argv.includes("--bootstrap"),
  actorUid: valueFor(argv, "--actor-uid"),
  credentialPath: valueFor(argv, "--credential"),
  projectId: valueFor(argv, "--confirm-project"),
  target: valueFor(argv, "--target"),
  confirmedTarget: valueFor(argv, "--confirm-target"),
  write: argv.includes("--write"),
  expectedPlanHash: valueFor(argv, "--expect-plan-sha256"),
});

export const validateOptions = (options, repositoryRoot = ROOT_DIR) => {
  if (Boolean(options.email) === Boolean(options.uid)) throw new Error("Pass exactly one of --email or --uid.");
  if (options.projectId !== FIREBASE_PROJECT_ID) throw new Error(`Use --confirm-project=${FIREBASE_PROJECT_ID}.`);
  if (!HOSTED_TARGETS.has(options.target) || options.confirmedTarget !== options.target) {
    throw new Error("Use --target=development|staging with matching --confirm-target.");
  }
  if (!path.isAbsolute(options.credentialPath || "")) throw new Error("Credential path must be absolute.");
  const relative = path.relative(repositoryRoot, options.credentialPath);
  if (!relative.startsWith("..") && !path.isAbsolute(relative)) throw new Error("Credential must remain outside the repository.");
  if (options.remove ? Boolean(options.role) : !ADMIN_ROLES.has(options.role)) {
    throw new Error("Grant requires --role=admin|super_admin; --remove must omit --role.");
  }
  if (options.bootstrap) {
    if (options.remove || options.role !== "super_admin" || options.actorUid) {
      throw new Error("--bootstrap is only valid for a super_admin grant without --actor-uid.");
    }
  } else if (!options.actorUid) {
    throw new Error("Non-bootstrap operations require --actor-uid.");
  }
  if (options.write && !/^[a-f0-9]{64}$/.test(options.expectedPlanHash)) {
    throw new Error("Write mode requires --expect-plan-sha256 from the reviewed dry-run.");
  }
};

const normalizeRole = (value) => String(value || "").trim().toLowerCase();
const isAdminRole = (value) => ADMIN_ROLES.has(normalizeRole(value));
const codedError = (code, message) => Object.assign(new Error(message), { code });

export const canonicalizeClaims = (claims = {}, nextRole = null) => {
  const output = { ...claims, role: "authenticated" };
  delete output.admin;
  delete output.platformRole;
  delete output.adminRole;
  for (const key of ["roles", "platformRoles", "platform_roles"]) {
    if (!Array.isArray(output[key])) continue;
    const filtered = output[key].filter((value) => !isAdminRole(value));
    if (filtered.length) output[key] = filtered;
    else delete output[key];
  }
  if (nextRole) output.platform_role = nextRole;
  else delete output.platform_role;
  if (Buffer.byteLength(JSON.stringify(output), "utf8") > 1000) {
    throw new Error("Canonical Firebase custom claims exceed the 1000-byte limit.");
  }
  return output;
};

export const summarizeClaims = (claims = {}) => ({
  transportRole: normalizeRole(claims.role) || null,
  platformRole: isAdminRole(claims.platform_role) ? normalizeRole(claims.platform_role) : null,
  legacyAdminClaimPresent: [claims.platformRole, claims.adminRole].some(isAdminRole)
    || [claims.roles, claims.platformRoles, claims.platform_roles]
      .some((values) => Array.isArray(values) && values.some(isAdminRole)),
  unrelatedClaimCount: Object.keys(claims).filter((key) => ![
    "role", "platform_role", "platformRole", "adminRole", "roles", "platformRoles", "platform_roles",
  ].includes(key)).length,
});

export const maskEmail = (email) => {
  const [local = "", domain = ""] = String(email || "").split("@");
  return domain ? `${local.slice(0, Math.min(2, local.length))}***@${domain}` : null;
};

const encode = (value) => Buffer.from(String(value), "utf8").toString("base64");
const decodedSql = (value) => `convert_from(decode('${encode(value)}','base64'),'utf8')`;

export const buildPreflightQuery = ({ targetUid, actorUid }) => `select
  exists(select 1 from supabase_migrations.schema_migrations where version='20260906120000') as runtime_migration,
  exists(select 1 from supabase_migrations.schema_migrations where version='20260906130000') as verification_migration,
  exists(select 1 from supabase_migrations.schema_migrations where version='20260907100000') as provisioning_migration,
  (select p.id from public.profiles p where p.firebase_uid=${decodedSql(targetUid)} and p.deletion_pending_at is null and p.deleted_at is null) as target_profile_id,
  coalesce((select array_agg(ur.role::text order by ur.role::text) from private.user_roles ur join public.profiles p on p.id=ur.profile_id where p.firebase_uid=${decodedSql(targetUid)}), '{}') as target_roles,
  ${actorUid ? `(select p.id from public.profiles p where p.firebase_uid=${decodedSql(actorUid)} and p.deletion_pending_at is null and p.deleted_at is null)` : "null::text"} as actor_profile_id,
  ${actorUid ? `coalesce((select array_agg(ur.role::text order by ur.role::text) from private.user_roles ur join public.profiles p on p.id=ur.profile_id where p.firebase_uid=${decodedSql(actorUid)}), '{}')` : "'{}'::text[]"} as actor_roles,
  (select count(*)::integer from private.user_roles where role='super_admin'::public.platform_role) as super_admin_count`;

export const normalizeDatabaseState = (row = {}) => ({
  schemaReady: REQUIRED_MIGRATIONS.every((_, index) => [
    row.runtime_migration, row.verification_migration, row.provisioning_migration,
  ][index] === true),
  targetProfileId: row.target_profile_id ? String(row.target_profile_id) : null,
  targetRoles: [...new Set((Array.isArray(row.target_roles) ? row.target_roles : []).map(normalizeRole).filter(Boolean))],
  actorProfileId: row.actor_profile_id ? String(row.actor_profile_id) : null,
  actorRoles: [...new Set((Array.isArray(row.actor_roles) ? row.actor_roles : []).map(normalizeRole).filter(Boolean))],
  superAdminCount: Number(row.super_admin_count || 0),
});

export const validatePreflight = ({ options, targetClaims, actorClaims, database }) => {
  if (!database.schemaReady) throw codedError("SCHEMA_NOT_READY", "Required admin provisioning migrations are not applied.");
  if (!database.targetProfileId) throw codedError("PROFILE_MISSING", "Target Supabase profile is missing.");
  if (options.bootstrap) {
    if (database.superAdminCount !== 0) throw codedError("BOOTSTRAP_ALREADY_COMPLETED", "Bootstrap is blocked because a super-admin already exists.");
    return;
  }
  const actorState = summarizeClaims(actorClaims);
  if (actorState.transportRole !== "authenticated" || actorState.platformRole !== "super_admin"
      || actorState.legacyAdminClaimPresent || !database.actorProfileId
      || !database.actorRoles.includes("super_admin")) {
    throw codedError("ACTOR_NOT_SUPER_ADMIN", "Actor is not a matching canonical super-admin.");
  }
  const targetState = summarizeClaims(targetClaims);
  if (targetState.transportRole !== "authenticated") {
    throw codedError("TARGET_TRANSPORT_ROLE_INVALID", "Target Firebase transport role is not authenticated.");
  }
};

const stable = (value) => {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
  }
  return value;
};

export const buildPlan = ({ options, targetUser, targetClaims, actorUser, database }) => {
  const nextRole = options.remove ? null : options.role;
  const nextClaims = canonicalizeClaims(targetClaims, nextRole);
  const body = {
    version: 1,
    firebaseProject: FIREBASE_PROJECT_ID,
    target: options.target,
    operation: options.remove ? "revoke" : options.bootstrap ? "bootstrap" : "grant_or_change",
    requestedRole: nextRole,
    targetUidHash: crypto.createHash("sha256").update(targetUser.uid).digest("hex"),
    targetProfileHash: crypto.createHash("sha256").update(database.targetProfileId).digest("hex"),
    actorUidHash: actorUser ? crypto.createHash("sha256").update(actorUser.uid).digest("hex") : null,
    currentClaimsHash: crypto.createHash("sha256").update(JSON.stringify(stable(targetClaims))).digest("hex"),
    nextClaimsHash: crypto.createHash("sha256").update(JSON.stringify(stable(nextClaims))).digest("hex"),
    currentDatabaseRoles: [...database.targetRoles].sort(),
    currentSuperAdminCount: database.superAdminCount,
  };
  const planHash = crypto.createHash("sha256").update(JSON.stringify(stable(body))).digest("hex");
  return { body, planHash, nextClaims, nextRole };
};

export const buildMutationQuery = ({ profileId, nextRole, actorProfileId, bootstrap, operationId }) => {
  const roleSql = nextRole ? `'${nextRole}'::public.platform_role` : "null::public.platform_role";
  const actorSql = actorProfileId ? decodedSql(actorProfileId) : "null::text";
  return `select private.apply_platform_admin_role(${decodedSql(profileId)},${roleSql},${actorSql},${bootstrap ? "true" : "false"},'${operationId}'::uuid,'admin_provisioning_cli')`;
};

const roleRank = (role) => role === "super_admin" ? 2 : role === "admin" ? 1 : 0;
const effectiveDatabaseRole = (roles) => roles.includes("super_admin") ? "super_admin" : roles.includes("admin") ? "admin" : null;

export const executeOrderedWrite = async ({ currentDatabaseRole, nextRole, setFirebase, setDatabase, restoreFirebase, revokeTokens }) => {
  const databaseFirst = nextRole === null || roleRank(nextRole) < roleRank(currentDatabaseRole);
  if (databaseFirst) {
    await setDatabase();
    try {
      await setFirebase();
      await revokeTokens();
      return { order: "database_first", compensated: false };
    } catch (error) {
      const partial = new Error("Firebase update failed after Supabase privilege was reduced; retry is required.");
      partial.code = "PARTIAL_FAIL_CLOSED";
      partial.cause = error;
      throw partial;
    }
  }

  await setFirebase();
  try {
    await setDatabase();
    return { order: "firebase_first", compensated: false };
  } catch (error) {
    try {
      await restoreFirebase();
      await revokeTokens();
    } catch (compensationError) {
      const partial = new Error("Supabase grant failed and Firebase compensation was incomplete.");
      partial.code = "COMPENSATION_FAILED";
      partial.cause = compensationError;
      throw partial;
    }
    const compensated = new Error("Supabase grant failed; Firebase claims were restored and tokens revoked.");
    compensated.code = "GRANT_COMPENSATED";
    compensated.cause = error;
    throw compensated;
  }
};

const loadFirebaseAdmin = () => {
  const require = createRequire(import.meta.url);
  try { return require("firebase-admin"); }
  catch { return require(path.join(ROOT_DIR, "functions", "node_modules", "firebase-admin")); }
};

const loadHostedAccess = (target) => {
  if (!fs.existsSync(STATE_PATH) || !fs.existsSync(TOKEN_PATH)) throw new Error("Ignored Supabase operator credentials are unavailable.");
  const state = JSON.parse(fs.readFileSync(STATE_PATH, "utf8"));
  const projectRef = state.projects?.[target]?.ref;
  const token = fs.readFileSync(TOKEN_PATH, "utf8").trim();
  if (!projectRef || !token) throw new Error("Supabase target configuration is incomplete.");
  return { projectRef, token };
};

const managementQuery = async (access, query) => {
  const response = await fetch(`https://api.supabase.com/v1/projects/${encodeURIComponent(access.projectRef)}/database/query`, {
    method: "POST",
    headers: { authorization: `Bearer ${access.token}`, "content-type": "application/json" },
    body: JSON.stringify({ query }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`Supabase operator query failed (${response.status}).`);
  const rows = await response.json();
  if (!Array.isArray(rows)) throw new Error("Unexpected Supabase operator response.");
  return rows;
};

export const run = async (argv = process.argv.slice(2)) => {
  const options = parseArgs(argv);
  validateOptions(options);
  if (!fs.existsSync(options.credentialPath)) throw new Error("Firebase credential file does not exist.");
  const credentialPath = fs.realpathSync(options.credentialPath);
  validateOptions({ ...options, credentialPath });
  if ((fs.statSync(credentialPath).mode & 0o077) !== 0) throw new Error("Firebase credential permissions must be owner-only (0600).");
  const serviceAccount = JSON.parse(fs.readFileSync(credentialPath, "utf8"));
  if (serviceAccount.project_id !== FIREBASE_PROJECT_ID) throw new Error("Firebase credential project mismatch.");

  const admin = loadFirebaseAdmin();
  const firebaseApp = admin.initializeApp({ credential: admin.credential.cert(serviceAccount), projectId: FIREBASE_PROJECT_ID }, `admin-provision-${Date.now()}`);
  try {
    const auth = firebaseApp.auth();
    const targetUser = options.uid ? await auth.getUser(options.uid) : await auth.getUserByEmail(options.email);
    const actorUser = options.actorUid ? await auth.getUser(options.actorUid) : null;
    const access = loadHostedAccess(options.target);
    const query = buildPreflightQuery({ targetUid: targetUser.uid, actorUid: actorUser?.uid || null });
    const database = normalizeDatabaseState((await managementQuery(access, query))[0]);
    const targetClaims = targetUser.customClaims || {};
    const actorClaims = actorUser?.customClaims || {};
    validatePreflight({ options, targetClaims, actorClaims, database });
    const plan = buildPlan({ options, targetUser, targetClaims, actorUser, database });

    const sanitized = {
      mode: options.write ? "write" : "dry-run",
      firebase: { projectId: FIREBASE_PROJECT_ID, email: maskEmail(targetUser.email), claims: summarizeClaims(targetClaims) },
      supabase: { target: options.target, profileFound: true, roles: database.targetRoles, superAdminCount: database.superAdminCount },
      operation: plan.body.operation,
      requestedRole: plan.nextRole,
      planSha256: plan.planHash,
    };
    if (!options.write) {
      console.log(JSON.stringify({ ...sanitized, result: "ready", exitCode: PROVISION_EXIT_CODES.completed }, null, 2));
      return PROVISION_EXIT_CODES.completed;
    }
    if (options.expectedPlanHash !== plan.planHash) {
      console.log(JSON.stringify({ ...sanitized, result: "stale_plan", exitCode: PROVISION_EXIT_CODES.stalePlan }, null, 2));
      return PROVISION_EXIT_CODES.stalePlan;
    }

    const operationId = crypto.randomUUID();
    const mutation = buildMutationQuery({
      profileId: database.targetProfileId,
      nextRole: plan.nextRole,
      actorProfileId: database.actorProfileId,
      bootstrap: options.bootstrap,
      operationId,
    });
    const writeResult = await executeOrderedWrite({
      currentDatabaseRole: effectiveDatabaseRole(database.targetRoles),
      nextRole: plan.nextRole,
      setFirebase: () => auth.setCustomUserClaims(targetUser.uid, plan.nextClaims),
      setDatabase: () => managementQuery(access, mutation),
      restoreFirebase: () => auth.setCustomUserClaims(targetUser.uid, targetClaims),
      revokeTokens: () => auth.revokeRefreshTokens(targetUser.uid),
    });

    const refreshedUser = await auth.getUser(targetUser.uid);
    const refreshedDatabase = normalizeDatabaseState((await managementQuery(access, query))[0]);
    const expectedDatabaseRole = effectiveDatabaseRole(refreshedDatabase.targetRoles);
    const expected = options.remove ? expectedDatabaseRole === null : expectedDatabaseRole === plan.nextRole;
    if (!expected || summarizeClaims(refreshedUser.customClaims || {}).platformRole !== plan.nextRole) {
      throw new Error("Post-write role verification failed.");
    }
    console.log(JSON.stringify({
      ...sanitized,
      result: "completed",
      writeOrder: writeResult.order,
      firebase: {
        ...sanitized.firebase,
        claims: summarizeClaims(refreshedUser.customClaims || {}),
        tokensValidAfterTime: refreshedUser.tokensValidAfterTime || null,
      },
      supabase: { ...sanitized.supabase, roles: refreshedDatabase.targetRoles },
      clientAction: options.remove ? "sessions_revoked" : "force_token_refresh_or_sign_in_again",
      exitCode: PROVISION_EXIT_CODES.completed,
    }, null, 2));
    return PROVISION_EXIT_CODES.completed;
  } finally {
    await firebaseApp.delete();
  }
};

const isEntrypoint = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isEntrypoint) {
  run().then((code) => { process.exitCode = code; }).catch((error) => {
    const partial = ["PARTIAL_FAIL_CLOSED", "COMPENSATION_FAILED"].includes(error?.code);
    const exitCode = partial ? PROVISION_EXIT_CODES.partialFailClosed : PROVISION_EXIT_CODES.operationalFailure;
    console.error(JSON.stringify({ result: partial ? "partial_fail_closed" : "error", reason: error?.code || "provisioning_operation_failed", exitCode }));
    process.exitCode = exitCode;
  });
}
