const path = require("node:path");

function canonicalMetroModulePath(modulePath, workspaceRoot) {
  if (typeof modulePath !== "string" || !modulePath) throw new Error("Metro module path is required.");
  if (modulePath.startsWith("\0")) return `virtual:${modulePath.slice(1).replaceAll("\\", "/")}`;
  const normalized = path.resolve(modulePath);
  const relative = path.relative(workspaceRoot, normalized);
  if (relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative))) return `workspace:${relative.split(path.sep).join("/")}`;
  throw new Error(`Metro module is outside the reviewed workspace: ${modulePath}`);
}

function createDeterministicMetroModuleIdFactory(workspaceRoot, reviewedIdentities) {
  const reviewedRoot = path.resolve(workspaceRoot);
  if (!Array.isArray(reviewedIdentities) || reviewedIdentities.length === 0) throw new Error("A reviewed Metro module identity map is required.");
  const sorted = [...reviewedIdentities].sort((left, right) => Buffer.from(left).compare(Buffer.from(right)));
  if (sorted.some((identity, index) => identity !== reviewedIdentities[index]) || new Set(sorted).size !== sorted.length) throw new Error("The reviewed Metro module identity map must be unique and sorted by UTF-8 bytes.");
  const ids = new Map(sorted.map((identity, index) => [identity, index]));
  return modulePath => {
    const identity = canonicalMetroModulePath(modulePath, reviewedRoot);
    const id = ids.get(identity);
    if (id === undefined) throw new Error(`Metro module is absent from the reviewed deterministic map: ${identity}`);
    return id;
  };
}

module.exports = { canonicalMetroModulePath, createDeterministicMetroModuleIdFactory };
