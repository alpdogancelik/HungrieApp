#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

const FIREBASE_PROJECT_ID = "hungrieapp-a2288";
export const VERIFICATION_EXIT_CODES = Object.freeze({
  allowed: 0,
  operationalFailure: 1,
  denied: 2,
  misconfigured: 3,
  notFound: 4,
});
const ADMIN_ROLES = new Set(["admin", "super_admin"]);
const ALLOWED_TARGETS = new Set(["local", "development", "staging"]);
const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SECURE_STATE_PATH = path.join(ROOT_DIR, "secure", "supabase-projects.local.json");
const CLI_TOKEN_PATH = path.join(ROOT_DIR, "secure", "supabase-cli-hungrie", "access-token");

const valueFor = (argv, name) => {
  const inline = argv.find((value) => value.startsWith(`${name}=`));
  if (inline) return inline.slice(name.length + 1);
  const index = argv.indexOf(name);
  return index >= 0 ? argv[index + 1] || "" : "";
};

export const parseArgs = (argv) => ({
  email: valueFor(argv, "--email"),
  uid: valueFor(argv, "--uid"),
  credentialPath: valueFor(argv, "--credential"),
  projectId: valueFor(argv, "--confirm-project"),
  target: valueFor(argv, "--target"),
  confirmedTarget: valueFor(argv, "--confirm-target"),
});

export const validateOptions = (options, repositoryRoot = ROOT_DIR) => {
  if (Boolean(options.email) === Boolean(options.uid)) {
    throw new Error("Pass exactly one of --email or --uid.");
  }
  if (options.projectId !== FIREBASE_PROJECT_ID) {
    throw new Error(`Refusing to run without --confirm-project=${FIREBASE_PROJECT_ID}.`);
  }
  if (!ALLOWED_TARGETS.has(options.target) || options.confirmedTarget !== options.target) {
    throw new Error("Use --target=local|development|staging with a matching --confirm-target value.");
  }
  if (!path.isAbsolute(options.credentialPath)) {
    throw new Error("Firebase credential must be an absolute path outside the repository.");
  }
  const relative = path.relative(repositoryRoot, options.credentialPath);
  if (!relative.startsWith("..") && !path.isAbsolute(relative)) {
    throw new Error("Firebase credential must remain outside the repository.");
  }
};

const normalizeRole = (value) => String(value || "").trim().toLowerCase();

export const readFirebaseClaimState = (claims = {}) => {
  const transportRole = normalizeRole(claims.role);
  const rawPlatformRole = normalizeRole(claims.platform_role);
  const platformRole = ADMIN_ROLES.has(rawPlatformRole) ? rawPlatformRole : null;
  const invalidPlatformRole = Boolean(rawPlatformRole) && !platformRole;
  const legacyCandidates = [
    claims.platformRole,
    claims.adminRole,
    ...(Array.isArray(claims.roles) ? claims.roles : []),
    ...(Array.isArray(claims.platformRoles) ? claims.platformRoles : []),
    ...(Array.isArray(claims.platform_roles) ? claims.platform_roles : []),
  ].map(normalizeRole);
  const transportRoleContainsAdmin = ADMIN_ROLES.has(transportRole);

  return {
    transportRole: transportRole || null,
    platformRole,
    invalidPlatformRole,
    legacyAdminClaimPresent: transportRoleContainsAdmin || legacyCandidates.some((role) => ADMIN_ROLES.has(role)),
  };
};

export const maskEmail = (email) => {
  const [localPart = "", domain = ""] = String(email || "").split("@");
  if (!domain) return null;
  const visible = localPart.slice(0, Math.min(2, localPart.length));
  return `${visible}***@${domain}`;
};

export const buildRoleLookupQuery = (firebaseUid) => {
  const encodedUid = Buffer.from(String(firebaseUid), "utf8").toString("base64");
  if (!/^[A-Za-z0-9+/=]+$/.test(encodedUid)) throw new Error("Unable to encode Firebase UID safely.");
  return `select p.id as profile_id,
    coalesce(array_agg(ur.role::text order by ur.role::text) filter (where ur.role is not null), '{}') as roles
  from public.profiles p
  left join private.user_roles ur on ur.profile_id = p.id
  where p.firebase_uid = convert_from(decode('${encodedUid}', 'base64'), 'utf8')
  group by p.id`;
};

export const normalizeSupabaseState = (row) => {
  if (!row) return { profileFound: false, profileId: null, roles: [], effectiveRole: null };
  const roles = [...new Set((Array.isArray(row.roles) ? row.roles : []).map(normalizeRole).filter(Boolean))];
  const effectiveRole = roles.includes("super_admin") ? "super_admin" : roles.includes("admin") ? "admin" : null;
  return { profileFound: true, profileId: String(row.profile_id), roles, effectiveRole };
};

export const classifyVerification = (firebaseState, supabaseState) => {
  if (firebaseState.transportRole !== "authenticated") {
    return { result: "misconfigured", reason: "firebase_transport_role_invalid", exitCode: VERIFICATION_EXIT_CODES.misconfigured };
  }
  if (firebaseState.invalidPlatformRole || firebaseState.legacyAdminClaimPresent) {
    return { result: "misconfigured", reason: "firebase_admin_claim_noncanonical", exitCode: VERIFICATION_EXIT_CODES.misconfigured };
  }
  if (!supabaseState.profileFound) {
    return { result: "misconfigured", reason: "supabase_profile_missing", exitCode: VERIFICATION_EXIT_CODES.misconfigured };
  }
  if (!firebaseState.platformRole && !supabaseState.effectiveRole) {
    return { result: "denied", reason: "admin_role_absent", exitCode: VERIFICATION_EXIT_CODES.denied };
  }
  if (firebaseState.platformRole && firebaseState.platformRole === supabaseState.effectiveRole) {
    return { result: "allowed", reason: "roles_match", exitCode: VERIFICATION_EXIT_CODES.allowed };
  }
  if (firebaseState.platformRole && !supabaseState.effectiveRole) {
    return { result: "misconfigured", reason: "supabase_admin_role_missing", exitCode: VERIFICATION_EXIT_CODES.misconfigured };
  }
  if (!firebaseState.platformRole && supabaseState.effectiveRole) {
    return { result: "misconfigured", reason: "firebase_admin_claim_missing", exitCode: VERIFICATION_EXIT_CODES.misconfigured };
  }
  return { result: "misconfigured", reason: "admin_role_mismatch", exitCode: VERIFICATION_EXIT_CODES.misconfigured };
};

