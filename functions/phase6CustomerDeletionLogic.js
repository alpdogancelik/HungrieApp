const beginSharedAccountDeletion = async ({ uid, environments, begin }) => {
    const begun = [];
    for (const environment of environments) {
        const result = await begin(environment, uid);
        begun.push({ environment, result });
    }
    return begun;
};

const finalizeSharedAccountDeletion = async ({ uid, begun, finalize }) => {
    const failures = [];
    for (const entry of begun) {
        const profileId = entry.result?.profile_id;
        if (!profileId) continue;
        try {
            const finalized = await finalize(entry.environment, profileId, uid);
            if (finalized !== true) throw Object.assign(new Error("Account anonymization was not finalized."), { code: "not-finalized" });
        } catch (error) {
            failures.push({ environment: entry.environment.name, code: error?.code || "unknown" });
        }
    }
    return failures;
};

const deleteSharedNonProductionAccount = async ({ uid, environments, begin, scrub, deleteIdentity, finalize }) => {
    // Firebase Auth is shared by Development and Staging. Both databases must
    // accept deletion before the global Firebase identity can be removed.
    const begun = await beginSharedAccountDeletion({ uid, environments, begin });
    await scrub(uid);
    try {
        await deleteIdentity(uid);
    } catch (error) {
        // A retry may arrive after Firebase deletion but before the caller
        // received the response. Database begin/finalize operations remain
        // idempotent, so an already-absent identity is a completed step.
        if (error?.code !== "auth/user-not-found") throw error;
    }
    const finalizationFailures = await finalizeSharedAccountDeletion({ uid, begun, finalize });
    return { begun, finalizationFailures };
};

module.exports = {
    beginSharedAccountDeletion,
    finalizeSharedAccountDeletion,
    deleteSharedNonProductionAccount,
};
