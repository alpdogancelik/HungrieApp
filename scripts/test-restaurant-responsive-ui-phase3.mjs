import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseMenuSnapshot, parseRestaurantSettings, parseKurus, buildMenuMediaPath } from "../apps/restaurant/src/managementContract.ts";
import { buildRestaurantSettingsChanges, changedSettings, completeManagementIntent, normalizeRestaurantSettingsForm, stableManagementOperationId } from "../apps/restaurant/src/managementModel.ts";
import { draftFromItem, menuDefinition, menuDefinitionReached, normalizeMenuDraft } from "../apps/restaurant/src/menuModel.ts";
import { parseHistoryOrderPage } from "../apps/restaurant/src/orders/orderContract.ts";

const stamp = "2026-09-24T10:00:00.000Z";
const category = { id:"cat-1",restaurant_id:"restaurant-1",name:"Meals",description:"",icon:null,is_active:true,sort_order:0,created_at:stamp,updated_at:stamp };
const item = { id:"item-1",restaurant_id:"restaurant-1",category_id:"cat-1",name:"Meal",description:"Fresh",image_url:null,price_kurus:1250,cost_kurus:null,is_active:true,sort_order:0,eta_minutes:null,calories:null,protein_grams:null,rating_average:0,rating_count:0,customizations:[],created_at:stamp,updated_at:stamp,definition_revision:3 };
const ingredient = { id:"ing-1",restaurant_id:"restaurant-1",menu_item_id:"item-1",name:"Onion",removable:true,sort_order:0,is_active:true,created_at:stamp,updated_at:stamp };
const group = { id:"group-1",restaurant_id:"restaurant-1",menu_item_id:"item-1",name:"Size",kind:"size",minimum_selections:1,maximum_selections:1,sort_order:0,is_active:true,created_at:stamp,updated_at:stamp };
const option = { id:"option-1",restaurant_id:"restaurant-1",group_id:"group-1",name:"Large",price_delta_kurus:300,sort_order:0,is_active:true,created_at:stamp,updated_at:stamp };
const menuRaw = { restaurantId:"restaurant-1",categories:[category],items:[item],ingredients:[ingredient],groups:[group],options:[option] };
const settingsRaw = { id:"restaurant-1",name:"Restaurant",description:"",cuisine:"Local",address:"Address",phone:null,imageUrl:null,deliveryEtaMinMinutes:20,deliveryEtaMaxMinutes:35,minimumOrderKurus:2500,openingHours:{mon:[]},preferredLanguage:"tr",lifecycleStatus:"active",acceptingOrders:true };
const order = { id:"order-1",restaurant_id:"restaurant-1",restaurant_name:"Restaurant",status:"delivered",payment_method:"cash",subtotal_kurus:1000,delivery_fee_kurus:0,service_fee_kurus:0,discount_kurus:0,tip_kurus:0,total_kurus:1000,eta_minutes:20,reminder_pending:false,created_at:stamp,updated_at:stamp,items:[] };

const source = path => readFileSync(new URL(path, import.meta.url), "utf8");

test("menu parser accepts exact relational projection and rejects unknown, duplicate, and cross-tenant rows", () => {
  const parsed = parseMenuSnapshot(menuRaw); assert.equal(parsed.items[0].definitionRevision,3); assert.equal(parsed.options[0].priceDeltaKurus,300);
  assert.throws(() => parseMenuSnapshot({...menuRaw,extra:true}));
  assert.throws(() => parseMenuSnapshot({...menuRaw,items:[item,item]}));
  assert.throws(() => parseMenuSnapshot({...menuRaw,items:[{...item,restaurant_id:"restaurant-2"}]}));
  assert.throws(() => parseMenuSnapshot({...menuRaw,options:[{...option,group_id:"missing"}]}));
});

test("settings parser preserves nullable values, opening hours, exact enums, and safe integers", () => {
  assert.deepEqual(parseRestaurantSettings(settingsRaw).openingHours,{mon:[]});
  assert.equal(parseRestaurantSettings(settingsRaw).phone,null);
  assert.throws(() => parseRestaurantSettings({...settingsRaw,preferredLanguage:"de"}));
  assert.throws(() => parseRestaurantSettings({...settingsRaw,minimumOrderKurus:Number.MAX_SAFE_INTEGER+1}));
  assert.throws(() => parseRestaurantSettings({...settingsRaw,deliveryEtaMinMinutes:40}));
});

