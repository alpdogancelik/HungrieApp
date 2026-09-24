import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parsePushRegistration, parsePushUnregistration, StablePushOperation } from "../apps/restaurant/src/pushContract.ts";
import { createRestaurantReviewV2Repository } from "../apps/restaurant/src/reviewRepository.ts";
import { StableReportOperation } from "../apps/restaurant/src/reviewManagementModel.ts";

const client=resolver=>{const calls=[];return{calls,rpc(name,args){calls.push({name,args});return Promise.resolve(resolver(name,args))}}};
const review={reviewId:"review-1",overallRating:4.5,tasteRating:5,speedRating:4,comment:"Good",items:[{menuItemId:"item-1",name:"Meal",quantity:1}],status:"published",createdAt:"2026-09-24T10:00:00Z",report:null};

test("push responses require exact authoritative contracts",()=>{
  assert.deepEqual(parsePushRegistration({subscriptionId:"subscription-1",registered:true}),{subscriptionId:"subscription-1",registered:true});
  assert.deepEqual(parsePushUnregistration({unregistered:true}),{unregistered:true});
  for(const value of [{registered:true},{subscriptionId:"x",registered:false},{subscriptionId:"x",registered:true,device:"fake"},null])assert.throws(()=>parsePushRegistration(value),/Invalid Restaurant push response/);
  for(const value of [{unregistered:false},{unregistered:true,device:"fake"},null])assert.throws(()=>parsePushUnregistration(value),/Invalid Restaurant push response/);
});

test("push and report operation IDs remain stable only for unchanged intentions",()=>{
  const original=globalThis.crypto;let n=0;Object.defineProperty(globalThis,"crypto",{configurable:true,value:{randomUUID:()=>`00000000-0000-4000-8000-${String(++n).padStart(12,"0")}`}});
  try{const push=new StablePushOperation(),a=push.prepare(["token","device","tr"]),b=push.prepare(["token","device","tr"]),c=push.prepare(["token","device","en"]);assert.equal(a,b);assert.notEqual(b,c);push.clear();assert.notEqual(c,push.prepare(["token","device","en"]));const report=new StableReportOperation(),r1=report.prepare("review-1","spam"," note "),r2=report.prepare("review-1","spam","note");assert.equal(r1.operationId,r2.operationId);}finally{Object.defineProperty(globalThis,"crypto",{configurable:true,value:original})}
});

test("review repository accepts exact anonymous contracts and rejects privacy or shape drift",async()=>{
  const fake=client((name,args)=>name==="restaurant_report_order_review_v2"?{data:{reportId:"report-1",reviewId:args.p_review_id,status:"open",replayed:true},error:null}:name==="restaurant_list_menu_item_reaction_aggregates_v2"?{data:{items:[{menuItemId:"item-1",menuItemName:"Meal",likedCount:2,dislikedCount:1,positivePercentage:66.7}],nextCursor:null,limit:args.p_limit},error:null}:{data:{items:[review],nextCursor:"opaque",limit:args.p_limit},error:null});
  const repository=createRestaurantReviewV2Repository(fake);const page=await repository.listReviews({cursor:"opaque-prior",limit:20});assert.equal(page.items[0].reviewId,"review-1");assert.equal(fake.calls[0].args.p_cursor,"opaque-prior");assert.deepEqual(await repository.reportReview({reviewId:"review-1",reason:"spam",operationId:"11111111-1111-4111-8111-111111111111"}),{reportId:"report-1",reviewId:"review-1",status:"open"});
  const privacy=createRestaurantReviewV2Repository(client(()=>({data:{items:[{...review,customerName:"forbidden"}],nextCursor:null,limit:20},error:null})));await assert.rejects(()=>privacy.listReviews(),/Invalid Restaurant review response/);
  const duplicate=createRestaurantReviewV2Repository(client(()=>({data:{items:[review,review],nextCursor:null,limit:20},error:null})));await assert.rejects(()=>duplicate.listReviews(),/Invalid Restaurant review response/);
  const malformed=createRestaurantReviewV2Repository(client(()=>({data:{items:[{...review,createdAt:"bad"}],nextCursor:null,limit:20},error:null})));await assert.rejects(()=>malformed.listReviews(),/Invalid Restaurant review response/);
  for(const invalidComment of ["a".repeat(501),"bad\u0001", "cafe\u0301"]){const invalidReview=createRestaurantReviewV2Repository(client(()=>({data:{items:[{...review,comment:invalidComment}],nextCursor:null,limit:20},error:null})));await assert.rejects(()=>invalidReview.listReviews(),/Invalid Restaurant review response/);}
});

