const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const admin = require("firebase-admin");

const ROOT_DIR = path.resolve(__dirname, "..", "..");
const MOBILE_DIR = path.join(ROOT_DIR, "mobile");
const APP_JSON_PATH = path.join(MOBILE_DIR, "app.json");

const BATCH_SIZE = 450;
const DEFAULT_COLLECTIONS = ["users", "restaurants"];

const args = process.argv.slice(2);

const hasArg = (name) => args.includes(name);

const getArgValue = (name) => {
  const inline = args.find((arg) => arg.startsWith(`${name}=`));
  if (inline) return inline.slice(name.length + 1);

  const index = args.indexOf(name);
  if (index >= 0 && args[index + 1] && !args[index + 1].startsWith("--")) {
    return args[index + 1];
  }

  return "";
};

const parsePositiveNumber = (value, flagName) => {
  if (!value) return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${flagName} must be a positive number.`);
  }
  return parsed;
};

const parseCsv = (value) =>
  String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

const parseDedupeScope = (value) => {
  if (!value) return "owner";
  const normalized = String(value).trim().toLowerCase();
  if (normalized === "owner" || normalized === "global") return normalized;
  throw new Error("--dedupe-scope must be either 'owner' or 'global'.");
};

const opts = {
  write: hasArg("--write") || hasArg("--commit"),
  dryRun: hasArg("--dry-run") || (!hasArg("--write") && !hasArg("--commit")),
  deleteAll: hasArg("--all"),
  removeDuplicates: !hasArg("--no-dedupe"),
  dedupeScope: parseDedupeScope(getArgValue("--dedupe-scope")),
  confirmAll: hasArg("--confirm-all"),
  serviceAccount: getArgValue("--service-account"),
  projectId: getArgValue("--project-id"),
  confirmProject: getArgValue("--confirm-project"),
  olderThanDays: parsePositiveNumber(getArgValue("--older-than-days"), "--older-than-days"),
  collections: parseCsv(getArgValue("--collections")),
};

if (!opts.collections.length) {
  opts.collections = DEFAULT_COLLECTIONS;
}

if (opts.write) {
  opts.dryRun = false;
}

const olderThanMs = opts.olderThanDays
  ? Date.now() - opts.olderThanDays * 24 * 60 * 60 * 1000
  : null;

const readJsonFile = (filePath) => {
  const raw = fs.readFileSync(filePath, "utf8");
  return JSON.parse(raw);
};

const resolveProjectIdFromAppConfig = () => {
  try {
    const parsed = readJsonFile(APP_JSON_PATH);
    return parsed?.expo?.extra?.EXPO_PUBLIC_FIREBASE_PROJECT_ID || null;
  } catch {
    return null;
  }
};

const loadServiceAccount = () => {
  const explicitPath = opts.serviceAccount || process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (!explicitPath) return null;

  const resolvedPath = path.isAbsolute(explicitPath)
    ? explicitPath
    : path.resolve(process.cwd(), explicitPath);

  return readJsonFile(resolvedPath);
};

const resolveProjectId = (serviceAccount) =>
  opts.projectId ||
  process.env.GCLOUD_PROJECT ||
  process.env.GOOGLE_CLOUD_PROJECT ||
  process.env.FIREBASE_PROJECT_ID ||
  serviceAccount?.project_id ||
  resolveProjectIdFromAppConfig();

const initializeFirebaseAdmin = () => {
  if (admin.apps.length) return admin.app();

  const serviceAccount = loadServiceAccount();
  const projectId = resolveProjectId(serviceAccount);

  if (!projectId) {
    throw new Error(
      [
        "Unable to determine Firebase project id.",
        "Pass --project-id=<projectId>, set FIREBASE_PROJECT_ID,",
        "or define expo.extra.EXPO_PUBLIC_FIREBASE_PROJECT_ID in mobile/app.json.",
      ].join(" "),
    );
  }

  if (serviceAccount) {
    return admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      projectId,
    });
  }

  return admin.initializeApp({ projectId });
};

const assertSafeWrite = (projectId) => {
  if (!opts.write) return;

  if (!opts.confirmProject) {
    throw new Error(
      [
        "Refusing to write without project confirmation.",
        `Re-run with --confirm-project=${projectId}`,
      ].join(" "),
    );
  }

  if (opts.confirmProject !== projectId) {
    throw new Error(
      [
        "Project confirmation mismatch.",
        `Resolved project: ${projectId}`,
        `Provided confirmation: ${opts.confirmProject}`,
      ].join(" "),
    );
  }

  if (opts.deleteAll && !opts.confirmAll) {
    throw new Error(
      [
        "Refusing to delete all push tokens without explicit confirmation.",
        "Re-run with --all --confirm-all if this is intentional.",
      ].join(" "),
    );
  }
};

const asMillis = (value) => {
  if (!value) return 0;
  if (typeof value?.toMillis === "function") return value.toMillis();
  if (value instanceof Date) return value.getTime();

  const numeric = Number(value);
  if (Number.isFinite(numeric)) return numeric;

  const parsedDate = Date.parse(String(value));
  return Number.isFinite(parsedDate) ? parsedDate : 0;
};

const hashValue = (value) =>
  crypto.createHash("sha256").update(String(value || "")).digest("hex").slice(0, 12);

const maskToken = (token) => {
  const value = String(token || "").trim();
  if (!value) return null;

  if (value.length <= 12) {
    return `${value.slice(0, 3)}...${value.slice(-3)}`;
  }

  return `${value.slice(0, 8)}...${value.slice(-6)}`;
};

const summarizeReason = (reason) => {
  if (reason.startsWith("duplicate-of:")) return "duplicate";
  if (reason.startsWith("older-than-")) return "old";
  return reason;
};

const countBy = (items, getKey) =>
  items.reduce((acc, item) => {
    const key = getKey(item);
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});

const chunk = (items, size) => {
  const groups = [];
  for (let index = 0; index < items.length; index += size) {
    groups.push(items.slice(index, index + size));
  }
  return groups;
};

const readTokensForOwnerCollection = async (db, collectionName) => {
  const ownerSnap = await db.collection(collectionName).select().get();
  const entries = [];

  for (const ownerDoc of ownerSnap.docs) {
    const tokenSnap = await ownerDoc.ref
      .collection("pushTokens")
      .select("token", "provider", "platform", "updatedAt", "createdAt")
      .get();

    for (const tokenDoc of tokenSnap.docs) {
      const data = tokenDoc.data() || {};
      const token = String(data.token || "").trim();
      const provider = String(data.provider || "").trim().toLowerCase();
      const platform = String(data.platform || "").trim().toLowerCase();
      const updatedAtMs = asMillis(data.updatedAt);
      const createdAtMs = asMillis(data.createdAt);

      entries.push({
        ref: tokenDoc.ref,
        path: tokenDoc.ref.path,
        ownerCollection: collectionName,
        ownerId: ownerDoc.id,
        tokenDocId: tokenDoc.id,
        token,
        tokenHash: token ? hashValue(token) : null,
        provider,
        platform,
        updatedAtMs: updatedAtMs || createdAtMs,
        createdAtMs,
      });
    }
  }

  return entries;
};

const buildDedupeGroupKey = (entry) => {
  const providerKey = entry.provider || entry.platform || "unknown";
  if (opts.dedupeScope === "global") {
    return `${providerKey}::${entry.token}`;
  }
  return `${entry.ownerCollection}::${entry.ownerId}::${providerKey}::${entry.token}`;
};

const collectDeleteCandidates = (entries) => {
  const candidates = new Map();

  const addCandidate = (entry, reason) => {
    if (!candidates.has(entry.path)) {
      candidates.set(entry.path, { entry, reason });
    }
  };

  if (opts.deleteAll) {
    for (const entry of entries) {
      addCandidate(entry, "all");
    }
    return [...candidates.values()];
  }

  if (olderThanMs) {
    for (const entry of entries) {
      const timestamp = entry.updatedAtMs || entry.createdAtMs;
      if (timestamp && timestamp < olderThanMs) {
        addCandidate(entry, `older-than-${opts.olderThanDays}-days`);
      }
    }
  }

  if (opts.removeDuplicates) {
    const groups = new Map();

    for (const entry of entries) {
      if (!entry.token) continue;
      const groupKey = buildDedupeGroupKey(entry);
      const group = groups.get(groupKey) || [];
      group.push(entry);
      groups.set(groupKey, group);
    }

    for (const group of groups.values()) {
      if (group.length <= 1) continue;

      const sorted = [...group].sort((left, right) => {
        const leftTs = left.updatedAtMs || left.createdAtMs || 0;
        const rightTs = right.updatedAtMs || right.createdAtMs || 0;
        return rightTs - leftTs;
      });

      const keep = sorted[0];
      for (const duplicate of sorted.slice(1)) {
        if (duplicate.path !== keep.path) {
          addCandidate(duplicate, `duplicate-of:${keep.path}`);
        }
      }
    }
  }

  return [...candidates.values()];
};

const deleteCandidates = async (db, candidates) => {
  if (!candidates.length) {
    return { deleted: 0, batches: 0 };
  }

  let deleted = 0;
  let batches = 0;

  for (const group of chunk(candidates, BATCH_SIZE)) {
    const batch = db.batch();
    for (const { entry } of group) {
      batch.delete(entry.ref);
      deleted += 1;
    }
    await batch.commit();
    batches += 1;
  }

  return { deleted, batches };
};

const buildSafeSample = (candidates) =>
  candidates.slice(0, 20).map(({ entry, reason }) => ({
    path: entry.path,
    ownerCollection: entry.ownerCollection,
    ownerId: entry.ownerId,
    provider: entry.provider || entry.platform || "unknown",
    tokenPreview: maskToken(entry.token),
    tokenHash: entry.tokenHash,
    updatedAtMs: entry.updatedAtMs || null,
    createdAtMs: entry.createdAtMs || null,
    reason,
  }));

const printReport = ({ projectId, entries, candidates }) => {
  const reasonSummary = countBy(candidates, ({ reason }) => summarizeReason(reason));
  const scannedByCollection = countBy(entries, (entry) => entry.ownerCollection);
  const deleteByCollection = countBy(candidates, ({ entry }) => entry.ownerCollection);

  console.log(
    JSON.stringify(
      {
        script: "cleanupPushTokens",
        projectId,
        mode: opts.write ? "write" : "dry-run",
        scanned: entries.length,
        deleteCount: candidates.length,
        scannedByCollection,
        deleteByCollection,
        reasonSummary,
        criteria: {
          collections: opts.collections,
          all: opts.deleteAll,
          dedupe: opts.removeDuplicates,
          dedupeScope: opts.dedupeScope,
          olderThanDays: opts.olderThanDays || null,
        },
        safety: {
          writeRequiresConfirmProject: true,
          confirmProject: opts.confirmProject || null,
          rawTokensPrinted: false,
          deleteAllRequiresConfirmAll: true,
        },
        sample: buildSafeSample(candidates),
      },
      null,
      2,
    ),
  );
};

async function main() {
  const app = initializeFirebaseAdmin();
  const db = admin.firestore();
  const projectId = app.options.projectId;

  assertSafeWrite(projectId);

  const tokenGroups = await Promise.all(
    opts.collections.map((collectionName) => readTokensForOwnerCollection(db, collectionName)),
  );

  const entries = tokenGroups.flat();
  const candidates = collectDeleteCandidates(entries);

  printReport({ projectId, entries, candidates });

  if (opts.dryRun) {
    console.log(
      [
        "",
        "Dry-run only. No Firestore documents were deleted.",
        `To delete, re-run with: --write --confirm-project=${projectId}`,
        opts.deleteAll ? "Because --all is used, also pass: --confirm-all" : "",
      ]
        .filter(Boolean)
        .join("\n"),
    );
    return;
  }

  const result = await deleteCandidates(db, candidates);
  console.log(
    JSON.stringify(
      {
        status: "complete",
        deleted: result.deleted,
        batches: result.batches,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error("[cleanup-push-tokens] Failed:", error?.stack || error?.message || error);
  process.exit(1);
});
