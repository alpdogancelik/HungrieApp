import assert from "node:assert/strict";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const root = path.resolve(import.meta.dirname, "..");
const dist = path.join(root, "dist");
const fixtureDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "hungrie-customer-web-headers-"));
const googleServicesFixture = path.join(fixtureDirectory, "google-services.json");
fs.writeFileSync(googleServicesFixture, JSON.stringify({
    project_info: { project_id: "hungrie-production-fixture" },
}), { mode: 0o600 });
Object.assign(process.env, {
    EXPO_PUBLIC_APP_ENV: "production",
    EXPO_PUBLIC_FIREBASE_PROJECT_ID: "hungrie-production-fixture",
    EXPO_PUBLIC_EXPECTED_FIREBASE_PROJECT_ID: "hungrie-production-fixture",
    EXPO_PUBLIC_FIREBASE_API_KEY: "production-fixture-api-key",
    EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN: "hungrie-production-fixture.firebaseapp.com",
    EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: "100000000001",
    EXPO_PUBLIC_FIREBASE_APP_ID: "1:100000000001:web:productionfixture",
    EXPO_PUBLIC_FIREBASE_APPCHECK_RECAPTCHA_ENTERPRISE_SITE_KEY: "production-fixture-site-key",
    EXPO_PUBLIC_SUPABASE_URL: "https://prodfixtureabc.supabase.co",
    EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "production-fixture-publishable-key",
    EXPO_PUBLIC_SUPABASE_ENABLED: "true",
    EXPO_PUBLIC_EXPECTED_SUPABASE_PROJECT_REF: "prodfixtureabc",
    GOOGLE_SERVICES_JSON: googleServicesFixture,
});

const expoBin = path.resolve(root, "../node_modules/expo/bin/cli");
let exportedFixture;
try {
    exportedFixture = spawnSync(process.execPath, [expoBin, "export", "--platform", "web", "--clear"], {
        cwd: root,
        env: process.env,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
    });
} finally {
    fs.rmSync(fixtureDirectory, { recursive: true });
}
assert.equal(
    exportedFixture.status,
    0,
    `Deterministic Customer security-header fixture export failed.\n${exportedFixture.stderr}`,
);

const { config, resolveCustomerWebSecurityHeaders } = await import("../vercel.mjs");
const headerRoute = config.routes?.find((route) => route.src === "/(.*)" && route.continue === true);
const headers = headerRoute?.headers || {};
const csp = String(headers["Content-Security-Policy"] || "");

const directives = new Map(
    csp
        .split(";")
        .map((part) => part.trim())
        .filter(Boolean)
        .map((part) => {
            const [name, ...sources] = part.split(/\s+/);
            return [name, sources];
        }),
);

const htmlFiles = [];
const walk = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        const file = path.join(directory, entry.name);
        if (entry.isDirectory()) walk(file);
        else if (file.endsWith(".html")) htmlFiles.push(file);
    }
};

test("Vercel applies the baseline response headers before filesystem and fallback routing", () => {
    assert.ok(headerRoute, "A continuing all-route header rule is required before routing.");
    assert.equal(config.routes[0], headerRoute, "Headers must run before the filesystem route.");
    assert.deepEqual(config.routes.at(-1), { src: "/.*", dest: "/" });
    assert.equal(headers["X-Content-Type-Options"], "nosniff");
    assert.equal(headers["X-Frame-Options"], "DENY");
    assert.equal(headers["Referrer-Policy"], "strict-origin-when-cross-origin");
    assert.equal(headers["Strict-Transport-Security"], "max-age=31536000");
    assert.doesNotMatch(headers["Strict-Transport-Security"], /includeSubDomains|preload/i);
    assert.match(headers["Permissions-Policy"], /camera=\(\)/);
    assert.match(headers["Permissions-Policy"], /clipboard-write=\(self\)/);
    const headerMatcher = new RegExp(`^${headerRoute.src}$`);
    for (const route of ["/", "/sign-in", "/restaurants/restaurant-id", "/cart", "/checkout", "/profile", "/missing"]) {
        assert.match(route, headerMatcher, `Header rule does not cover ${route}`);
    }
});

test("CSP is enforced, least privilege, and preserves required Customer services", () => {
    for (const name of [
        "default-src", "script-src", "style-src", "img-src", "font-src", "connect-src",
        "frame-src", "worker-src", "object-src", "base-uri", "form-action", "frame-ancestors",
    ]) assert.ok(directives.has(name), `Missing CSP directive: ${name}`);

    assert.deepEqual(directives.get("default-src"), ["'self'"]);
    assert.deepEqual(directives.get("object-src"), ["'none'"]);
    assert.deepEqual(directives.get("frame-ancestors"), ["'none'"]);
    assert.ok(directives.get("script-src").includes("https://www.google.com"));
    assert.ok(directives.get("script-src").includes("https://www.gstatic.com"));
    assert.ok(directives.get("connect-src").includes("https://prodfixtureabc.supabase.co"));
    assert.ok(directives.get("connect-src").includes("wss://prodfixtureabc.supabase.co"));
    assert.ok(directives.get("connect-src").includes("https://identitytoolkit.googleapis.com"));
    assert.ok(directives.get("connect-src").includes("https://content-firebaseappcheck.googleapis.com"));
    assert.ok(directives.get("img-src").includes("https://images.pexels.com"));
    assert.ok(directives.get("img-src").includes("https://prodfixtureabc.supabase.co"));

    assert.doesNotMatch(csp, /(?:^|\s)\*(?:\s|;|$)/, "Bare wildcard CSP sources are forbidden.");
    assert.doesNotMatch(csp, /(?:^|\s)(?:https?|wss?):(?:\s|;|$)/, "Broad scheme sources are forbidden.");
    assert.doesNotMatch(csp, /unsafe-eval/);
    assert.ok(!directives.get("script-src").includes("'unsafe-inline'"));
    assert.doesNotMatch(csp, /localhost|127\.0\.0\.1|10\.\d+\.\d+\.\d+|rgjlsjwsitbnwoetmidb|rlrfvqskzvpysewdxqcr/);
});

