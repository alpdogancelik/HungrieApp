"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const test = require("node:test");
const { writeLocalSecrets } = require("./writeLocalSecrets");

const SYNTHETIC_SECRET = "SUPABASE_SERVICE_ROLE_KEY=TEST_SECRET_DO_NOT_USE\n";
const digest = (value) => crypto.createHash("sha256").update(value).digest("hex");

function fixture() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "hungrie-local-secrets-"));
  const sourcePath = path.join(directory, "source.env");
  const destinationPath = path.join(directory, ".secret.local");
  fs.writeFileSync(sourcePath, SYNTHETIC_SECRET, { mode: 0o600 });
  return { directory, sourcePath, destinationPath };
}

function assertOwnerOnly(filePath) {
  if (process.platform === "win32") return;
  const mode = fs.statSync(filePath).mode & 0o777;
  assert.equal(mode, 0o600, `expected mode 0600, got ${mode.toString(8).padStart(4, "0")}`);
  assert.equal(mode & 0o077, 0, "group/other permission bits must be absent");
}

test("creates the local secret file owner-only under a permissive umask", (context) => {
  const paths = fixture();
  context.after(() => fs.rmSync(paths.directory, { recursive: true, force: true }));
  const previousUmask = process.umask(0o022);
  try {
    writeLocalSecrets(paths);
  } finally {
    process.umask(previousUmask);
  }
  assertOwnerOnly(paths.destinationPath);
  assert.equal(digest(fs.readFileSync(paths.destinationPath)), digest(SYNTHETIC_SECRET));
});

test("atomically replaces an existing 0644 secret file with an owner-only file", (context) => {
  const paths = fixture();
  context.after(() => fs.rmSync(paths.directory, { recursive: true, force: true }));
  fs.writeFileSync(paths.destinationPath, "SUPABASE_SERVICE_ROLE_KEY=OLD_SYNTHETIC_VALUE\n", { mode: 0o644 });
  fs.chmodSync(paths.destinationPath, 0o644);

  writeLocalSecrets(paths);

  assertOwnerOnly(paths.destinationPath);
  assert.equal(digest(fs.readFileSync(paths.destinationPath)), digest(SYNTHETIC_SECRET));
  assert.deepEqual(
    fs.readdirSync(paths.directory).filter((name) => name.includes(".tmp")),
    [],
    "secure temporary files must not remain after a successful rewrite",
  );
});

test("rejects unknown names without including secret values in the error", (context) => {
  const paths = fixture();
  context.after(() => fs.rmSync(paths.directory, { recursive: true, force: true }));
  fs.writeFileSync(paths.sourcePath, "UNEXPECTED_NAME=TEST_SECRET_DO_NOT_USE\n", { mode: 0o600 });

  assert.throws(
    () => writeLocalSecrets(paths),
    (error) => {
      assert.match(error.message, /Unsupported local secret name on line 1/);
      assert.doesNotMatch(error.message, /TEST_SECRET_DO_NOT_USE/);
      return true;
    },
  );
  assert.equal(fs.existsSync(paths.destinationPath), false);
});

test("rejects a group/other-readable source file on POSIX", { skip: process.platform === "win32" }, (context) => {
  const paths = fixture();
  context.after(() => fs.rmSync(paths.directory, { recursive: true, force: true }));
  fs.chmodSync(paths.sourcePath, 0o644);

  assert.throws(
    () => writeLocalSecrets(paths),
    /source secret file must not grant group or other access/,
  );
  assert.equal(fs.existsSync(paths.destinationPath), false);
});

test("the generated local secret path is excluded from Git", () => {
  const repositoryRoot = path.resolve(__dirname, "..", "..");
  const temporaryRepository = fs.mkdtempSync(path.join(os.tmpdir(), "hungrie-ignore-test-"));
  fs.mkdirSync(path.join(temporaryRepository, "functions"));
  fs.copyFileSync(
    path.join(repositoryRoot, ".gitignore"),
    path.join(temporaryRepository, ".gitignore"),
  );
  fs.copyFileSync(
    path.join(repositoryRoot, "functions", ".gitignore"),
    path.join(temporaryRepository, "functions", ".gitignore"),
  );
  const initialized = spawnSync("git", ["init", "--quiet"], {
    cwd: temporaryRepository,
    stdio: "ignore",
  });
  assert.equal(initialized.status, 0, "temporary Git repository must initialize");
  const result = spawnSync("git", ["check-ignore", "--quiet", "functions/.secret.local"], {
    cwd: temporaryRepository,
    stdio: "ignore",
  });
  fs.rmSync(temporaryRepository, { recursive: true, force: true });
  assert.equal(result.status, 0, "functions/.secret.local must remain ignored");
});
