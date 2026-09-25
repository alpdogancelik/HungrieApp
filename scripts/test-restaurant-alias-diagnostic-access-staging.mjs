import assert from "node:assert/strict";
import test from "node:test";
import { evaluateBrowserQualification } from "./qualify-restaurant-alias-diagnostic-access-staging.mjs";

const base = "https://candidate.example.invalid";
const state = (path, operational = true) => ({ path, heading: "Dashboard", blank: false, operational, earningsLink: false, diagnostic: { errors: [], navigations: [], protectedBeforeReady: false } });
const valid = (overrides = {}) => ({ accountName: "owner", expectedPath: "/dashboard", directPath: "/orders", baseUrl: base, authenticated: state("/dashboard"), restored: state("/orders"), mainCount: 1, serviceWorkerReady: true, requests: [{ url: base + "/dashboard", path: "/dashboard" }], ...overrides });

test("clean complete operational rendering passes", () => assert.equal(evaluateBrowserQualification(valid()).passed, true));
test("React hydration #418 fails", () => assert.deepEqual(evaluateBrowserQualification(valid({ exceptions: ["Minified React error #418"] })).blockers, ["UNCAUGHT_OR_CONSOLE_ERROR"]));
test("any console error fails", () => assert.ok(evaluateBrowserQualification(valid({ consoleErrors: ["unexpected"] })).blockers.includes("UNCAUGHT_OR_CONSOLE_ERROR")));
test("same-origin HTTP 404 fails", () => assert.ok(evaluateBrowserQualification(valid({ httpErrors: [{ url: base + "/favicon.ico", status: 404 }] })).blockers.includes("SAME_ORIGIN_HTTP_ERROR")));
test("unexpected runtime origin fails", () => assert.ok(evaluateBrowserQualification(valid({ requests: [{ url: "https://unexpected.invalid/code.js", path: "/code.js" }] })).blockers.includes("UNEXPECTED_RUNTIME_REQUEST")));
test("incomplete rendering and missing service worker fail", () => { const result = evaluateBrowserQualification(valid({ restored: { ...state("/orders"), heading: null }, serviceWorkerReady: false })); assert.ok(result.blockers.includes("INCOMPLETE_OPERATIONAL_RENDERING")); assert.ok(result.blockers.includes("SERVICE_WORKER_NOT_READY")); });
test("manager earnings request fails", () => assert.ok(evaluateBrowserQualification(valid({ accountName: "manager", requests: [{ url: base + "/rest/v1/rpc/restaurant_get_earnings", path: "/rest/v1/rpc/restaurant_get_earnings" }] })).blockers.includes("MANAGER_FINANCIAL_ACCESS")));
test("pending renders without operational shell", () => { const pending = state("/pending", false); assert.equal(evaluateBrowserQualification(valid({ accountName: "pending", expectedPath: "/pending", directPath: null, authenticated: pending, restored: pending })).passed, true); });
