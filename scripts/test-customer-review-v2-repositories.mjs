import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { classifyRestaurantReviewError, createRestaurantReviewV2Repository, RestaurantReviewRepositoryError } from "../apps/restaurant/src/reviewRepository.ts";
import { classifyAdminReviewError, createAdminReviewV2Repository, AdminReviewRepositoryError } from "../apps/admin-web/lib/reviewRepository.ts";
import { CursorGate, StableReportOperation, validateOptionalNote } from "../apps/restaurant/src/reviewManagementModel.ts";
import { legalReportTargets, StableAdminOperation, validateModerationReason } from "../apps/admin-web/lib/reviewManagementModel.ts";

const client = (resolver) => {
  const calls = [];
  return { calls, rpc(name, args) { calls.push({ name, args }); return Promise.resolve(resolver(name, args)); } };
};

test("Restaurant v2 repository is report-only and maps anonymous queues and aggregates", async () => {
  const fake = client((name, args) => {
    if (name === "restaurant_list_order_reviews_v2") return { data: { limit: args.p_limit, nextCursor: "opaque-next", items: [{
      reviewId: "review-1", overallRating: 4.5, tasteRating: 5, speedRating: 4, comment: "Good", status: "published",
      createdAt: "2026-09-17T00:00:00Z", items: [{ menuItemId: "menu-1", name: "Meal", quantity: 1 }],
      report: null, profileId: "must-not-map", orderId: "must-not-map", userName: "must-not-map",
    }] }, error: null };
    if (name === "restaurant_report_order_review_v2") return { data: { reportId: "report-1", reviewId: args.p_review_id, status: "open" }, error: null };
    return { data: { limit: args.p_limit, nextCursor: null, items: [{ menuItemId: "menu-1", menuItemName: "Meal", likedCount: 3,
      dislikedCount: 1, positivePercentage: 75, reviewId: "must-not-map", orderId: "must-not-map", profileId: "must-not-map" }] }, error: null };
  });
  const repository = createRestaurantReviewV2Repository(fake);
  const reviews = await repository.listReviews({ cursor: "opaque-prior", limit: 100 });
  assert.equal(fake.calls[0].args.p_cursor, "opaque-prior");
  assert.equal(fake.calls[0].args.p_limit, 50);
  assert.equal(JSON.stringify(reviews).includes("must-not-map"), false);
  const report = await repository.reportReview({ reviewId: "review-1", reason: "spam", operationId: "11111111-1111-4111-8111-111111111111" });
  assert.deepEqual(report, { reportId: "report-1", reviewId: "review-1", status: "open" });
  const aggregates = await repository.listReactionAggregates();
  assert.equal(aggregates.items[0].positivePercentage, 75);
  assert.equal(JSON.stringify(aggregates).includes("must-not-map"), false);
  assert.equal("setVisibility" in repository, false);
  await assert.rejects(() => createRestaurantReviewV2Repository(client(() => ({ data: { items: [{}], limit: 20 }, error: null }))).listReviews(), /Invalid Restaurant review response/);
});

test("Admin v2 repository forwards stable operations and maps reports without Customer or order identity", async () => {
  const fake = client((name, args) => {
    if (name === "admin_list_order_review_reports_v2") return { data: { limit: args.p_limit, nextCursor: null, items: [{
      reportId: "report-1", reviewId: "review-1", restaurantId: "restaurant-1", reason: "spam", internalNote: "internal",
      reportStatus: "open", resolutionNote: null, reportCreatedAt: "2026-09-17T00:00:00Z", customerId: "must-not-map", orderId: "must-not-map",
      review: { contractVersion: 2, overallRating: 3.5, tasteRating: 4, speedRating: 3, comment: "Text", status: "published",
        createdAt: "2026-09-16T00:00:00Z", items: [{ menuItemId: "menu-1", name: "Meal", quantity: 1 }], profileId: "must-not-map" },
    }] }, error: null };
    if (name === "admin_list_order_review_audit_v2") return { data: { limit: args.p_limit, nextCursor: "opaque-audit", items: [{
      auditId: "audit-1", actorProfileId: "admin-1", action: "order_review.visibility_changed_v2", targetType: "order_review",
      targetId: "review-1", contractVersion: 2, restaurantId: "restaurant-1", operationId: "operation-1", priorState: "published",
      newState: "hidden", reportReason: null, moderationReason: "Policy", createdAt: "2026-09-17T00:00:00Z",
      comment: "must-not-map", internalNote: "must-not-map", orderId: "must-not-map", reactions: ["must-not-map"],
    }] }, error: null };
    if (name === "admin_set_order_review_report_status_v2") return { data: { reportId: args.p_report_id, status: args.p_status }, error: null };
    if (name === "admin_set_order_review_visibility_v2") return { data: { reviewId: args.p_review_id, status: args.p_status }, error: null };
    return { data: { limit: args.p_limit, nextCursor: null, items: [] }, error: null };
  });
  const repository = createAdminReviewV2Repository(fake);
  const reports = await repository.listReports({ cursor: "opaque-report", limit: 0 });
  assert.equal(reports.limit, 20);
  assert.equal(JSON.stringify(reports).includes("must-not-map"), false);
  assert.equal(reports.items[0].review.contractVersion, 2);
  const audit = await repository.listAudit("report-1", { cursor: "opaque-audit-prior", limit: 100 });
  assert.equal(fake.calls.at(-1).args.p_cursor, "opaque-audit-prior");
  assert.equal(fake.calls.at(-1).args.p_limit, 50);
  assert.equal(audit.items[0].action, "order_review.visibility_changed_v2");
  assert.equal(JSON.stringify(audit).includes("must-not-map"), false);
  const operationId = "22222222-2222-4222-8222-222222222222";
  await repository.setReportStatus({ reportId: "report-1", status: "resolved", resolutionNote: "Done", operationId });
  await repository.setVisibility({ reviewId: "review-1", status: "hidden", reason: "Policy", operationId });
  assert.equal(fake.calls.at(-2).args.p_operation_id, operationId);
  assert.equal(fake.calls.at(-1).args.p_operation_id, operationId);
  await assert.rejects(() => createAdminReviewV2Repository(client(() => ({ data: { items: [{ reportId: "broken" }], limit: 20 }, error: null }))).listReports(), /Invalid Admin review response/);
});