test("Production hosting configuration fails closed on missing or non-production bindings", () => {
    assert.throws(() => resolveCustomerWebSecurityHeaders({}), /requires EXPO_PUBLIC_APP_ENV/);
    assert.throws(() => resolveCustomerWebSecurityHeaders({
        EXPO_PUBLIC_APP_ENV: "production",
        EXPO_PUBLIC_FIREBASE_PROJECT_ID: "hungrieapp-a2288",
        EXPO_PUBLIC_EXPECTED_FIREBASE_PROJECT_ID: "hungrieapp-a2288",
        EXPO_PUBLIC_FIREBASE_APPCHECK_RECAPTCHA_ENTERPRISE_SITE_KEY: "fixture",
        EXPO_PUBLIC_SUPABASE_URL: "https://rlrfvqskzvpysewdxqcr.supabase.co",
        EXPO_PUBLIC_EXPECTED_SUPABASE_PROJECT_REF: "rlrfvqskzvpysewdxqcr",
    }), /cannot trust a non-production service origin/);
    assert.throws(() => resolveCustomerWebSecurityHeaders({
        EXPO_PUBLIC_APP_ENV: "production",
        EXPO_PUBLIC_FIREBASE_PROJECT_ID: "hungrie-production-fixture",
        EXPO_PUBLIC_EXPECTED_FIREBASE_PROJECT_ID: "different-production-project",
        EXPO_PUBLIC_FIREBASE_APPCHECK_RECAPTCHA_ENTERPRISE_SITE_KEY: "fixture",
        EXPO_PUBLIC_SUPABASE_URL: "https://prodfixtureabc.supabase.co",
        EXPO_PUBLIC_EXPECTED_SUPABASE_PROJECT_REF: "prodfixtureabc",
    }), /Firebase project binding mismatch/);
});

test("the current static export is covered and every inline script is hash-authorized", () => {
    assert.ok(fs.existsSync(dist), "Run the deterministic Customer web export before this test.");
    walk(dist);
    assert.ok(htmlFiles.length >= 5, "Expected representative static HTML routes.");

    for (const relative of [
        "index.html", "sign-in.html", "restaurants/[id].html", "cart.html", "checkout.html", "profile.html",
    ]) assert.ok(fs.existsSync(path.join(dist, relative)), `Missing representative route: ${relative}`);

    const scriptSources = directives.get("script-src");
    let inlineScripts = 0;
    let inlineStyles = 0;
    let styleAttributes = 0;
    for (const file of htmlFiles) {
        const html = fs.readFileSync(file, "utf8");
        for (const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
            if (/\bsrc=/.test(match[1])) continue;
            inlineScripts += 1;
            const hash = crypto.createHash("sha256").update(match[2]).digest("base64");
            assert.ok(scriptSources.includes(`'sha256-${hash}'`), `CSP blocks inline script in ${path.relative(dist, file)}`);
        }
        inlineStyles += [...html.matchAll(/<style\b[^>]*>[\s\S]*?<\/style>/gi)].length;
        styleAttributes += [...html.matchAll(/\sstyle=/gi)].length;
    }
    assert.ok(inlineScripts > 0, "Expected Expo's static bootstrap script.");
    assert.ok(inlineStyles > 0 && styleAttributes > 0, "The style-src exception must remain tied to generated inline styles.");
    assert.ok(directives.get("style-src").includes("'unsafe-inline'"));
});

test("the export has no PWA worker and contains no environment-specific development endpoints", () => {
    for (const file of ["sw.js", "service-worker.js", "manifest.json", "manifest.webmanifest"]) {
        assert.equal(fs.existsSync(path.join(dist, file)), false, `Unexpected PWA artifact: ${file}`);
    }
    const exported = htmlFiles.map((file) => fs.readFileSync(file, "utf8")).join("\n");
    assert.doesNotMatch(exported, /localhost|127\.0\.0\.1|rgjlsjwsitbnwoetmidb|rlrfvqskzvpysewdxqcr/);
    const bundles = fs.readdirSync(path.join(dist, "_expo/static/js/web"))
        .filter((name) => name.endsWith(".js"))
        .map((name) => fs.readFileSync(path.join(dist, "_expo/static/js/web", name), "utf8"))
        .join("\n");
    assert.match(bundles, /https:\/\/prodfixtureabc\.supabase\.co/);
    assert.doesNotMatch(bundles, /https:\/\/(?:rgjlsjwsitbnwoetmidb|rlrfvqskzvpysewdxqcr)\.supabase\.co/);
});
