/* eslint-disable import/namespace */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { resolveAccountDeletionCallableName } from "./accountDeletionRouting.ts";

test("Development and Staging use the shared non-production deletion backend", () => {
    assert.equal(resolveAccountDeletionCallableName("development"), "deleteHungrieAccount");
    assert.equal(resolveAccountDeletionCallableName("staging"), "deleteHungrieAccount");
});

test("Production uses only the production-bound deletion backend", () => {
    assert.equal(resolveAccountDeletionCallableName("production"), "deleteHungrieAccountProduction");
    assert.notEqual(resolveAccountDeletionCallableName("production"), "deleteHungrieAccount");
});

test("unknown environments fail closed", () => {
    assert.throws(() => resolveAccountDeletionCallableName("preview"), /not configured/);
    assert.throws(() => resolveAccountDeletionCallableName(""), /not configured/);
});

test("the Customer deletion path resolves the callable and clears local Firebase persistence", () => {
    const testDirectory = path.dirname(fileURLToPath(import.meta.url));
    const repositorySource = fs.readFileSync(path.join(testDirectory, "supabase/profileRepository.ts"), "utf8");
    const routerSource = fs.readFileSync(path.join(testDirectory, "profileRepository.ts"), "utf8");
    const legacyFirebaseSource = fs.readFileSync(path.join(testDirectory, "../../lib/firebaseAuth.ts"), "utf8");
    const profileSource = fs.readFileSync(path.join(testDirectory, "../features/profile/useProfile.ts"), "utf8");
    assert.match(repositorySource, /resolveAccountDeletionCallableName\(firebaseConfig\.environment\)/);
    assert.doesNotMatch(repositorySource, /httpsCallable\(functions,\s*["']deleteHungrieAccount["']\)/);
    assert.match(routerSource, /supabaseProfileRepository\.deleteCurrentUserProfile\(\)/);
    assert.doesNotMatch(routerSource, /profileRepository\.deleteCurrentUserProfile\(\)/);
    assert.doesNotMatch(legacyFirebaseSource, /deleteUser\(/);
    assert.match(profileSource, /await clearDeletedAccountSession\(\)/);
});
