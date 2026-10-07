"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");

const CREDENTIAL_SUFFIX = "_application_default_credentials.json";

function requireCurrentUserOwnership(metadata, label) {
  if (typeof process.getuid === "function" && metadata.uid !== process.getuid()) {
    throw new Error(`${label} must be owned by the current user.`);
  }
}

function secureOwnedRegularFile(filePath, label) {
  const metadata = fs.lstatSync(filePath);
  if (!metadata.isFile() || metadata.isSymbolicLink()) {
    throw new Error(`${label} must be a regular file.`);
  }
  requireCurrentUserOwnership(metadata, label);
  fs.chmodSync(filePath, 0o600);
}

function prepareFirebaseEmulatorEnvironment({
  homeDirectory = process.env.HOME,
  workingDirectory = process.cwd(),
} = {}) {
  if (process.platform === "win32") return { previousUmask: undefined, securedFiles: 0 };
  if (!homeDirectory) throw new Error("HOME is required to secure Firebase CLI credentials.");

  const previousUmask = process.umask(0o077);
  const firebaseConfigDirectory = path.join(homeDirectory, ".config", "firebase");
  let securedFiles = 0;

  if (fs.existsSync(firebaseConfigDirectory)) {
    const directoryMetadata = fs.lstatSync(firebaseConfigDirectory);
    if (!directoryMetadata.isDirectory() || directoryMetadata.isSymbolicLink()) {
      throw new Error("Firebase CLI configuration path must be a real directory.");
    }
    requireCurrentUserOwnership(directoryMetadata, "Firebase CLI configuration directory");
    fs.chmodSync(firebaseConfigDirectory, 0o700);

    for (const name of fs.readdirSync(firebaseConfigDirectory)) {
      if (!name.endsWith(CREDENTIAL_SUFFIX)) continue;
      const credentialPath = path.join(firebaseConfigDirectory, name);
      secureOwnedRegularFile(credentialPath, "Firebase CLI credential file");
      securedFiles += 1;
    }
  }

  for (const name of fs.readdirSync(workingDirectory)) {
    if (!/^firebase-debug(?:\.\d+)?\.log$/.test(name)) continue;
    secureOwnedRegularFile(path.join(workingDirectory, name), "Firebase CLI debug log");
  }

  return { previousUmask, securedFiles };
}

if (require.main === module) {
  try {
    prepareFirebaseEmulatorEnvironment();
    const firebaseArguments = process.argv.slice(2);
    if (firebaseArguments.length === 0) {
      throw new Error("A Firebase CLI command is required.");
    }
    const child = spawn(
      "firebase",
      firebaseArguments,
      { stdio: "inherit" },
    );
    child.once("error", (error) => {
      console.error(`Unable to start the secured Firebase CLI process: ${error.message}`);
      process.exitCode = 1;
    });
    child.once("exit", (code, signal) => {
      if (signal) process.kill(process.pid, signal);
      else process.exitCode = code ?? 1;
    });
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

module.exports = { CREDENTIAL_SUFFIX, prepareFirebaseEmulatorEnvironment };
