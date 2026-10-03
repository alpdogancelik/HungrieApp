import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test, { after } from "node:test";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { transformSync } from "@babel/core";
import presetReact from "@babel/preset-react";
import presetTypeScript from "@babel/preset-typescript";
import transformModulesCommonjs from "@babel/plugin-transform-modules-commonjs";
import React, { createContext, useContext, useLayoutEffect } from "react";
import TestRenderer, { act } from "react-test-renderer";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourcePath = path.join(root, "apps/restaurant/src/AuthGate.tsx");
const source = fs.readFileSync(sourcePath, "utf8");
const compiled = transformSync(source, {
  filename: sourcePath,
  presets: [
    [presetTypeScript, { isTSX: true, allExtensions: true }],
    [presetReact, { runtime: "automatic" }],
  ],
  plugins: [transformModulesCommonjs],
  sourceMaps: "inline",
}).code;
const nodeRequire = createRequire(import.meta.url);
const routeLifecycleEvidence = [];
after(() => {
  const directory = path.join(root, "docs/restaurant-authgate-pending-remediation-evidence");
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(path.join(directory, "route-lifecycle-counts.json"), `${JSON.stringify({ generatedAt: new Date().toISOString(), cases: routeLifecycleEvidence }, null, 2)}\n`);
});

class AccessContextError extends Error {}

function createHarness(initialPath = "/login") {
  const runtimeContext = createContext(null);
  const accessContext = createContext(null);
  const accessReady = createContext(false);
  const events = [];
  const accessResults = [];
  let pathName = initialPath;
  let listener;
  let renderer;
  let pendingReplacement = null;
  let subscriptionCount = 0;
  let renderCount = 0;

  const auth = { currentUser: null };
  const router = {
    replace(next) {
      events.push(`replace:${next}`);
      pendingReplacement = String(next).split("?")[0];
    },
  };

  function RuntimeProvider({ restaurantId, role, children }) {
    events.push(`provider-render:${restaurantId}:${role}`);
    useLayoutEffect(() => {
      events.push(`provider-mounted:${restaurantId}:${role}`);
      return () => events.push(`provider-unmounted:${restaurantId}:${role}`);
    }, [restaurantId, role]);
    return React.createElement(runtimeContext.Provider, { value: { restaurantId, role } }, children);
  }

  function RouteContent() {
    renderCount += 1;
    const access = useContext(accessContext);
    const runtime = useContext(runtimeContext);
    if (["/login", "/forgot-password", "/invite", "/pending", "/suspended"].includes(pathName)) {
      events.push(`public-render:${pathName}:${access?.accountStatus || "none"}`);
      return React.createElement("div", { "data-route": pathName }, pathName);
    }
    if (!runtime) throw new Error("Restaurant runtime is unavailable");
    events.push(`protected-render:${pathName}:${runtime.role}`);
    return React.createElement("main", { "data-route": pathName }, pathName);
  }

  const modules = {
    "firebase/auth": {
      onIdTokenChanged(_auth, callback) {
        subscriptionCount += 1;
        events.push(`auth-subscribe:${pathName}`);
        listener = callback;
        return () => events.push("auth-unsubscribe");
      },
    },
    "expo-router": {
      usePathname: () => pathName,
      useRouter: () => router,
    },
    react: React,
    "react/jsx-runtime": nodeRequire("react/jsx-runtime"),
    "./firebase": {
      auth,
      ensureSessionPersistence: async () => events.push("persistence-ready"),
    },
    "./supabase": {
      supabase: {
        rpc(name) {
          assert.equal(name, "get_my_access_context_v1");
          events.push("access-request");
          return {
            abortSignal: async () => {
              assert.ok(accessResults.length, "Missing access-context result");
              const next = await accessResults.shift();
              return next instanceof Error ? { data: null, error: next } : { data: next, error: null };
            },
          };
        },
      },
    },
    "./providers": { useLocale: () => ({ t: { loading: "Loading", unavailable: "Unavailable", retry: "Retry" } }) },
    "./RestaurantAccessReady": { RestaurantAccessReady: accessReady },
    "./RestaurantAccessContext": {
      RestaurantAccessContext: accessContext,
      RestaurantAccessContextError: AccessContextError,
      parseRestaurantAccessContext: value => value,
    },
    "./RestaurantRuntimeContext": { RestaurantRuntimeProvider: RuntimeProvider },
    "./components/DataState": { DataState: ({ kind }) => React.createElement("div", { "data-state": kind }, kind) },
    "./restaurantSignOut": { restaurantSignOut: async () => events.push("sign-out") },
  };

  const module = { exports: {} };
  const localRequire = request => {
    if (request in modules) return modules[request];
    throw new Error(`Unexpected AuthGate dependency: ${request}`);
  };
  Function("require", "module", "exports", "__filename", "__dirname", compiled)(localRequire, module, module.exports, sourcePath, path.dirname(sourcePath));
  const { AuthGate } = module.exports;

  const app = () => React.createElement(AuthGate, null, React.createElement(RouteContent));
  return {
    auth,
    events,
    accessResults,
    async mount() {
      await act(async () => { renderer = TestRenderer.create(app()); });
    },
    async emit(user) {
      assert.ok(listener, "Auth listener was not registered");
      auth.currentUser = user;
      await act(async () => { await listener(user); });
    },
    async navigate(next) {
      pathName = next;
      await act(async () => { renderer.update(app()); });
    },
    async applyReplacement() {
      assert.ok(pendingReplacement, "No router replacement is pending");
      const next = pendingReplacement;
      pendingReplacement = null;
      pathName = next;
      await act(async () => { renderer.update(app()); });
      return next;
    },
    beginEmit(user) {
      assert.ok(listener, "Auth listener was not registered");
      auth.currentUser = user;
      let promise;
      act(() => { promise = listener(user); });
      return promise;
    },
    counts() { return { renders: renderCount, subscriptions: subscriptionCount, navigations: events.filter(event => event.startsWith("replace:")).length }; },
    tree() { return renderer.toJSON(); },
    async unmount() { await act(async () => renderer.unmount()); },
  };
}

