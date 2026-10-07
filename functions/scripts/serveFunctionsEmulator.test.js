"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { CREDENTIAL_SUFFIX, prepareFirebaseEmulatorEnvironment } = require("./serveFunctionsEmulator");

test("emulator preparation secures existing credentials and future CLI writes", {
  skip: process.platform === "win32",
}, (context) => {
  const homeDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "hungrie-firebase-home-"));
  context.after(() => fs.rmSync(homeDirectory, { recursive: true, force: true }));
  const firebaseDirectory = path.join(homeDirectory, ".config", "firebase");
  fs.mkdirSync(firebaseDirectory, { recursive: true, mode: 0o755 });
  fs.chmodSync(firebaseDirectory, 0o755);
  const existingCredential = path.join(firebaseDirectory, `existing${CREDENTIAL_SUFFIX}`);
  fs.writeFileSync(existingCredential, "TEST_CREDENTIAL_DO_NOT_USE", { mode: 0o644 });
  fs.chmodSync(existingCredential, 0o644);
  const debugLog = path.join(homeDirectory, "firebase-debug.log");
  fs.writeFileSync(debugLog, "TEST LOG WITHOUT CREDENTIALS", { mode: 0o644 });
  fs.chmodSync(debugLog, 0o644);

  const originalUmask = process.umask(0o022);
  try {
    const result = prepareFirebaseEmulatorEnvironment({ homeDirectory, workingDirectory: homeDirectory });
    assert.equal(result.previousUmask, 0o022);
    assert.equal(result.securedFiles, 1);
    assert.equal(fs.statSync(firebaseDirectory).mode & 0o777, 0o700);
    assert.equal(fs.statSync(existingCredential).mode & 0o777, 0o600);
    assert.equal(fs.statSync(debugLog).mode & 0o777, 0o600);

    const generatedCredential = path.join(firebaseDirectory, `generated${CREDENTIAL_SUFFIX}`);
    fs.writeFileSync(generatedCredential, "TEST_CREDENTIAL_DO_NOT_USE", "utf8");
    assert.equal(fs.statSync(generatedCredential).mode & 0o777, 0o600);

    fs.chmodSync(existingCredential, 0o644);
    prepareFirebaseEmulatorEnvironment({ homeDirectory, workingDirectory: homeDirectory });
    fs.writeFileSync(existingCredential, "UPDATED_TEST_CREDENTIAL_DO_NOT_USE", "utf8");
    assert.equal(fs.statSync(existingCredential).mode & 0o777, 0o600);
  } finally {
    process.umask(originalUmask);
  }
});

test("emulator preparation rejects a symlinked Firebase configuration directory", {
  skip: process.platform === "win32",
}, (context) => {
  const homeDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "hungrie-firebase-home-"));
  const targetDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "hungrie-firebase-target-"));
  context.after(() => {
    fs.rmSync(homeDirectory, { recursive: true, force: true });
    fs.rmSync(targetDirectory, { recursive: true, force: true });
  });
  fs.mkdirSync(path.join(homeDirectory, ".config"), { mode: 0o700 });
  fs.symlinkSync(targetDirectory, path.join(homeDirectory, ".config", "firebase"));

  const originalUmask = process.umask();
  try {
    assert.throws(
      () => prepareFirebaseEmulatorEnvironment({ homeDirectory }),
      /must be a real directory/,
    );
  } finally {
    process.umask(originalUmask);
  }
});
