#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const root = path.resolve(import.meta.dirname, "..");
const baseline = "71e5d7e08189bbe0da3849c48db16ef10cd6a27f";
const output = path.join(root, "docs/restaurant-responsive-ui-phase5-edge-package");
const dist = path.join(root, "apps/restaurant/dist");
const sha = buffer => crypto.createHash("sha256").update(buffer).digest("hex");
const hashFile = file => sha(fs.readFileSync(file));
const walk = directory => fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? walk(path.join(directory, entry.name)) : [path.join(directory, entry.name)]);
fs.rmSync(output, { recursive: true, force: true });
fs.mkdirSync(output, { recursive: true, mode: 0o700 });

const tracked = execFileSync("git", ["diff", "--name-status", baseline, "--"], { cwd: root, encoding: "utf8" }).trim().split("\n").filter(Boolean).map(line => { const [status, ...parts] = line.split("\t"); return { status, file: parts.at(-1) }; });
const untracked = execFileSync("git", ["ls-files", "--others", "--exclude-standard"], { cwd: root, encoding: "utf8" }).trim().split("\n").filter(file => file && !file.startsWith("docs/restaurant-responsive-ui-phase5-")).map(file => ({ status: "A", file }));
const sourceEntries = [...tracked, ...untracked]
  .filter(({ file }) => !file.startsWith("apps/restaurant/dist/") && !file.startsWith("docs/restaurant-responsive-ui-phase5-"))
  .sort((a, b) => a.file.localeCompare(b.file))
  .map(entry => ({ ...entry, sha256: entry.status === "D" ? null : hashFile(path.join(root, entry.file)) }));
const sourceCanonical = sourceEntries.map(entry => `${entry.status}\t${entry.sha256 || "DELETED"}\t${entry.file}`).join("\n") + "\n";
fs.writeFileSync(path.join(output, "phase5-source-manifest.tsv"), sourceCanonical, { mode: 0o600 });
const sourceManifestSha256 = sha(sourceCanonical);

const artifactEntries = walk(dist).sort().map(file => ({ file: path.relative(dist, file).split(path.sep).join("/"), bytes: fs.statSync(file).size, sha256: hashFile(file) }));
const artifactCanonical = artifactEntries.map(entry => `${entry.sha256}\t${entry.bytes}\t${entry.file}`).join("\n") + "\n";
fs.writeFileSync(path.join(output, "artifact-manifest.tsv"), artifactCanonical, { mode: 0o600 });
const artifactManifestSha256 = sha(artifactCanonical);
const routes = artifactEntries.filter(entry => entry.file.endsWith(".html")).map(entry => entry.file === "index.html" ? "/" : `/${entry.file.replace(/\/index\.html$/, "").replace(/\.html$/, "")}`);
fs.writeFileSync(path.join(output, "static-routes.txt"), routes.join("\n") + "\n", { mode: 0o600 });

const archive = path.join(output, "restaurant-phase5-static-export.tar");
const python = `import io, os, pathlib, tarfile\nroot=pathlib.Path(${JSON.stringify(dist)})\nout=${JSON.stringify(archive)}\nwith tarfile.open(out, 'w', format=tarfile.PAX_FORMAT) as tar:\n for file in sorted(p for p in root.rglob('*') if p.is_file()):\n  data=file.read_bytes(); info=tarfile.TarInfo(file.relative_to(root).as_posix()); info.size=len(data); info.mtime=0; info.uid=0; info.gid=0; info.uname=''; info.gname=''; info.mode=0o644; tar.addfile(info, io.BytesIO(data))\n`;
execFileSync("python3", ["-c", python], { cwd: root });
const artifactSha256 = hashFile(archive);

const offlineServer = `#!/usr/bin/env python3
import argparse
import http.server
import os
import urllib.parse

class ExpoStaticHandler(http.server.SimpleHTTPRequestHandler):
    def resolve_export_path(self):
        parsed = urllib.parse.urlsplit(self.path)
        requested = urllib.parse.unquote(parsed.path)
        if requested.endswith(".html") and requested != "/index.html":
            target = requested[:-5] or "/"
            if parsed.query:
                target += "?" + parsed.query
            self.send_response(302)
            self.send_header("Location", target)
            self.end_headers()
            return False
        relative = requested.lstrip("/")
        if requested == "/":
            candidate = "index.html"
        elif not os.path.splitext(relative)[1]:
            candidate = relative + ".html"
        else:
            candidate = relative
        if os.path.isfile(os.path.join(self.directory, candidate)):
            self.path = "/" + urllib.parse.quote(candidate) + (("?" + parsed.query) if parsed.query else "")
        return True

    def do_GET(self):
        if self.resolve_export_path():
            super().do_GET()

    def do_HEAD(self):
        if self.resolve_export_path():
            super().do_HEAD()

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--directory", default="artifact")
    parser.add_argument("--port", type=int, default=4188)
    args = parser.parse_args()
    handler = lambda *values, **keywords: ExpoStaticHandler(*values, directory=args.directory, **keywords)
    with http.server.ThreadingHTTPServer(("127.0.0.1", args.port), handler) as server:
        print(f"Serving Expo static export at http://127.0.0.1:{args.port}")
        server.serve_forever()
`;
fs.writeFileSync(path.join(output, "serve-offline.py"), offlineServer, { mode: 0o700 });

