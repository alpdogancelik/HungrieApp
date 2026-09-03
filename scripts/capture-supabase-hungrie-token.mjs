import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CLI_HOME = path.join(ROOT_DIR, "secure", "supabase-cli-hungrie");
const TOKEN_PATH = path.join(CLI_HOME, "access-token");

if (process.platform !== "darwin") {
  throw new Error("This helper only copies the current macOS Supabase CLI credential. Write a PAT to the ignored access-token file on other platforms.");
}

const result = spawnSync(
  "security",
  ["find-generic-password", "-s", "Supabase CLI", "-a", "supabase", "-w"],
  { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
);
if (result.status !== 0) throw new Error("Unable to read the current Supabase CLI credential from macOS Keychain.");

const token = String(result.stdout || "").trim();
if (!/^sbp_[A-Za-z0-9_-]+$/.test(token)) throw new Error("The Keychain item is not a valid Supabase personal access token.");

fs.mkdirSync(CLI_HOME, { recursive: true, mode: 0o700 });
fs.chmodSync(CLI_HOME, 0o700);
fs.writeFileSync(TOKEN_PATH, `${token}\n`, { mode: 0o600 });
fs.chmodSync(TOKEN_PATH, 0o600);
console.log("Copied the current Supabase session into the ignored Hungrie credential store.");