export const parseQueryRows = (stdout) => {
  const parsed = JSON.parse(stdout);
  if (Array.isArray(parsed)) return parsed;
  if (Array.isArray(parsed?.rows)) return parsed.rows;
  throw new Error("Unexpected Supabase query response.");
};

const loadFirebaseAdmin = () => {
  const require = createRequire(import.meta.url);
  try {
    return require("firebase-admin");
  } catch {
    return require(path.join(ROOT_DIR, "functions", "node_modules", "firebase-admin"));
  }
};

const queryLocalRole = (query) => {
  const command = spawnSync(
    "supabase",
    ["db", "query", "--local", query, "--output-format", "json"],
    { cwd: ROOT_DIR, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
  );
  if (command.status !== 0) throw new Error("Local Supabase read-only query failed.");
  return parseQueryRows(command.stdout)[0] || null;
};

const queryHostedRole = async (target, query) => {
  if (!fs.existsSync(SECURE_STATE_PATH) || !fs.existsSync(CLI_TOKEN_PATH)) {
    throw new Error("Ignored hosted verification credentials are unavailable.");
  }
  const state = JSON.parse(fs.readFileSync(SECURE_STATE_PATH, "utf8"));
  const projectRef = state.projects?.[target]?.ref;
  const token = fs.readFileSync(CLI_TOKEN_PATH, "utf8").trim();
  if (!projectRef || !token) throw new Error("Ignored hosted verification configuration is incomplete.");

  const response = await fetch(`https://api.supabase.com/v1/projects/${encodeURIComponent(projectRef)}/database/query`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({ query }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`Hosted Supabase read-only query failed (${response.status}).`);
  const rows = await response.json();
  if (!Array.isArray(rows)) throw new Error("Unexpected staging Supabase query response.");
  return rows[0] || null;
};

export const run = async (argv = process.argv.slice(2)) => {
  const options = parseArgs(argv);
  validateOptions(options);
  if (!fs.existsSync(options.credentialPath)) throw new Error("Firebase credential file does not exist.");
  const credentialPath = fs.realpathSync(options.credentialPath);
  validateOptions({ ...options, credentialPath });

  const serviceAccount = JSON.parse(fs.readFileSync(credentialPath, "utf8"));
  if (serviceAccount.project_id !== FIREBASE_PROJECT_ID) throw new Error("Firebase credential project mismatch.");

  const admin = loadFirebaseAdmin();
  const firebaseApp = admin.initializeApp(
    { credential: admin.credential.cert(serviceAccount), projectId: FIREBASE_PROJECT_ID },
    `admin-role-verification-${Date.now()}`,
  );

  try {
    const auth = firebaseApp.auth();
    let user;
    try {
      user = options.uid ? await auth.getUser(options.uid) : await auth.getUserByEmail(options.email);
    } catch (error) {
      if (error?.code !== "auth/user-not-found") throw error;
      console.log(JSON.stringify({
        firebase: { projectId: FIREBASE_PROJECT_ID },
        supabase: { target: options.target },
        result: "not_found",
        reason: "firebase_user_not_found",
        exitCode: VERIFICATION_EXIT_CODES.notFound,
      }, null, 2));
      return VERIFICATION_EXIT_CODES.notFound;
    }

    const firebaseState = readFirebaseClaimState(user.customClaims || {});
    const query = buildRoleLookupQuery(user.uid);
    const row = options.target === "local" ? queryLocalRole(query) : await queryHostedRole(options.target, query);
    const supabaseState = normalizeSupabaseState(row);
    const outcome = classifyVerification(firebaseState, supabaseState);

    console.log(JSON.stringify({
      firebase: {
        projectId: FIREBASE_PROJECT_ID,
        uid: user.uid,
        email: maskEmail(user.email),
        transportRole: firebaseState.transportRole,
        platformRole: firebaseState.platformRole,
        legacyAdminClaimPresent: firebaseState.legacyAdminClaimPresent,
        tokensValidAfterTime: user.tokensValidAfterTime || null,
        freshTokenClaims: "unavailable_read_only",
      },
      supabase: {
        target: options.target,
        profileFound: supabaseState.profileFound,
        profileId: supabaseState.profileId,
        roles: supabaseState.roles,
        effectiveRole: supabaseState.effectiveRole,
      },
      result: outcome.result,
      reason: outcome.reason,
      exitCode: outcome.exitCode,
    }, null, 2));
    return outcome.exitCode;
  } finally {
    await firebaseApp.delete();
  }
};

const isEntrypoint = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isEntrypoint) {
  run().then((exitCode) => {
    process.exitCode = exitCode;
  }).catch(() => {
    console.error(JSON.stringify({ result: "error", reason: "verification_operation_failed", exitCode: VERIFICATION_EXIT_CODES.operationalFailure }));
    process.exitCode = VERIFICATION_EXIT_CODES.operationalFailure;
  });
}