const checklist = `# Restaurant UI Phase 5 — Windows Edge Offline Checklist

Phase 4 baseline: \`${baseline}\`
Source manifest SHA-256: \`${sourceManifestSha256}\`
Artifact manifest SHA-256: \`${artifactManifestSha256}\`
Static artifact SHA-256: \`${artifactSha256}\`

## Prepare and serve

1. Copy this complete directory to the approved Windows desktop.
2. Verify hashes in PowerShell:
   \`Get-FileHash .\\restaurant-phase5-static-export.tar -Algorithm SHA256\`
   \`Get-FileHash .\\artifact-manifest.tsv -Algorithm SHA256\`
   \`Get-FileHash .\\phase5-source-manifest.tsv -Algorithm SHA256\`
3. Extract: \`tar -xf .\\restaurant-phase5-static-export.tar -C .\\artifact\`
4. Serve without a hosted environment: \`py .\\serve-offline.py --directory .\\artifact --port 4188\`. This keeps Expo Router URLs extensionless while resolving them to the exported HTML files.
5. Open \`http://127.0.0.1:4188/login\` in the current stable Microsoft Edge. Do not append \`.html\` to route URLs.
6. Keep DevTools closed for viewport screenshots. Use Edge responsive mode only when exact viewport dimensions cannot be achieved by the window.

## Record

- Windows edition/version/build and Edge full version.
- Confirm all three hashes above match exactly.
- English and Turkish at 1024×768 and 1440×900.
- At 100% and 200% zoom: no horizontal page overflow, clipped content, covered actions, translucent sticky surfaces, or scroll traps.
- Keyboard only: skip link, primary navigation, forms, Reviews tabs with Arrow/Home/End, dialog focus containment, Escape/cancel, and focus restoration.
- Check representative login, Dashboard, Orders/detail, Menu/editor, Reviews/report dialog, Alerts, Security, and owner Earnings routes. Authentication may remain at the local configuration/error surface; do not connect to any hosted environment.
- Save PNG screenshots, compute each with \`Get-FileHash <file> -Algorithm SHA256\`, and enter every result in \`edge-evidence-template.md\`.

Any change to an application, style, localization, or runtime file invalidates this package and the affected Edge evidence.
`;
fs.writeFileSync(path.join(output, "README.md"), checklist, { mode: 0o600 });
fs.writeFileSync(path.join(output, "edge-evidence-template.md"), `# Windows Edge evidence\n\n- Tester/date:\n- Windows version/build:\n- Edge version:\n- Phase 4 baseline: \`${baseline}\`\n- Source manifest SHA-256: \`${sourceManifestSha256}\` — MATCH / FAIL\n- Artifact manifest SHA-256: \`${artifactManifestSha256}\` — MATCH / FAIL\n- Static artifact SHA-256: \`${artifactSha256}\` — MATCH / FAIL\n\n| Locale | Viewport | Zoom | Keyboard | Overflow/clipping | Covered action | Sticky opacity | Scroll trap | Result | Screenshot file | Screenshot SHA-256 |\n|---|---:|---:|---|---|---|---|---|---|---|---|\n| English | 1024×768 | 100% | | | | | | | | |\n| English | 1024×768 | 200% | | | | | | | | |\n| English | 1440×900 | 100% | | | | | | | | |\n| English | 1440×900 | 200% | | | | | | | | |\n| Turkish | 1024×768 | 100% | | | | | | | | |\n| Turkish | 1024×768 | 200% | | | | | | | | |\n| Turkish | 1440×900 | 100% | | | | | | | | |\n| Turkish | 1440×900 | 200% | | | | | | | | |\n\n## Keyboard paths\n\n- Skip link:\n- Navigation:\n- Forms:\n- Reviews tabs Arrow/Home/End:\n- Dialog containment, Escape/cancel, restoration:\n\n## Failures or observations\n`, { mode: 0o600 });
const packageMetadata = { generatedAt: new Date().toISOString(), phase4Baseline: baseline, sourceManifestSha256, artifactManifestSha256, artifactSha256, routes, sourceEntries: sourceEntries.length, artifactFiles: artifactEntries.length };
fs.writeFileSync(path.join(output, "package.json"), JSON.stringify(packageMetadata, null, 2) + "\n", { mode: 0o600 });
console.log(JSON.stringify(packageMetadata));
