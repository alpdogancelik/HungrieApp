"use strict";

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const LOCAL_SECRET_NAMES = new Set([
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "SUPABASE_STAGING_URL",
  "SUPABASE_STAGING_SERVICE_ROLE_KEY",
  "SUPABASE_PRODUCTION_URL",
  "SUPABASE_PRODUCTION_SERVICE_ROLE_KEY",
]);

function validateSecretFile(content) {
  let secretCount = 0;
  const lines = String(content).split(/\r?\n/);

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index].trim();
    if (!line || line.startsWith("#")) continue;

    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=/);
    if (!match) {
      throw new Error(`Invalid local secret assignment on line ${index + 1}.`);
    }
    if (!LOCAL_SECRET_NAMES.has(match[1])) {
      throw new Error(`Unsupported local secret name on line ${index + 1}.`);
    }
    secretCount += 1;
  }

  if (secretCount === 0) {
    throw new Error("The source file contains no supported local Functions secrets.");
  }
}

function writeLocalSecrets({ sourcePath, destinationPath }) {
  if (!path.isAbsolute(sourcePath)) {
    throw new Error("--source must be an absolute path outside the repository.");
  }

  const repositoryRoot = fs.realpathSync(path.resolve(__dirname, "..", ".."));
  const realSourcePath = fs.realpathSync(sourcePath);
  const sourceRelativeToRepository = path.relative(repositoryRoot, realSourcePath);
  if (sourceRelativeToRepository === "" || (!sourceRelativeToRepository.startsWith(`..${path.sep}`) && sourceRelativeToRepository !== "..")) {
    throw new Error("--source must be outside the repository.");
  }

  const sourceMetadata = fs.statSync(realSourcePath);
  if (!sourceMetadata.isFile()) throw new Error("--source must identify a regular file.");
  if (process.platform !== "win32") {
    if ((sourceMetadata.mode & 0o077) !== 0) {
      throw new Error("The source secret file must not grant group or other access.");
    }
    if (typeof process.getuid === "function" && sourceMetadata.uid !== process.getuid()) {
      throw new Error("The source secret file must be owned by the current user.");
    }
  }

  const content = fs.readFileSync(realSourcePath, "utf8");
  validateSecretFile(content);

  const directory = path.dirname(destinationPath);
  const temporaryPath = path.join(
    directory,
    `.secret.local.${process.pid}.${crypto.randomBytes(8).toString("hex")}.tmp`,
  );

  let descriptor;
  try {
    descriptor = fs.openSync(temporaryPath, "wx", 0o600);
    fs.writeFileSync(descriptor, content, "utf8");
    fs.fsyncSync(descriptor);
    if (process.platform !== "win32") fs.fchmodSync(descriptor, 0o600);
    fs.closeSync(descriptor);
    descriptor = undefined;
    fs.renameSync(temporaryPath, destinationPath);
    if (process.platform !== "win32") fs.chmodSync(destinationPath, 0o600);
  } catch (error) {
    if (descriptor !== undefined) fs.closeSync(descriptor);
    try {
      fs.unlinkSync(temporaryPath);
    } catch (cleanupError) {
      if (cleanupError.code !== "ENOENT") throw cleanupError;
    }
    throw error;
  }
}

function sourceArgument(argv) {
  const inline = argv.find((argument) => argument.startsWith("--source="));
  if (inline) return inline.slice("--source=".length);
  const index = argv.indexOf("--source");
  return index >= 0 ? argv[index + 1] : undefined;
}

if (require.main === module) {
  try {
    const sourcePath = sourceArgument(process.argv.slice(2));
    if (!sourcePath) throw new Error("Usage: npm run local:secrets -- --source=/absolute/path/to/secrets.env");
    const destinationPath = path.resolve(__dirname, "..", ".secret.local");
    writeLocalSecrets({ sourcePath, destinationPath });
    console.log("Local Functions secret file updated with owner-only permissions where supported.");
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

module.exports = { validateSecretFile, writeLocalSecrets };