test("history parser permits only authoritative delivered and canceled pages", () => {
  assert.equal(parseHistoryOrderPage({items:[order],has_more:false,next_cursor:null}).items[0].status,"delivered");
  assert.throws(() => parseHistoryOrderPage({items:[{...order,status:"pending"}],has_more:false,next_cursor:null}));
  assert.throws(() => parseHistoryOrderPage({items:[order,order],has_more:false,next_cursor:null}));
});

test("decimal parsing converts exactly once to integer kurus", () => {
  assert.equal(parseKurus("12.50"),1250); assert.equal(parseKurus("12,5"),1250); assert.equal(parseKurus("0.01"),1);
  for (const invalid of ["1.999","-1","1e2","NaN",""]) assert.equal(parseKurus(invalid),null);
});

test("menu definition preserves existing nested IDs and validates selection bounds", () => {
  const snapshot=parseMenuSnapshot(menuRaw), draft=draftFromItem(snapshot.items[0],snapshot), definition=menuDefinition(draft,"cat-1");
  assert.equal(definition.id,"item-1"); assert.equal(definition.sortOrder,0); assert.equal(definition.ingredients[0].id,"ing-1"); assert.equal(definition.groups[0].id,"group-1"); assert.equal(definition.groups[0].options[0].id,"option-1");
  assert.equal(menuDefinitionReached(snapshot,definition,new Set(["item-1"])),true);
  assert.equal(menuDefinitionReached(snapshot,{...definition,name:"Different"},new Set(["item-1"])),false);
  assert.throws(()=>menuDefinition({...draft,groups:[{...draft.groups[0],maximum:2}]},"cat-1"));
});

test("media paths are caller-identity rooted and sanitize filenames", () => {
  assert.equal(buildMenuMediaPath("restaurant-1","my photo.webp","operation-1"),"restaurant-1/operation-1-my-photo.webp");
  assert.throws(()=>buildMenuMediaPath("restaurant-1/other","x.png","operation-1"));
  const migration=source("../supabase/migrations/20260913141000_phase5_restaurant_contracts.sql");
  assert.match(migration,/storage\.foldername\(name\)\)\[1\]=private\.current_restaurant_id\(\)/);
});

test("operation IDs remain stable only for unchanged management intents", () => {
  const first=stableManagementOperationId("same"),second=stableManagementOperationId("same"),other=stableManagementOperationId("other"); assert.equal(first,second); assert.notEqual(first,other); completeManagementIntent("same"); assert.notEqual(stableManagementOperationId("same"),first);
});

test("partial settings preserve omitted versus explicit null semantics", () => {
  const initial={name:"A",phone:"123",imageUrl:"x",deliveryEtaMinMinutes:"20",minimumOrder:"10.00"};
  assert.deepEqual(changedSettings(initial,{...initial}, {name:"name",phone:"phone",imageUrl:"image_url",deliveryEtaMinMinutes:"delivery_eta_min_minutes",minimumOrder:"minimum_order_kurus"},new Set(["phone","imageUrl","deliveryEtaMinMinutes"])),{});
  assert.deepEqual(changedSettings(initial,{...initial,phone:""}, {name:"name",phone:"phone"},new Set(["phone"])),{phone:null});
  const full={name:"A",description:"D",cuisine:"C",address:"X",phone:"123",imageUrl:"https://x",preferredLanguage:"en",deliveryEtaMinMinutes:"20",deliveryEtaMaxMinutes:"30",minimumOrder:"10.00"};
  assert.deepEqual(buildRestaurantSettingsChanges(full,{...full}),{});
  assert.deepEqual(buildRestaurantSettingsChanges(full,{...full,description:"New",cuisine:"New C",address:"New X",phone:"",imageUrl:"",preferredLanguage:"tr",deliveryEtaMinMinutes:"",deliveryEtaMaxMinutes:"40",minimumOrder:"12.50"}),{description:"New",cuisine:"New C",address:"New X",phone:null,image_url:null,preferred_language:"tr",delivery_eta_min_minutes:null,delivery_eta_max_minutes:40,minimum_order_kurus:1250});
  assert.equal(buildRestaurantSettingsChanges(full,{...full,deliveryEtaMinMinutes:"50",deliveryEtaMaxMinutes:"40"}),null);
  assert.equal(buildRestaurantSettingsChanges(full,{...full,minimumOrder:"1.999"}),null);
  assert.deepEqual(normalizeRestaurantSettingsForm({...full,minimumOrder:"10.0",deliveryEtaMinMinutes:"020"}),normalizeRestaurantSettingsForm(full));
});

