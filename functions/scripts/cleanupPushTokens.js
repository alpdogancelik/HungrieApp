const fs = require("node:fs");
const path = require("node:path");
const admin = require("firebase-admin");

const args = process.argv.slice(2);
const shouldCommit = args.includes("--commit");
const deleteAll = args.includes("--all");
const removeDuplicates = !args.includes("--no-dedupe");
const serviceAccountArg = args.find((arg) => arg.startsWith("--service-account="));
const projectIdArg = args.find((arg) => arg.startsWith("--project-id="));

const daysArg = args.find((arg) => arg.startsWith("--older-than-days="));
const olderThanDays = daysArg ? Number(daysArg.split("=")[1]) : null;
const olderThanMs =
    Number.isFinite(olderThanDays) && olderThanDays > 0
        ? Date.now() - olderThanDays * 24 * 60 * 60 * 1000
        : null;

const resolveProjectIdFromAppConfig = () => {
    try {
        const appJsonPath = path.resolve(__dirname, "..", "..", "mobile", "app.json");
        const raw = fs.readFileSync(appJsonPath, "utf8");
        const parsed = JSON.parse(raw);
        return parsed?.expo?.extra?.EXPO_PUBLIC_FIREBASE_PROJECT_ID || null;
    } catch {
        return null;
    }
};

const loadServiceAccount = () => {
    const explicitPath = serviceAccountArg ? serviceAccountArg.split("=")[1] : process.env.GOOGLE_APPLICATION_CREDENTIALS;
    if (!explicitPath) return null;

    const resolvedPath = path.resolve(process.cwd(), explicitPath);
    const raw = fs.readFileSync(resolvedPath, "utf8");
    return JSON.parse(raw);
};

const resolveProjectId = (serviceAccount) =>
    (projectIdArg ? projectIdArg.split("=")[1] : null) ||
    process.env.GCLOUD_PROJECT ||
    process.env.GOOGLE_CLOUD_PROJECT ||
    process.env.FIREBASE_PROJECT_ID ||
    serviceAccount?.project_id ||
    resolveProjectIdFromAppConfig();

const initializeFirebaseAdmin = () => {
    if (admin.apps.length) return admin.app();

    const serviceAccount = loadServiceAccount();
    const projectId = resolveProjectId(serviceAccount);

    if (serviceAccount) {
        return admin.initializeApp({
            credential: admin.credential.cert(serviceAccount),
            projectId,
        });
    }

    if (projectId) {
        return admin.initializeApp({ projectId });
    }

    throw new Error(
        [
            "Unable to determine Firebase credentials for local cleanup.",
            "Provide a service account JSON with --service-account=/path/to/serviceAccount.json",
            "or set GOOGLE_APPLICATION_CREDENTIALS and optionally --project-id.",
        ].join(" "),
    );
};

initializeFirebaseAdmin();
const db = admin.firestore();

const asMillis = (value) => {
    if (!value) return 0;
    if (typeof value?.toMillis === "function") return value.toMillis();
    if (value instanceof Date) return value.getTime();
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
};

const readTokensForOwnerCollection = async (collectionName) => {
    const ownerSnap = await db.collection(collectionName).get();
    const entries = [];

    for (const ownerDoc of ownerSnap.docs) {
        const tokenSnap = await ownerDoc.ref.collection("pushTokens").get();
        for (const tokenDoc of tokenSnap.docs) {
            const data = tokenDoc.data() || {};
            entries.push({
                ref: tokenDoc.ref,
                path: tokenDoc.ref.path,
                ownerCollection: collectionName,
                ownerId: ownerDoc.id,
                tokenDocId: tokenDoc.id,
                token: String(data.token || "").trim(),
                provider: String(data.provider || "").trim().toLowerCase(),
                platform: String(data.platform || "").trim().toLowerCase(),
                updatedAtMs: asMillis(data.updatedAt) || asMillis(data.createdAt),
                createdAtMs: asMillis(data.createdAt),
            });
        }
    }

    return entries;
};

const collectDeleteCandidates = (entries) => {
    const candidates = new Map();

    if (deleteAll) {
        for (const entry of entries) {
            candidates.set(entry.path, {
                entry,
                reason: "all",
            });
        }
        return [...candidates.values()];
    }

    if (olderThanMs) {
        for (const entry of entries) {
            const timestamp = entry.updatedAtMs || entry.createdAtMs;
            if (timestamp && timestamp < olderThanMs) {
                candidates.set(entry.path, {
                    entry,
                    reason: `older-than-${olderThanDays}-days`,
                });
            }
        }
    }

    if (removeDuplicates) {
        const groups = new Map();

        for (const entry of entries) {
            if (!entry.token) continue;
            const key = `${entry.provider || entry.platform || "unknown"}::${entry.token}`;
            const list = groups.get(key) || [];
            list.push(entry);
            groups.set(key, list);
        }

        for (const group of groups.values()) {
            if (group.length <= 1) continue;

            const sorted = [...group].sort((left, right) => {
                const leftTs = left.updatedAtMs || left.createdAtMs || 0;
                const rightTs = right.updatedAtMs || right.createdAtMs || 0;
                return rightTs - leftTs;
            });

            const keep = sorted[0];
            for (const entry of sorted.slice(1)) {
                if (entry.path === keep.path) continue;
                candidates.set(entry.path, {
                    entry,
                    reason: `duplicate-of:${keep.path}`,
                });
            }
        }
    }

    return [...candidates.values()];
};

const deleteCandidates = async (candidates) => {
    let deleted = 0;

    for (const { entry } of candidates) {
        await entry.ref.delete();
        deleted += 1;
    }

    return deleted;
};

async function main() {
    const [userTokens, restaurantTokens] = await Promise.all([
        readTokensForOwnerCollection("users"),
        readTokensForOwnerCollection("restaurants"),
    ]);

    const allEntries = [...userTokens, ...restaurantTokens];
    const candidates = collectDeleteCandidates(allEntries);

    console.log(
        JSON.stringify(
            {
                mode: shouldCommit ? "commit" : "dry-run",
                scanned: allEntries.length,
                deleteCount: candidates.length,
                criteria: {
                    all: deleteAll,
                    dedupe: removeDuplicates,
                    olderThanDays: olderThanDays || null,
                },
                sample: candidates.slice(0, 20).map(({ entry, reason }) => ({
                    path: entry.path,
                    token: entry.token,
                    provider: entry.provider || entry.platform || "unknown",
                    updatedAtMs: entry.updatedAtMs || null,
                    reason,
                })),
            },
            null,
            2,
        ),
    );

    if (!shouldCommit) {
        console.log('Dry run only. Re-run with "--commit" to delete.');
        return;
    }

    const deleted = await deleteCandidates(candidates);
    console.log(`Deleted ${deleted} token documents.`);
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