test("management errors are stable codes and never expose database messages", async () => {
  assert.equal(classifyAdminReviewError({ code: "42501", message: "Recent authentication required" }), "recent_auth_required");
  assert.equal(classifyRestaurantReviewError({ code: "23505", message: "review already reported" }), "duplicate_report");
  const admin=createAdminReviewV2Repository(client(()=>({data:null,error:{code:"42501",message:"sensitive raw message"}})));
  await assert.rejects(()=>admin.listReports(),error=>error instanceof AdminReviewRepositoryError&&error.message==="account_inactive"&&!error.message.includes("sensitive"));
  const restaurant=createRestaurantReviewV2Repository(client(()=>({data:null,error:{status:503,message:"database unavailable"}})));
  await assert.rejects(()=>restaurant.listReviews(),error=>error instanceof RestaurantReviewRepositoryError&&error.message==="service_unavailable"&&!error.message.includes("database"));
});

test("report and moderation retry operations are stable only for unchanged normalized actions", () => {
  const original=globalThis.crypto;let count=0;Object.defineProperty(globalThis,"crypto",{configurable:true,value:{randomUUID:()=>`operation-${++count}`}});
  try{
    const report=new StableReportOperation(),first=report.prepare("review-1","spam","  cafe\u0301  "),same=report.prepare("review-1","spam","café"),changed=report.prepare("review-1","other","café");
    assert.equal(first.operationId,same.operationId);assert.notEqual(same.operationId,changed.operationId);assert.equal(first.internalNote,"café");
    assert.throws(()=>validateOptionalNote("a".repeat(501)),/validation/);assert.throws(()=>validateOptionalNote("bad\u0001"),/validation/);
    const admin=new StableAdminOperation(),a=admin.prepare("visibility:1",["hidden","reason"]),b=admin.prepare("visibility:1",["hidden","reason"]),d=admin.prepare("visibility:1",["hidden","changed"]);
    assert.equal(a,b);assert.notEqual(b,d);assert.deepEqual(legalReportTargets("open"),["resolved","dismissed"]);assert.deepEqual(legalReportTargets("resolved"),["open"]);
    assert.throws(()=>validateModerationReason("   "),/validation/);
  }finally{Object.defineProperty(globalThis,"crypto",{configurable:true,value:original})}
});

test("cursor gate rejects duplicate requests, stale responses, and repeated cursors", () => {
  const gate=new CursorGate(),generation=gate.reset(),first=gate.begin(null);assert.ok(first);assert.equal(gate.begin(null),null);
  assert.equal(gate.finish(first,"opaque-next"),true);const next=gate.begin("opaque-next");assert.ok(next);assert.equal(gate.finish(next,"opaque-next"),true);assert.equal(gate.begin("opaque-next"),null);const stale=gate.begin("new");assert.ok(stale);gate.reset();assert.equal(gate.finish(stale,null),false);assert.notEqual(generation,gate.reset());
});

test("Restaurant and Admin review components enforce the Phase 6 authority and privacy surface", () => {
  const restaurant=readFileSync(new URL("../apps/restaurant/src/ReviewsPage.tsx",import.meta.url),"utf8");
  const admin=readFileSync(new URL("../apps/admin-web/components/AdminReviewsPage.tsx",import.meta.url),"utf8");
  assert.match(restaurant,/restaurantReviewV2Repository/);assert.doesNotMatch(restaurant,/restaurant_list_reviews_v1|restaurant_moderate_review_v1|productReviews|user_name_snapshot/);
  assert.match(restaurant,/Anonymous customer|Anonim müşteri/);assert.match(restaurant,/reporting&&/);assert.doesNotMatch(restaurant,/\.setVisibility\(|publish review|delete review|reply/i);
  assert.match(admin,/legalReportTargets/);assert.match(admin,/window\.confirm/);assert.match(admin,/recent_auth_required/);assert.match(admin,/review\.contractVersion/);
  assert.match(admin,/listAudit/);assert.match(admin,/listReactionAggregates/);assert.doesNotMatch(admin,/customerId|orderId|userName|profileId/);
  assert.match(restaurant,/role="dialog"/);assert.match(restaurant,/aria-selected/);assert.match(admin,/aria-pressed/);
});