test("dirty state changes only for normalized edits or pending file input", () => {
  const snapshot=parseMenuSnapshot(menuRaw),draft=draftFromItem(snapshot.items[0],snapshot),baseline=normalizeMenuDraft(draft); assert.equal(normalizeMenuDraft({...draft,name:` ${draft.name} `}),baseline); assert.notEqual(normalizeMenuDraft({...draft,name:"Changed"}),baseline);
});

test("repositories are caller-bound and use only accepted RPC and media contracts", () => {
  const repository=source("../apps/restaurant/src/managementRepository.ts");
  for (const rpc of ["restaurant_list_orders_v1","restaurant_get_menu_v2","restaurant_save_category_v1","restaurant_reorder_categories_v1","restaurant_reorder_menu_items_v1","restaurant_bulk_set_item_availability_v1","restaurant_save_menu_item_v2","restaurant_get_settings_v1","restaurant_update_settings_v1"]) assert.match(repository,new RegExp(rpc));
  assert.doesNotMatch(repository,/p_restaurant_id|selectedRestaurant/); assert.match(repository,/buildMenuMediaPath\(restaurantId, file\.name, operationId\)/);
});

test("pages retain generation, abort, stale, cursor, retry, and authoritative reload controls", () => {
  const history=source("../apps/restaurant/src/HistoryPage.tsx"),menu=source("../apps/restaurant/src/MenuPage.tsx"),restaurant=source("../apps/restaurant/src/RestaurantPage.tsx");
  for (const value of [history,menu,restaurant]) { assert.match(value,/generation/); assert.match(value,/AbortController/); assert.match(value,/stale/); }
  assert.match(history,/next_cursor/); assert.match(menu,/await load\(\)/); assert.match(restaurant,/await load\(\)/);
});

test("deferred controls and unauthorized role gates remain absent", () => {
  const history=source("../apps/restaurant/src/HistoryPage.tsx"),restaurant=source("../apps/restaurant/src/RestaurantPage.tsx"),menu=source("../apps/restaurant/src/MenuPage.tsx");
  assert.doesNotMatch(history,/type="search"|date filter|status filter/i); assert.doesNotMatch(restaurant,/openingHours|opening_hours|type="file"/); assert.doesNotMatch(menu+restaurant,/isActiveRestaurantOwner|restaurantRole\s*===/);
});

test("Dashboard and Restaurant share the accepted acceptance controller", () => {
  assert.match(source("../apps/restaurant/src/DashboardPage.tsx"),/useRestaurantAcceptance/); assert.match(source("../apps/restaurant/src/RestaurantPage.tsx"),/useRestaurantAcceptance/);
  const control=source("../apps/restaurant/src/useRestaurantAcceptance.ts"); assert.match(control,/runtime\.status !== "connected"/); assert.match(control,/!runtime\.online/); assert.match(control,/refreshDashboard/);
});

test("responsive management surfaces and accessible dialogs are wired", () => {
  const css=source("../apps/restaurant/src/design/components.css"),dialog=source("../apps/restaurant/src/components/Dialog.tsx"),editor=source("../apps/restaurant/src/MenuItemDialog.tsx");
  assert.match(css,/@media \(max-width: 767px\)/); assert.match(css,/\.history-cards/); assert.match(css,/\.menu-layout/); assert.match(css,/\.restaurant-grid/); assert.match(dialog,/aria-modal="true"/); assert.match(editor,/useDirtyGuard\(dirty\)/);
});