test("Reviews remains anonymous, report-only, reconciled, and uses the shared dialog",()=>{
  const source=readFileSync(new URL("../apps/restaurant/src/ReviewsPage.tsx",import.meta.url),"utf8");
  assert.match(source,/Anonymous customer|Anonim müşteri/);assert.match(source,/restaurantReviewV2Repository\.listReviews/);assert.match(source,/StableReportOperation/);assert.match(source,/components\/Dialog/);assert.match(source,/authoritative/);
  assert.doesNotMatch(source,/customerName|userName|orderId|\.setVisibility\(|deleteReview|replyToReview/);
  assert.match(source,/reporting is read-only|Bildirim salt okunurdur/i);
});

test("Alerts require RPC evidence and retain supported delivery behavior",()=>{
  const card=readFileSync(new URL("../apps/restaurant/src/NotificationCard.tsx",import.meta.url),"utf8"),push=readFileSync(new URL("../apps/restaurant/src/push.ts",import.meta.url),"utf8"),worker=readFileSync(new URL("../apps/restaurant/public/sw.js",import.meta.url),"utf8");
  assert.match(card,/parsePushRegistration\(result\.data\)/);assert.match(card,/StablePushOperation/);assert.match(card,/beforeinstallprompt/);assert.match(card,/Notification\.permission === "granted" \? "granted"/);assert.match(card,/setState\("unknown"\)/);
  assert.doesNotMatch(card,/Chrome|macOS|device inventory|sound preference|notification preference/i);assert.match(card,/p_language: locale/);assert.match(push,/parsePushUnregistration\(result\.data\)/);assert.match(push,/orders\/detail\?orderId=/);assert.match(worker,/payload\?\.data\?\.title/);assert.match(worker,/payload\?\.data\?\.body/);
});

test("Security reuses the shared push-clean sign-out and sanitizes reset outcomes",()=>{
  const page=readFileSync(new URL("../apps/restaurant/src/SecurityPage.tsx",import.meta.url),"utf8"),route=readFileSync(new URL("../apps/restaurant/app/security.tsx",import.meta.url),"utf8"),shared=readFileSync(new URL("../apps/restaurant/src/restaurantSignOut.ts",import.meta.url),"utf8");
  assert.match(page,/restaurantSignOut\(\)/);assert.match(page,/sendPasswordResetEmail/);assert.match(page,/If the account is eligible/);assert.match(page,/Hesap uygunsa/);assert.match(page,/components\/Dialog/);assert.doesNotMatch(page,/error\.message|trusted location|session inventory/i);assert.match(route,/SecurityPage/);assert.match(shared,/unregisterPush: unregisterRestaurantPush/);
});

test("Earnings remains owner-only and server-authoritative",()=>{
  const page=readFileSync(new URL("../apps/restaurant/src/EarningsPage.tsx",import.meta.url),"utf8"),repo=readFileSync(new URL("../apps/restaurant/src/earningsRepository.ts",import.meta.url),"utf8");
  assert.match(page,/isActiveRestaurantOwner/);assert.match(page,/validateEarningsBundle/);assert.match(page,/EarningsPageStack/);assert.match(page,/reportingTimezone/);assert.match(page,/not payouts, transfers, settlements/);assert.match(page,/No Customer details/);assert.doesNotMatch(page,/orderRepository|listOrders|calculateCommission/);assert.match(repo,/restaurant_get_earnings_summary_v1/);assert.match(repo,/restaurant_get_earnings_series_v1/);assert.match(repo,/restaurant_get_earnings_orders_page_v1/);
});

test("Phase 4 creates no second private Restaurant realtime subscription",()=>{
  const runtime=readFileSync(new URL("../apps/restaurant/src/RestaurantRuntimeContext.tsx",import.meta.url),"utf8"),alerts=readFileSync(new URL("../apps/restaurant/src/NotificationCard.tsx",import.meta.url),"utf8"),reviews=readFileSync(new URL("../apps/restaurant/src/ReviewsPage.tsx",import.meta.url),"utf8");
  assert.equal((runtime.match(/\.channel\(/g)||[]).length,1);assert.doesNotMatch(alerts,/\.channel\(/);assert.doesNotMatch(reviews,/\.channel\(/);
});