const active = role => ({
  state: "resolved",
  profileId: `profile-${role}`,
  accountType: "restaurant",
  accountStatus: "active",
  onboardingStep: "none",
  restaurantId: "restaurant-local",
  restaurantRole: role,
  restaurantStatus: "active",
  acceptingOrders: true,
});
const inactive = status => ({
  ...active("owner"),
  accountStatus: status,
  onboardingStep: status === "pending" ? "restaurant_approval_required" : "none",
  restaurantStatus: status === "suspended" ? "suspended" : "active",
});
const user = uid => ({ uid, getIdToken: async () => "local-token" });
const deferred = () => {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
};

for (const status of ["pending", "suspended"]) {
  test(`login-to-${status} applies route replacement and survives same-identity subscription recreation`, async () => {
    const route = `/${status}`;
    const harness = createHarness("/login");
    await harness.mount();
    const identity = user(`${status}-identity`);
    harness.accessResults.push(inactive(status));
    await harness.emit(identity);
    assert.ok(harness.events.includes(`replace:${route}`));
    const committed = harness.events.indexOf(`public-render:/login:${status}`);
    const navigated = harness.events.indexOf(`replace:${route}`);
    assert.ok(committed >= 0 && navigated > committed, "access-state navigation ran before its committed presentation state");
    assert.equal(await harness.applyReplacement(), route);
    harness.accessResults.push(inactive(status));
    await harness.emit(identity);
    assert.equal(harness.tree()?.props?.["data-route"], route);

    const next = deferred();
    harness.accessResults.push(next.promise);
    const repeated = harness.beginEmit(identity);
    await act(async () => { await Promise.resolve(); });
    assert.equal(harness.tree()?.props?.["data-route"], route, "same identity temporarily removed its access-state route");
    next.resolve(inactive(status));
    await act(async () => { await repeated; });
    const counts = harness.counts();
    assert.ok(counts.renders <= 12, JSON.stringify(counts));
    assert.ok(counts.navigations <= 1, JSON.stringify(counts));
    assert.ok(counts.subscriptions <= 2, JSON.stringify(counts));
    assert.equal(harness.events.some(event => /maximum update/i.test(event)), false);
    routeLifecycleEvidence.push({ status, route, ...counts, maximumUpdateErrors: 0, finalRouteVisible: true });
    await harness.unmount();
  });
}

for (const role of ["owner", "manager"]) {
  test(`active ${role} runtime commits before login redirects to Dashboard`, async () => {
    const harness = createHarness();
    await harness.mount();
    assert.equal(harness.events.some(event => event.startsWith("provider-")), false);
    harness.accessResults.push(active(role));
    await harness.emit(user(`user-${role}`));
    const mounted = harness.events.indexOf(`provider-mounted:restaurant-local:${role}`);
    const redirected = harness.events.indexOf("replace:/dashboard");
    assert.ok(mounted >= 0, "Runtime provider did not mount");
    assert.ok(redirected > mounted, "Protected navigation happened before the runtime provider committed");
    await harness.navigate("/dashboard");
    assert.ok(harness.events.includes(`protected-render:/dashboard:${role}`));
    await harness.unmount();
  });
}

test("a direct protected-route restoration never renders before authorization and runtime readiness", async () => {
  const harness = createHarness("/dashboard");
  await harness.mount();
  assert.equal(harness.events.some(event => event.startsWith("protected-render:")), false);
  assert.equal(harness.tree()?.props?.className, "access-overlay");
  harness.accessResults.push(active("owner"));
  await harness.emit(user("restored-owner"));
  assert.ok(harness.events.includes("provider-mounted:restaurant-local:owner"));
  assert.ok(harness.events.includes("protected-render:/dashboard:owner"));
  assert.equal(harness.events.some(event => event.includes("runtime is unavailable")), false);
  await harness.unmount();
});

