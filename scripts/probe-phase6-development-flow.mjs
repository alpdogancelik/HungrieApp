#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),".."),require=createRequire(import.meta.url),admin=require(path.join(root,"functions/node_modules/firebase-admin"));
const arg=n=>process.argv.find(x=>x.startsWith(`${n}=`))?.slice(n.length+1),credentialPath=path.resolve(arg("--credential")||"");
if(arg("--confirm")!=="development:phase6-customer-flow"||!fs.existsSync(credentialPath)||!path.relative(root,credentialPath).startsWith(".."))throw new Error("External Firebase Admin credential and Development confirmation required.");
const credential=JSON.parse(fs.readFileSync(credentialPath,"utf8"));if(credential.project_id!=="hungrieapp-a2288")throw new Error("Firebase project mismatch.");
const secure=path.join(root,"secure"),state=JSON.parse(fs.readFileSync(path.join(secure,"supabase-projects.local.json"),"utf8")),project=state.projects?.development;
if(project?.name!=="HungrieApp Development"||project.ref===state.projects?.staging?.ref||project.ref===state.projects?.production?.ref)throw new Error("Development Supabase mismatch.");
const web=JSON.parse(fs.readFileSync(path.join(secure,"admin-firebase-web-development.local.json"),"utf8")),managementToken=fs.readFileSync(path.join(secure,"supabase-cli-hungrie/access-token"),"utf8").trim();
const query=async sql=>{const r=await fetch(`https://api.supabase.com/v1/projects/${project.ref}/database/query`,{method:"POST",headers:{authorization:`Bearer ${managementToken}`,"content-type":"application/json"},body:JSON.stringify({query:sql})});if(!r.ok)throw new Error(`Development SQL flow failed (${r.status}).`);return r.json()};
const rest=async(name,jwt,args={})=>{const r=await fetch(`${project.url}/rest/v1/rpc/${name}`,{method:"POST",headers:{apikey:project.publishableKey,authorization:`Bearer ${jwt}`,"content-type":"application/json"},body:JSON.stringify(args)});const body=await r.json().catch(()=>null);if(!r.ok)throw new Error(`${name} failed (${r.status}, ${String(body?.code||"unknown").replace(/[^A-Z0-9]/gi,"")}).`);return body};
const exchange=async token=>{const r=await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${encodeURIComponent(web.apiKey)}`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({token,returnSecureToken:true})});if(!r.ok)throw new Error(`Firebase exchange failed (${r.status}).`);return(await r.json()).idToken};
const q=value=>`'${String(value).replaceAll("'","''")}'`,suffix=crypto.randomUUID().replaceAll("-","").slice(0,12),categoryId=`p6cat_${suffix}`,itemId=`p6item_${suffix}`,ingredientId=`p6ingredient_${suffix}`,groupId=`p6group_${suffix}`,optionId=`p6option_${suffix}`,addressId=`p6address_${suffix}`,bootstrapId=crypto.randomUUID(),orderOperationId=crypto.randomUUID();
const app=admin.initializeApp({credential:admin.credential.cert(credential),projectId:credential.project_id},`phase6-flow-${Date.now()}`);let user,profileId,orderId,restaurantId,wasAccepting=false,fixtureCreated=false;
try{
 const [restaurant]=await query("select id,accepting_orders from public.restaurants where lifecycle_status='active' order by id limit 1");if(!restaurant?.id)throw new Error("No active Development Restaurant available.");restaurantId=restaurant.id;wasAccepting=Boolean(restaurant.accepting_orders);
 const email=`phase6-flow-${suffix}@example.invalid`;user=await app.auth().createUser({email,emailVerified:true,displayName:"Phase 6 Customer"});const jwt=await exchange(await app.auth().createCustomToken(user.uid,{role:"authenticated"}));
 const bootstrap=await rest("bootstrap_my_customer_account_v1",jwt,{p_operation_id:bootstrapId});profileId=String(bootstrap.profileId||user.uid);
 await rest("update_my_customer_profile_v1",jwt,{p_name:"Phase 6 Customer Updated",p_avatar_url:null,p_whatsapp_number:null,p_preferred_language:"en"});
 await rest("create_my_customer_address_v1",jwt,{p_id:addressId,p_label:"Phase 6",p_line1:"Synthetic flow address",p_block:"",p_room:"",p_city:"Development",p_country:"Test",p_is_default:true});
 await rest("replace_my_customer_favorites_v1",jwt,{p_restaurant_ids:[restaurantId]});
 await query(`begin;update public.restaurants set accepting_orders=true where id=${q(restaurantId)};
  insert into public.categories(id,restaurant_id,name,is_active,sort_order)values(${q(categoryId)},${q(restaurantId)},'Phase 6 Flow',true,9999);
  insert into public.menu_items(id,restaurant_id,category_id,name,price_kurus,is_active,sort_order)values(${q(itemId)},${q(restaurantId)},${q(categoryId)},'Phase 6 Meal',2000,true,0);
  insert into public.menu_item_ingredients(id,restaurant_id,menu_item_id,name,removable,sort_order)values(${q(ingredientId)},${q(restaurantId)},${q(itemId)},'Onion',true,0);
  insert into public.menu_option_groups(id,restaurant_id,menu_item_id,name,kind,minimum_selections,maximum_selections,sort_order)values(${q(groupId)},${q(restaurantId)},${q(itemId)},'Size','size',1,1,0);
  insert into public.menu_option_values(id,restaurant_id,group_id,name,price_delta_kurus,sort_order)values(${q(optionId)},${q(restaurantId)},${q(groupId)},'Large',300,0);commit;`);fixtureCreated=true;
 const items=[{menuItemId:itemId,quantity:1,optionValueIds:[optionId],removedIngredientIds:[ingredientId]}];const quoteResult=await rest("quote_order_v2",jwt,{p_restaurant_id:restaurantId,p_items:items});if(Number(quoteResult.subtotal_kurus)!==2300)throw new Error("Server quote did not apply the configured option.");
 const created=await rest("create_order_v2",jwt,{p_restaurant_id:restaurantId,p_address_id:addressId,p_payment_method:"cash",p_items:items,p_notes:"Phase 6 flow",p_operation_id:orderOperationId});orderId=String(created.orderId||"");if(!orderId)throw new Error("Order creation returned no ID.");
 const replay=await rest("create_order_v2",jwt,{p_restaurant_id:restaurantId,p_address_id:addressId,p_payment_method:"cash",p_items:items,p_notes:"Phase 6 flow",p_operation_id:orderOperationId});if(replay.orderId!==orderId||replay.replayed!==true)throw new Error("Lost-response order retry was not idempotent.");
 const observed=await rest("get_my_customer_order_v1",jwt,{p_order_id:orderId});if(observed.id!==orderId)throw new Error("Created order was not observable by its Customer.");
 await query(`update public.orders set status='delivered',preparing_at=statement_timestamp(),ready_at=statement_timestamp(),out_for_delivery_at=statement_timestamp(),delivered_at=statement_timestamp() where id=${q(orderId)}`);
 await rest("submit_my_customer_product_review_v1",jwt,{p_order_id:orderId,p_menu_item_id:itemId,p_rating:5,p_comment:"Phase 6 product review"});
 await rest("submit_my_customer_order_review_v1",jwt,{p_order_id:orderId,p_speed_rating:5,p_taste_rating:5,p_value_rating:5,p_price_performance_rating:5,p_comment:"Phase 6 order review"});
 console.log(JSON.stringify({target:"development",bootstrap:true,profileUpdate:true,address:true,favorite:true,configuredMenu:true,serverQuote:true,orderCreated:true,idempotentReplay:true,orderObserved:true,reviews:true}));
}finally{
 if(profileId){await query(`begin;
  delete from private.notification_deliveries where event_id in(select id from private.notification_events where order_id=${q(orderId||"")});delete from private.notification_events where order_id=${q(orderId||"")};
  delete from public.product_reviews where order_id=${q(orderId||"")};delete from public.order_reviews where order_id=${q(orderId||"")};delete from private.restaurant_order_visibility where order_id=${q(orderId||"")};delete from private.customer_order_operations where order_id=${q(orderId||"")};delete from private.order_status_history where order_id=${q(orderId||"")};delete from public.order_items where order_id=${q(orderId||"")};delete from private.order_contacts where order_id=${q(orderId||"")};delete from public.orders where id=${q(orderId||"")};
  ${fixtureCreated?`delete from public.menu_option_values where id=${q(optionId)};delete from public.menu_option_groups where id=${q(groupId)};delete from public.menu_item_ingredients where id=${q(ingredientId)};delete from public.menu_items where id=${q(itemId)};delete from public.categories where id=${q(categoryId)};`:""}
  delete from public.favorites where profile_id=${q(profileId)};delete from public.addresses where profile_id=${q(profileId)};delete from private.account_access where profile_id=${q(profileId)};delete from private.account_email_reservations where profile_id=${q(profileId)};delete from private.account_provisioning_operations where target_profile_id=${q(profileId)};delete from private.audit_log where actor_profile_id=${q(profileId)};delete from public.profiles where id=${q(profileId)};${restaurantId?`update public.restaurants set accepting_orders=${wasAccepting} where id=${q(restaurantId)};`:""}commit;`)}
 if(user)await app.auth().deleteUser(user.uid);await app.delete();
}