test("pending and suspended identities recover to active only through a committed runtime", async () => {
  for (const status of ["pending", "suspended"]) {
    const route = `/${status}`;
    const harness = createHarness(route);
    await harness.mount();
    harness.accessResults.push(inactive(status));
    await harness.emit(user(`${status}-user`));
    assert.equal(harness.events.some(event => event.startsWith("provider-mounted:")), false);
    assert.equal(harness.tree()?.props?.["data-route"], route);
    harness.accessResults.push(active("owner"));
    await harness.emit(user(`${status}-user`));
    const mounted = harness.events.lastIndexOf("provider-mounted:restaurant-local:owner");
    const redirected = harness.events.lastIndexOf("replace:/dashboard");
    assert.ok(redirected > mounted);
    assert.equal(await harness.applyReplacement(), "/dashboard");
    assert.ok(harness.events.includes("protected-render:/dashboard:owner"));
    await harness.unmount();
  }
});

test("wrong-role and revoked identities remain denied", async () => {
  for (const [context, expected] of [
    [{ state: "configuration_error", referenceId: "wrong-portal" }, "replace:/login?reason=wrong-role"],
    [inactive("revoked"), "replace:/login?reason=revoked"],
    [{ state: "unmapped", referenceId: "missing-access" }, "replace:/login?reason=access"],
  ]) {
    const harness = createHarness("/dashboard");
    await harness.mount();
    harness.accessResults.push(context);
    await harness.emit(user("denied-user"));
    assert.ok(harness.events.includes("sign-out"));
    assert.ok(harness.events.includes(expected));
    assert.equal(harness.events.some(event => event.startsWith("protected-render:")), false);
    await harness.unmount();
  }
});

test("identity replacement clears the active runtime before presenting pending access", async () => {
  const harness = createHarness("/dashboard");
  await harness.mount();
  harness.accessResults.push(active("owner"));
  await harness.emit(user("first-owner"));
  assert.ok(harness.events.includes("provider-mounted:restaurant-local:owner"));
  harness.accessResults.push(inactive("pending"));
  await harness.emit(user("replacement-pending"));
  assert.ok(harness.events.includes("provider-unmounted:restaurant-local:owner"));
  assert.ok(harness.events.includes("replace:/pending"));
  assert.equal(harness.events.filter(event => event === "replace:/pending").length, 1);
  await harness.applyReplacement();
  harness.accessResults.push(inactive("pending"));
  await harness.emit(user("replacement-pending"));
  assert.equal(harness.tree()?.props?.["data-route"], "/pending");
  assert.equal(harness.events.some(event => event === "protected-render:/pending:owner"), false);
  await harness.unmount();
});

test("transient access failure preserves a previously verified runtime", async () => {
  const harness = createHarness("/dashboard");
  await harness.mount();
  const activeUser = user("stable-owner");
  harness.accessResults.push(active("owner"));
  await harness.emit(activeUser);
  const mountsBefore = harness.events.filter(event => event.startsWith("provider-mounted:")).length;
  harness.accessResults.push(new Error("temporary"), new Error("temporary"));
  await harness.emit(activeUser);
  assert.ok(harness.events.includes("protected-render:/dashboard:owner"));
  assert.equal(harness.events.filter(event => event.startsWith("provider-mounted:")).length, mountsBefore);
  assert.equal(harness.events.includes("sign-out"), false);
  await harness.unmount();
});

test("logout removes authenticated runtime access", async () => {
  const harness = createHarness("/dashboard");
  await harness.mount();
  harness.accessResults.push(active("owner"));
  await harness.emit(user("logout-owner"));
  await harness.emit(null);
  assert.ok(harness.events.includes("replace:/login?reason=session-expired"));
  assert.equal(harness.events.includes("provider-unmounted:restaurant-local:owner"), false, "Logout destroyed the navigator before its login replacement committed");
  assert.equal(harness.tree()?.props?.["data-route"], "/dashboard");
  assert.equal(await harness.applyReplacement(), "/login");
  assert.ok(harness.events.includes("provider-unmounted:restaurant-local:owner"));
  assert.equal(harness.tree()?.props?.["data-route"], "/login");
  assert.equal(harness.events.filter(event => event === "replace:/login?reason=session-expired").length, 1);
  await harness.unmount();
});

test("only the shared runtime owns a private Restaurant Realtime subscription", () => {
  const directory = path.join(root, "apps/restaurant/src");
  const files = [];
  const walk = current => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const target = path.join(current, entry.name);
      if (entry.isDirectory()) walk(target);
      else if (/\.tsx?$/.test(entry.name)) files.push(target);
    }
  };
  walk(directory);
  const subscriptions = files.reduce((total, file) => total + (fs.readFileSync(file, "utf8").match(/\.channel\(/g)?.length || 0), 0);
  assert.equal(subscriptions, 1);
});
