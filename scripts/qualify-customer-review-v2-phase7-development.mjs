#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const secure=path.join(root,"secure"),phaseDir=path.join(secure,"customer-review-v2-phase7");
const registry=JSON.parse(fs.readFileSync(path.join(secure,"supabase-projects.local.json"),"utf8"));
const project=registry.projects?.development,action=process.argv[2]||"";
const arg=name=>process.argv.find(value=>value.startsWith(`${name}=`))?.slice(name.length+1);
const baseMigration="20260917100000_customer_review_system_v2.sql",migrationName="20260917110000_customer_review_system_v2_admin_inspection.sql";
const baseSha="5340eeb74a50c038ae755b812ed5efcef5a29bd84b2251c4d66bff7acf5f372b";
const expectedSha="7358386da677a074fe55d0f26fe57da93f90fb4607b9d3f538995d2610de5c0e";
const sha256=value=>crypto.createHash("sha256").update(value).digest("hex");
const migrationPath=path.join(root,"supabase/migrations",migrationName),basePath=path.join(root,"supabase/migrations",baseMigration);
const tokenPath=path.join(secure,"supabase-cli-hungrie/access-token"),managementToken=fs.readFileSync(tokenPath,"utf8").trim();
const cliEnv={...process.env,SUPABASE_HOME:path.join(secure,"supabase-cli-hungrie"),SUPABASE_ACCESS_TOKEN:managementToken};
const baselinePath=path.join(phaseDir,"development-baseline.json");

if(!project?.ref||!project.databasePassword||project.name!=="HungrieApp Development"||!project.url||!project.publishableKey||!managementToken||
  project.ref===registry.projects?.staging?.ref||project.ref===registry.projects?.production?.ref)throw new Error("Safe isolated Development configuration is required.");
if(sha256(fs.readFileSync(basePath))!==baseSha)throw new Error("The applied base migration checksum changed.");
if(sha256(fs.readFileSync(migrationPath))!==expectedSha||arg("--expect-sha256")!==expectedSha)throw new Error(`Reviewed migration SHA-256 is required: ${expectedSha}`);
if(!["backup","preflight","apply","types","probe","plans","verify-cleanup"].includes(action))throw new Error("Use backup|preflight|apply|types|probe|plans|verify-cleanup with the reviewed SHA-256.");
fs.mkdirSync(phaseDir,{recursive:true,mode:0o700});fs.chmodSync(phaseDir,0o700);

const quote=value=>`'${String(value).replaceAll("'","''")}'`;
const run=(command,args,options={})=>spawnSync(command,args,{cwd:root,encoding:"utf8",stdio:options.stdio||["ignore","pipe","pipe"],input:options.input,env:options.env||process.env});
const query=async sql=>{const response=await fetch(`https://api.supabase.com/v1/projects/${project.ref}/database/query`,{method:"POST",headers:{authorization:`Bearer ${managementToken}`,"content-type":"application/json"},body:JSON.stringify({query:sql})});if(!response.ok)throw new Error(`Development SQL request failed (${response.status}); details withheld.`);const rows=await response.json();if(!Array.isArray(rows))throw new Error("Development SQL response was malformed.");return rows};
const metadata=async()=>{const response=await fetch(`https://api.supabase.com/v1/projects/${project.ref}`,{headers:{authorization:`Bearer ${managementToken}`}});if(!response.ok)throw new Error(`Development metadata request failed (${response.status}).`);const value=await response.json();if(value.name!=="HungrieApp Development"||value.region!=="eu-central-1"||value.status!=="ACTIVE_HEALTHY"||!String(value.database?.version||"").startsWith("17"))throw new Error("Development identity, region, health, or PostgreSQL version changed.");return value};
const history=()=>query("select version from supabase_migrations.schema_migrations order by version");
const snapshotSql=`select
  (select count(*)::integer from public.product_reviews) product_reviews,
  (select count(*)::integer from public.order_reviews) order_reviews,
  (select count(*)::integer from private.order_review_reports) reports,
  (select count(*)::integer from private.order_review_meal_reactions) reactions,
  (select count(*)::integer from private.customer_review_operations) customer_operations,
  (select count(*)::integer from private.review_action_operations) action_operations,
  (select count(*)::integer from (select review_key from public.product_reviews group by review_key having count(*)>1)x) product_duplicates,
  (select count(*)::integer from (select review_key from public.order_reviews group by review_key having count(*)>1)x) order_duplicates,
  (select encode(extensions.digest(coalesce(jsonb_agg(to_jsonb(r) order by id)::text,'[]'),'sha256'),'hex') from public.product_reviews r) product_digest,
  (select encode(extensions.digest(coalesce(jsonb_agg(to_jsonb(r) order by id)::text,'[]'),'sha256'),'hex') from public.order_reviews r) order_digest,
  (select encode(extensions.digest(coalesce(jsonb_agg(to_jsonb(r) order by id)::text,'[]'),'sha256'),'hex') from private.order_review_reports r) report_digest,
  (select encode(extensions.digest(coalesce(jsonb_agg(to_jsonb(r) order by review_id,menu_item_id)::text,'[]'),'sha256'),'hex') from private.order_review_meal_reactions r) reaction_digest`;
const snapshot=async()=>(await query(snapshotSql))[0];
const expectedEmpty=value=>["product_reviews","order_reviews","reports","reactions","customer_operations","action_operations","product_duplicates","order_duplicates"].every(key=>Number(value[key])===0);
const dryRun=()=>{const result=run("supabase",["db","push","--project-ref",project.ref,"--password",project.databasePassword,"--skip-vault","--dry-run"],{env:cliEnv});const output=`${result.stdout||""}\n${result.stderr||""}`;const listed=[...output.matchAll(/\d{14}_[A-Za-z0-9_]+\.sql/g)].map(match=>match[0]);if(result.status!==0||!output.includes(migrationName)||[...new Set(listed)].some(name=>name!==migrationName))throw new Error("Development dry-run did not contain exactly the reviewed migration.");};
const preflight=async({persist=true}={})=>{await metadata();const versions=await history();if(versions.length!==46||String(versions.at(-1)?.version)!=="20260917100000")throw new Error("Development migration history changed from the Phase 7 baseline.");const applied=new Set(versions.map(row=>String(row.version)));const pending=fs.readdirSync(path.join(root,"supabase/migrations")).filter(name=>/^\d{14}_.+\.sql$/.test(name)&&!applied.has(name.slice(0,14))).sort();if(pending.length!==1||pending[0]!==migrationName)throw new Error("Pending migration set changed.");const before=await snapshot();if(!expectedEmpty(before))throw new Error("Development review baseline changed; refusing to migrate.");dryRun();const record={environment:"development",projectRef:project.ref,capturedAt:new Date().toISOString(),migration:migrationName,migrationSha256:expectedSha,baseMigrationSha256:baseSha,migrationCount:46,latestMigration:"20260917100000",snapshot:before};if(persist)fs.writeFileSync(baselinePath,JSON.stringify(record,null,2),{mode:0o600});return record};
const assertApplied=async()=>{const versions=await history();if(versions.length!==47||String(versions.at(-1)?.version)!=="20260917110000")throw new Error("Development Phase 7 migration is not applied.")};
const publicSchema=value=>{const start=value.indexOf("  public: {");const end=value.indexOf("\ntype DatabaseWithoutInternals");return start>=0&&end>start?value.slice(start,end):""};

if(action==="backup"){
  if(arg("--confirm")!=="development:review-v2-phase7-backup")throw new Error("Backup confirmation mismatch.");await metadata();const directory=path.join(phaseDir,`backup-${new Date().toISOString().replaceAll(/[:.]/g,"-")}`);fs.mkdirSync(directory,{recursive:true,mode:0o700});const entries=[{name:"schema.sql",args:[]},{name:"data.sql",args:["--data-only","--use-copy"]}];for(const entry of entries){const output=path.join(directory,entry.name),result=run("supabase",["db","dump","--project-ref",project.ref,"--password",project.databasePassword,"--file",output,...entry.args],{env:cliEnv});if(result.status!==0||!fs.existsSync(output)||fs.statSync(output).size<1024)throw new Error("Restricted Development backup failed.");fs.chmodSync(output,0o600)}const files=entries.map(({name})=>{const file=path.join(directory,name);return{name,bytes:fs.statSync(file).size,sha256:sha256(fs.readFileSync(file))}}),manifest={environment:"development",projectRef:project.ref,recordedAt:new Date().toISOString(),migration:migrationName,migrationSha256:expectedSha,files},manifestPath=path.join(directory,"manifest.json");fs.writeFileSync(manifestPath,JSON.stringify(manifest,null,2),{mode:0o600,flag:"wx"});console.log(JSON.stringify({action,environment:"development",manifestPath,files}));
}else if(action==="preflight"){
  if(arg("--confirm")!=="development:review-v2-phase7-preflight")throw new Error("Preflight confirmation mismatch.");const result=await preflight();console.log(JSON.stringify({action,environment:"development",migration:result.migration,migrationSha256:expectedSha,migrationCount:46,baseline:result.snapshot,dryRun:true}));
}else if(action==="apply"){
  if(arg("--confirm")!=="development:review-v2-phase7-migration")throw new Error("Migration confirmation mismatch.");const before=await preflight(),manifestPath=path.resolve(arg("--backup-manifest")||"");if(!manifestPath.startsWith(phaseDir+path.sep)||!fs.existsSync(manifestPath))throw new Error("Fresh Phase 7 backup manifest is required.");const manifest=JSON.parse(fs.readFileSync(manifestPath,"utf8"));if(manifest.environment!=="development"||manifest.projectRef!==project.ref||manifest.migrationSha256!==expectedSha||Date.now()-Date.parse(manifest.recordedAt)>86_400_000)throw new Error("Backup manifest is stale or mismatched.");for(const entry of manifest.files||[]){const file=path.join(path.dirname(manifestPath),entry.name);if(!fs.existsSync(file)||sha256(fs.readFileSync(file))!==entry.sha256)throw new Error("Backup checksum verification failed.")}const pushed=run("supabase",["db","push","--project-ref",project.ref,"--password",project.databasePassword,"--skip-vault","--yes"],{env:cliEnv});if(pushed.status!==0)throw new Error("Development migration application failed; operator output withheld.");await assertApplied();const after=await snapshot();for(const key of ["product_reviews","order_reviews","reports","reactions","customer_operations","action_operations","product_digest","order_digest","report_digest","reaction_digest"])if(before.snapshot[key]!==after[key])throw new Error(`Post-migration reconciliation failed for ${key}.`);const [catalog]=await query(`select
    has_function_privilege('authenticated','public.admin_list_order_review_audit_v2(uuid,text,integer)','execute') and not has_function_privilege('anon','public.admin_list_order_review_audit_v2(uuid,text,integer)','execute') audit_grant,
    has_function_privilege('authenticated','public.admin_list_order_review_reports_v2(public.review_report_status,text,text,integer)','execute') and not has_function_privilege('anon','public.admin_list_order_review_reports_v2(public.review_report_status,text,text,integer)','execute') report_grant,
    pg_get_userbyid(p.proowner)='hungrie_api_owner' owner_ok,
    pg_get_functiondef(p.oid) like '%contractVersion%' and pg_get_functiondef(p.oid) not like '%user_name_snapshot%' report_projection_ok
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='admin_list_order_review_reports_v2'`);if(!catalog?.audit_grant||!catalog?.report_grant||!catalog?.owner_ok||!catalog?.report_projection_ok)throw new Error("Post-migration catalog verification failed.");const lint=run("supabase",["db","lint","--linked","--project-ref",project.ref,"--schema","public,private,migration","--level","error","--fail-on","error"],{env:cliEnv});if(lint.status!==0)throw new Error("Hosted Development database lint failed; output withheld.");fs.writeFileSync(path.join(phaseDir,"development-applied.json"),JSON.stringify({appliedAt:new Date().toISOString(),migration:migrationName,migrationSha256:expectedSha,before:before.snapshot,after,backupManifest:manifestPath,hostedLint:"clean"},null,2),{mode:0o600});console.log(JSON.stringify({action,environment:"development",migration:migrationName,migrationSha256:expectedSha,migrationCount:47,reconciled:true,authenticatedOnly:true,owner:"hungrie_api_owner",hostedLint:"clean"}));
}else if(action==="types"){
  if(arg("--confirm")!=="development:review-v2-phase7-types")throw new Error("Type confirmation mismatch.");await assertApplied();const hosted=run("supabase",["gen","types","typescript","--project-id",project.ref,"--schema","public"],{env:cliEnv}),local=run("supabase",["gen","types","typescript","--local","--schema","public"]),tracked=fs.readFileSync(path.join(root,"packages/database-types/src/database.generated.ts"),"utf8");if(hosted.status!==0||local.status!==0||!publicSchema(hosted.stdout)||publicSchema(hosted.stdout)!==publicSchema(local.stdout)||publicSchema(hosted.stdout)!==publicSchema(tracked))throw new Error("Hosted, local, and checked-in public schema types differ.");const output=path.join(phaseDir,"development-types.ts");fs.writeFileSync(output,hosted.stdout,{mode:0o600});console.log(JSON.stringify({action,environment:"development",hostedSha256:sha256(hosted.stdout),localSha256:sha256(local.stdout),trackedSha256:sha256(tracked),publicSchemaSha256:sha256(publicSchema(hosted.stdout)),schemaParity:true,trackedChanged:false,evidencePath:output}));
}

// The identity probe and representative query-plan gate follow below. Keeping them
// in this guarded entrypoint ensures every hosted action shares the same target,
// checksum, confirmation, and redaction rules.
if (action === "verify-cleanup") {
  if (arg("--confirm") !== "development:review-v2-phase7-cleanup") throw new Error("Cleanup confirmation mismatch.");
  await assertApplied();
  if (!fs.existsSync(baselinePath)) throw new Error("Phase 7 preflight baseline is missing.");
  const baseline=JSON.parse(fs.readFileSync(baselinePath,"utf8")),current=await snapshot();
  const [probe]=await query(`select
    (select count(*) from public.profiles where id like 'crv2p7_%')::integer profiles,
    (select count(*) from public.orders where id like 'crv2p7_%')::integer orders,
    (select count(*) from public.order_reviews where id like 'crv2p7_%' or order_id like 'crv2p7_%')::integer reviews,
    (select count(*) from private.order_review_reports where review_id like 'crv2p7_%')::integer reports,
    (select count(*) from private.order_review_meal_reactions where review_id like 'crv2p7_%' or order_id like 'crv2p7_%')::integer reactions,
    (select count(*) from private.audit_log where target_id like 'crv2p7_%' or metadata::text like '%crv2p7_%')::integer audits`);
  const [security]=await query(`select
    has_function_privilege('authenticated','public.admin_list_order_review_audit_v2(uuid,text,integer)','execute') and not has_function_privilege('anon','public.admin_list_order_review_audit_v2(uuid,text,integer)','execute') audit_authenticated_only,
    pg_get_userbyid(p.proowner)='hungrie_api_owner' audit_owner,
    pg_get_functiondef(p.oid) not like '%comment%' and pg_get_functiondef(p.oid) not like '%internal_note%' and pg_get_functiondef(p.oid) not like '%resolution_note%' audit_projection_safe
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='admin_list_order_review_audit_v2'`);
  for(const key of ["product_reviews","order_reviews","reports","reactions","customer_operations","action_operations","product_digest","order_digest","report_digest","reaction_digest"])if(baseline.snapshot[key]!==current[key])throw new Error(`Cleanup reconciliation failed for ${key}.`);
  if(Object.values(probe).some(Number)||!security?.audit_authenticated_only||!security?.audit_owner||!security?.audit_projection_safe)throw new Error("Phase 7 cleanup or security verification failed.");
  const result={action,environment:"development",verifiedAt:new Date().toISOString(),migration:migrationName,migrationSha256:expectedSha,migrationCount:47,baseline:baseline.snapshot,current,probeRows:probe,baselineReconciled:true,security};
  fs.writeFileSync(path.join(phaseDir,"development-qualified.json"),JSON.stringify(result,null,2),{mode:0o600});
  console.log(JSON.stringify({action,environment:"development",migrationCount:47,probeRows:probe,baselineReconciled:true,security}));
}

if (action === "probe") {
  if (arg("--confirm") !== "development:review-v2-phase7-probe") throw new Error("Probe confirmation mismatch.");
  const credentialPath = path.resolve(arg("--credential") || "");
  if (!credentialPath || !fs.existsSync(credentialPath) || !path.relative(root,credentialPath).startsWith("..")) {
    throw new Error("An external Firebase Admin credential is required.");
  }
  const credential = JSON.parse(fs.readFileSync(credentialPath,"utf8"));
  if (credential.project_id!=="hungrieapp-a2288") throw new Error("Firebase credential project mismatch.");
  const versions=await history();
  if(versions.length!==47||String(versions.at(-1)?.version)!=="20260917110000")throw new Error("Development v2 migration is unavailable.");
  const require=createRequire(import.meta.url),admin=require(path.join(root,"functions/node_modules/firebase-admin"));
  const web=JSON.parse(fs.readFileSync(path.join(secure,"admin-firebase-web-development.local.json"),"utf8"));
  if(web.projectId!==credential.project_id||!web.apiKey)throw new Error("Firebase Web configuration mismatch.");
  const firebaseRequest=async(version,method,body,expected=200)=>{const response=await fetch(`https://identitytoolkit.googleapis.com/${version}/${method}?key=${encodeURIComponent(web.apiKey)}`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(body)});const payload=await response.json().catch(()=>null);if(response.status!==expected)throw new Error(`Firebase ${method} failed (${response.status}, ${String(payload?.error?.message||"unknown").replace(/[^A-Z0-9_:-]/gi,"")}).`);return payload};
  const exchange=async token=>(await firebaseRequest("v1","accounts:signInWithCustomToken",{token,returnSecureToken:true})).idToken;
  const request=async(endpoint,jwt,args={},method="POST")=>{const response=await fetch(`${project.url}/rest/v1/${endpoint}`,{method,headers:{apikey:project.publishableKey,...(jwt?{authorization:`Bearer ${jwt}`}:{ }),"content-type":"application/json","prefer":"return=representation"},...(method==="GET"?{}:{body:JSON.stringify(args)})});return{ok:response.ok,status:response.status,body:await response.json().catch(()=>null)}};
  const must=async(endpoint,jwt,args={})=>{const result=await request(endpoint,jwt,args);if(!result.ok)throw new Error(`${endpoint} unexpectedly failed (${result.status}, ${String(result.body?.code||"unknown").replace(/[^A-Z0-9]/gi,"")}, ${String(result.body?.message||"unspecified").replace(/[^A-Z0-9 _-]/gi,"").slice(0,80)}).`);return result.body};
  const deny=async(endpoint,jwt,args={})=>{const result=await request(endpoint,jwt,args);if(result.ok)throw new Error(`${endpoint} unexpectedly allowed a denied actor.`);return result.status};
  const base32=value=>{const alphabet="ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";let bits="";for(const c of value.replaceAll("=","").toUpperCase()){const i=alphabet.indexOf(c);if(i<0)throw new Error("Invalid TOTP secret.");bits+=i.toString(2).padStart(5,"0")}return Buffer.from(bits.match(/.{8}/g)?.map(x=>Number.parseInt(x,2))??[])};
  const totp=(secret,period=30,digits=6,algorithm="SHA1")=>{const input=Buffer.alloc(8);input.writeBigUInt64BE(BigInt(Math.floor(Date.now()/1000/period)));const digest=crypto.createHmac(algorithm.toLowerCase().replace("hmac",""),base32(secret)).update(input).digest(),offset=digest[digest.length-1]&15;return((digest.readUInt32BE(offset)&0x7fffffff)%(10**digits)).toString().padStart(digits,"0")};
  const tokenClaims=jwt=>JSON.parse(Buffer.from(jwt.split(".")[1],"base64url").toString("utf8"));
  const app=admin.initializeApp({credential:admin.credential.cert(credential),projectId:credential.project_id},`crv2p7-${Date.now()}`),auth=app.auth();
  const suffix=crypto.randomUUID().replaceAll("-","").slice(0,12),prefix=`crv2p7_${suffix}`;
  const ids={customerA:`${prefix}_ca`,customerB:`${prefix}_cb`,restaurantA:`${prefix}_ra`,restaurantB:`${prefix}_rb`,suspended:`${prefix}_sus`,revoked:`${prefix}_rev`,admin:`${prefix}_admin`,category:`${prefix}_cat`,item:`${prefix}_item_a`,item2:`${prefix}_item_b`,item3:`${prefix}_item_c`,main:`${prefix}_main`,repeat:`${prefix}_repeat`,other:`${prefix}_other`,legacy:`${prefix}_legacy`,expired:`${prefix}_expired`};
  const users={},tokens={};let fixtures=false,restaurantA,restaurantB,mainReview,legacyReview,reportId;
  const op={submit:crypto.randomUUID(),submitRepeat:crypto.randomUUID(),submitOther:crypto.randomUUID(),report:crypto.randomUUID(),reportLegacy:crypto.randomUUID(),reportDuplicate:crypto.randomUUID(),resolve:crypto.randomUUID(),reopen1:crypto.randomUUID(),dismiss:crypto.randomUUID(),reopen2:crypto.randomUUID(),hide:crypto.randomUUID(),restore:crypto.randomUUID()};
  try{
    const restaurants=await query("select id from public.restaurants where lifecycle_status='active' order by id limit 2");
    if(restaurants.length<2)throw new Error("Two active Development Restaurants are required.");[restaurantA,restaurantB]=restaurants.map(x=>x.id);
    for(const [key,id]of Object.entries({customerA:ids.customerA,customerB:ids.customerB,restaurantA:ids.restaurantA,restaurantB:ids.restaurantB,suspended:ids.suspended,revoked:ids.revoked})){
      users[key]=await auth.createUser({email:`${id}@example.invalid`,emailVerified:true});
      tokens[key]=await exchange(await auth.createCustomToken(users[key].uid,{role:"authenticated"}));
    }
    users.unmapped=await auth.createUser({email:`${prefix}_unmapped@example.invalid`,emailVerified:true});
    tokens.unmapped=await exchange(await auth.createCustomToken(users.unmapped.uid,{role:"authenticated"}));
    const adminPassword=`Crv2!${crypto.randomBytes(24).toString("base64url")}`;
    users.admin=await auth.createUser({email:`${ids.admin}@example.invalid`,emailVerified:true,password:adminPassword});
    await auth.setCustomUserClaims(users.admin.uid,{role:"authenticated"});
    const profileRows=[['customerA',ids.customerA],['customerB',ids.customerB],['restaurantA',ids.restaurantA],['restaurantB',ids.restaurantB],['suspended',ids.suspended],['revoked',ids.revoked],['admin',ids.admin]].map(([key,id])=>`(${quote(id)},${quote(users[key].uid)},'Review v2 probe',${quote(`${id}@example.invalid`)})`).join(",");
    await query(`begin;
      insert into public.profiles(id,firebase_uid,name,email) values ${profileRows};
      insert into private.account_access(profile_id,account_type,status,activated_at) values
        (${quote(ids.customerA)},'customer','active',transaction_timestamp()),(${quote(ids.customerB)},'customer','active',transaction_timestamp());
      insert into private.account_access(profile_id,account_type,status,activated_at,restaurant_id,restaurant_role) values
        (${quote(ids.restaurantA)},'restaurant','active',transaction_timestamp(),${quote(restaurantA)},'manager'),
        (${quote(ids.restaurantB)},'restaurant','active',transaction_timestamp(),${quote(restaurantB)},'manager');
      insert into private.account_access(profile_id,account_type,status,suspended_at)values(${quote(ids.suspended)},'customer','suspended',transaction_timestamp());
      insert into private.account_access(profile_id,account_type,status,revoked_at)values(${quote(ids.revoked)},'customer','revoked',transaction_timestamp());
      insert into private.account_access(profile_id,account_type,status,activated_at,admin_role,admin_mfa_enrolled_at)
        values(${quote(ids.admin)},'admin','active',transaction_timestamp(),'admin',transaction_timestamp());
      insert into public.categories(id,restaurant_id,name,is_active,sort_order)values(${quote(ids.category)},${quote(restaurantA)},'Review v2 probe',true,99999);
      insert into public.menu_items(id,restaurant_id,category_id,name,price_kurus,is_active,sort_order) values
        (${quote(ids.item)},${quote(restaurantA)},${quote(ids.category)},'Server-owned probe meal A',100,true,0),
        (${quote(ids.item2)},${quote(restaurantA)},${quote(ids.category)},'Server-owned probe meal B',100,true,1),
        (${quote(ids.item3)},${quote(restaurantA)},${quote(ids.category)},'Server-owned probe meal C',100,true,2);
      insert into public.orders(id,profile_id,restaurant_id,status,payment_method,subtotal_kurus,total_kurus,delivered_at,created_at)values
        (${quote(ids.main)},${quote(ids.customerA)},${quote(restaurantA)},'delivered','cash',300,300,transaction_timestamp()-interval '1 hour',transaction_timestamp()-interval '2 hours'),
        (${quote(ids.repeat)},${quote(ids.customerA)},${quote(restaurantA)},'delivered','cash',100,100,transaction_timestamp()-interval '90 minutes',transaction_timestamp()-interval '3 hours'),
        (${quote(ids.other)},${quote(ids.customerB)},${quote(restaurantA)},'delivered','cash',100,100,transaction_timestamp()-interval '2 hours',transaction_timestamp()-interval '3 hours'),
        (${quote(ids.legacy)},${quote(ids.customerA)},${quote(restaurantA)},'delivered','cash',100,100,transaction_timestamp()-interval '3 hours',transaction_timestamp()-interval '4 hours'),
        (${quote(ids.expired)},${quote(ids.customerA)},${quote(restaurantA)},'delivered','cash',100,100,transaction_timestamp()-interval '30 days',transaction_timestamp()-interval '31 days');
      insert into public.order_items(id,order_id,menu_item_id,source_menu_item_id,name_snapshot,unit_price_kurus,quantity,customizations_snapshot,created_at)values
        (${quote(`${ids.main}_1`)},${quote(ids.main)},${quote(ids.item)},${quote(ids.item)},'Server-owned probe meal A',100,1,'[]',transaction_timestamp()-interval '4 seconds'),
        (${quote(`${ids.main}_2`)},${quote(ids.main)},${quote(ids.item)},${quote(ids.item)},'Server-owned probe meal A',100,2,'[{"probe":"configured"}]',transaction_timestamp()-interval '3 seconds'),
        (${quote(`${ids.main}_3`)},${quote(ids.main)},${quote(ids.item2)},${quote(ids.item2)},'Server-owned probe meal B',100,1,'[]',transaction_timestamp()-interval '2 seconds'),
        (${quote(`${ids.main}_4`)},${quote(ids.main)},${quote(ids.item3)},${quote(ids.item3)},'Server-owned probe meal C',100,1,'[]',transaction_timestamp()-interval '1 second'),
        (${quote(`${ids.repeat}_1`)},${quote(ids.repeat)},${quote(ids.item)},${quote(ids.item)},'Server-owned probe meal A',100,1,'[]',transaction_timestamp()),
        (${quote(`${ids.other}_1`)},${quote(ids.other)},${quote(ids.item)},${quote(ids.item)},'Server-owned probe meal',100,1,'[]',transaction_timestamp()),
        (${quote(`${ids.legacy}_1`)},${quote(ids.legacy)},${quote(ids.item)},${quote(ids.item)},'Server-owned probe meal',100,1,'[]',transaction_timestamp()),
        (${quote(`${ids.expired}_1`)},${quote(ids.expired)},${quote(ids.item)},${quote(ids.item)},'Server-owned probe meal',100,1,'[]',transaction_timestamp());commit;`);fixtures=true;
    const before=await must("rpc/get_restaurant_review_summary_v2",null,{p_restaurant_id:restaurantA});if(Number(before.reviewCount)!==0)throw new Error("Probe Restaurant unexpectedly had v2 reviews.");
    const prompt=await must("rpc/get_my_customer_review_prompt_v2",tokens.customerA,{});if(prompt?.orderId!==ids.main)throw new Error("Newest eligible prompt was incorrect.");
    const submitted=await must("rpc/submit_my_customer_order_review_v2",tokens.customerA,{p_order_id:ids.main,p_taste_rating:4,p_speed_rating:5,p_comment:"  café\tline\n  ",p_meal_reactions_json:[{menuItemId:ids.item2,reaction:"disliked"},{menuItemId:ids.item,reaction:"liked"}],p_operation_id:op.submit});mainReview=submitted.reviewId;if(!mainReview||submitted.replayed!==false)throw new Error("Initial v2 submission result was invalid.");
    const replay=await must("rpc/submit_my_customer_order_review_v2",tokens.customerA,{p_order_id:ids.main,p_taste_rating:4,p_speed_rating:5,p_comment:"café\tline\n",p_meal_reactions_json:[{reaction:"liked",menuItemId:ids.item},{reaction:"disliked",menuItemId:ids.item2}],p_operation_id:op.submit});if(replay.reviewId!==mainReview||replay.replayed!==true)throw new Error("Exact canonical replay failed.");
    await deny("rpc/submit_my_customer_order_review_v2",tokens.customerA,{p_order_id:ids.main,p_taste_rating:4,p_speed_rating:5,p_comment:"changed",p_meal_reactions_json:[],p_operation_id:op.submit});
    await deny("rpc/get_my_customer_order_review_state_v2",tokens.customerB,{p_order_id:ids.main});
    await deny("rpc/submit_my_customer_order_review_v2",tokens.customerA,{p_order_id:ids.expired,p_taste_rating:4,p_speed_rating:4,p_comment:"",p_meal_reactions_json:[],p_operation_id:crypto.randomUUID()});
    for(const actor of ["suspended","revoked","unmapped","restaurantA"])await deny("rpc/get_my_customer_review_prompt_v2",tokens[actor],{});
    await deny("rpc/submit_my_customer_order_review_v2",null,{p_order_id:ids.main,p_taste_rating:4,p_speed_rating:4,p_comment:"",p_meal_reactions_json:[],p_operation_id:crypto.randomUUID()});
    const direct=await request("order_reviews",tokens.customerA,{id:`${prefix}_forbidden`});if(direct.ok)throw new Error("Direct authenticated review insert succeeded.");
    const state=await must("rpc/get_my_customer_order_review_state_v2",tokens.customerA,{p_order_id:ids.main});if(!state.reviewed||state.review?.reviewId!==mainReview)throw new Error("Authoritative restart recovery state failed.");
    await must("rpc/submit_my_customer_order_review_v2",tokens.customerA,{p_order_id:ids.repeat,p_taste_rating:5,p_speed_rating:3,p_comment:"Repeat meal",p_meal_reactions_json:[{menuItemId:ids.item,reaction:"disliked"}],p_operation_id:op.submitRepeat});
    const second=await must("rpc/submit_my_customer_order_review_v2",tokens.customerB,{p_order_id:ids.other,p_taste_rating:2,p_speed_rating:4,p_comment:"Second",p_meal_reactions_json:[{menuItemId:ids.item,reaction:"disliked"}],p_operation_id:op.submitOther});
    await query(`update public.order_reviews set created_at='2026-09-17T12:00:00Z' where id in(${quote(mainReview)},${quote(second.reviewId)})`);
    await must("rpc/submit_my_customer_order_review_v1",tokens.customerA,{p_order_id:ids.legacy,p_speed_rating:5,p_taste_rating:4,p_value_rating:3,p_price_performance_rating:2,p_comment:"Legacy"});
    [{id:legacyReview}]=await query(`select id from public.order_reviews where order_id=${quote(ids.legacy)}`);
    await query(`update public.order_reviews set created_at='2026-09-17T12:00:00Z' where order_id=${quote(ids.legacy)}`);
    const [rows]=await query(`select jsonb_build_object('v2Nulls',value_rating is null and price_performance_rating is null and user_name_snapshot is null and average_rating is null,
      'groupedQuantity',items_snapshot->0->>'quantity','serverName',items_snapshot->0->>'name','comment',comment) v2 from public.order_reviews where id=${quote(mainReview)}`);
    if(!rows?.v2?.v2Nulls||rows.v2.groupedQuantity!=="3"||rows.v2.serverName!=="Server-owned probe meal A"||rows.v2.comment!=="café\tline\n")throw new Error("Stored v2 semantics failed.");
    const [legacy]=await query(`select value_rating,price_performance_rating,average_rating,contract_version from public.order_reviews where order_id=${quote(ids.legacy)}`);if(Number(legacy.value_rating)!==3||Number(legacy.price_performance_rating)!==2||Number(legacy.average_rating)!==4||Number(legacy.contract_version)!==1)throw new Error("Legacy v1 review behavior changed.");
    const owned=await must("rpc/list_my_order_reviews",tokens.customerA,{p_limit:100});if(!Array.isArray(owned)||owned.some(x=>"profile_id"in x||"order_id"in x||"review_key"in x)||!owned.some(x=>"value_rating"in x))throw new Error("Canonical legacy projection failed.");
    const page1=await must("rpc/list_published_restaurant_reviews_v2",null,{p_restaurant_id:restaurantA,p_cursor:null,p_limit:1});const page2=await must("rpc/list_published_restaurant_reviews_v2",null,{p_restaurant_id:restaurantA,p_cursor:page1.nextCursor,p_limit:1});if(!page1.nextCursor||page1.items[0].reviewId===page2.items[0].reviewId)throw new Error("Public keyset tie-break failed.");
    const forbiddenKeys=["profileId","profile_id","orderId","order_id","userName","user_name_snapshot","operationId","reactions","priceKurus","customizations"];if(forbiddenKeys.some(k=>JSON.stringify(page1).includes(`\"${k}\"`)))throw new Error("Public review projection leaked a forbidden field.");
    const summary=await must("rpc/get_restaurant_review_summary_v2",null,{p_restaurant_id:restaurantA});if(Number(summary.reviewCount)!==4||Number(summary.overallRating)!==4)throw new Error("Database-owned v2 summary was incorrect.");
    const queue=await must("rpc/restaurant_list_order_reviews_v2",tokens.restaurantA,{p_status:null,p_report_status:null,p_cursor:null,p_limit:20});if(forbiddenKeys.slice(0,6).some(k=>JSON.stringify(queue).includes(`\"${k}\"`)))throw new Error("Restaurant queue leaked identity or order data.");
    const otherQueue=await must("rpc/restaurant_list_order_reviews_v2",tokens.restaurantB,{p_status:null,p_report_status:null,p_cursor:null,p_limit:20});if(otherQueue.items.some(x=>x.reviewId===mainReview))throw new Error("Cross-Restaurant queue isolation failed.");
    const note="n".repeat(500),reported=await must("rpc/restaurant_report_order_review_v2",tokens.restaurantA,{p_review_id:mainReview,p_reason:"other",p_internal_note:note,p_operation_id:op.report});reportId=reported.reportId;
    const reportReplay=await must("rpc/restaurant_report_order_review_v2",tokens.restaurantA,{p_review_id:mainReview,p_reason:"other",p_internal_note:note,p_operation_id:op.report});if(reportReplay.replayed!==true||reportReplay.reportId!==reportId)throw new Error("Report replay failed.");
    await deny("rpc/restaurant_report_order_review_v2",tokens.restaurantA,{p_review_id:mainReview,p_reason:"spam",p_internal_note:null,p_operation_id:op.reportDuplicate});
    await deny("rpc/restaurant_report_order_review_v2",tokens.restaurantB,{p_review_id:mainReview,p_reason:"spam",p_internal_note:null,p_operation_id:crypto.randomUUID()});
    await deny("rpc/restaurant_report_order_review_v2",tokens.restaurantA,{p_review_id:second.reviewId,p_reason:"invalid_reason",p_internal_note:null,p_operation_id:crypto.randomUUID()});
    await deny("rpc/restaurant_report_order_review_v2",tokens.restaurantA,{p_review_id:second.reviewId,p_reason:"spam",p_internal_note:"x".repeat(501),p_operation_id:crypto.randomUUID()});
    await deny("rpc/restaurant_report_order_review_v2",tokens.restaurantA,{p_review_id:second.reviewId,p_reason:"spam",p_internal_note:"bad\u0001note",p_operation_id:crypto.randomUUID()});
    await must("rpc/restaurant_report_order_review_v2",tokens.restaurantA,{p_review_id:legacyReview,p_reason:"spam",p_internal_note:null,p_operation_id:op.reportLegacy});
    await deny("rpc/restaurant_moderate_review_v1",tokens.restaurantA,{p_review_type:"order",p_review_id:mainReview,p_status:"hidden",p_reply:null,p_operation_id:crypto.randomUUID()});
    await deny("rpc/moderate_review",tokens.restaurantA,{p_review_type:"order",p_review_id:mainReview,p_status:"hidden",p_reply:null});
    const afterReportSummary=await must("rpc/get_restaurant_review_summary_v2",null,{p_restaurant_id:restaurantA});if(JSON.stringify(afterReportSummary)!==JSON.stringify(summary))throw new Error("Restaurant report changed public metrics.");
    const reportedQueue=await must("rpc/restaurant_list_order_reviews_v2",tokens.restaurantA,{p_status:null,p_report_status:"open",p_cursor:null,p_limit:20});if(JSON.stringify(reportedQueue).includes("internalNote")||JSON.stringify(reportedQueue).includes(note))throw new Error("Restaurant queue exposed an internal report note.");
    const aggregate=await must("rpc/restaurant_list_menu_item_reaction_aggregates_v2",tokens.restaurantA,{p_cursor:null,p_limit:50});const itemAgg=aggregate.items.find(x=>x.menuItemId===ids.item),itemAgg2=aggregate.items.find(x=>x.menuItemId===ids.item2);if(!itemAgg||Number(itemAgg.likedCount)!==1||Number(itemAgg.dislikedCount)!==2||Math.abs(Number(itemAgg.positivePercentage)-33.3)>.02||!itemAgg2||Number(itemAgg2.dislikedCount)!==1||forbiddenKeys.some(k=>JSON.stringify(aggregate).includes(`\"${k}\"`)))throw new Error(`Restaurant reaction aggregate failed: a=${JSON.stringify(itemAgg&&{liked:itemAgg.likedCount,disliked:itemAgg.dislikedCount,positive:itemAgg.positivePercentage})}, b=${JSON.stringify(itemAgg2&&{liked:itemAgg2.likedCount,disliked:itemAgg2.dislikedCount,positive:itemAgg2.positivePercentage})}, privacy=${forbiddenKeys.some(k=>JSON.stringify(aggregate).includes(`\\\"${k}\\\"`))}.`);
    const firstFactor=await firebaseRequest("v1","accounts:signInWithPassword",{email:`${ids.admin}@example.invalid`,password:adminPassword,returnSecureToken:true});
    const enrollment=await firebaseRequest("v2","accounts/mfaEnrollment:start",{idToken:firstFactor.idToken,totpEnrollmentInfo:{}}),session=enrollment?.totpSessionInfo;if(!session?.sharedSecretKey||!session.sessionInfo)throw new Error("TOTP enrollment did not start.");
    const enrollmentCode=totp(session.sharedSecretKey,session.periodSec,session.verificationCodeLength,session.hashingAlgorithm);
    await firebaseRequest("v2","accounts/mfaEnrollment:finalize",{idToken:firstFactor.idToken,displayName:"Review v2 probe",totpVerificationInfo:{sessionInfo:session.sessionInfo,verificationCode:enrollmentCode}});
    const signInResponse=await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${encodeURIComponent(web.apiKey)}`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({email:`${ids.admin}@example.invalid`,password:adminPassword,returnSecureToken:true})}),challenge=await signInResponse.json().catch(()=>null),detail=challenge?.mfaPendingCredential?challenge:challenge?.error?.details?.[0],enrollmentId=detail?.mfaInfo?.[0]?.mfaEnrollmentId;if(!detail?.mfaPendingCredential||!enrollmentId)throw new Error("TOTP sign-in challenge failed.");
    if(totp(session.sharedSecretKey,session.periodSec,session.verificationCodeLength,session.hashingAlgorithm)===enrollmentCode){const period=session.periodSec*1000;await new Promise(resolve=>setTimeout(resolve,Math.ceil(Date.now()/period)*period-Date.now()+500))}
    const mfa=await firebaseRequest("v2","accounts/mfaSignIn:finalize",{mfaPendingCredential:detail.mfaPendingCredential,mfaEnrollmentId:enrollmentId,totpVerificationInfo:{verificationCode:totp(session.sharedSecretKey,session.periodSec,session.verificationCodeLength,session.hashingAlgorithm)}}),claims=tokenClaims(mfa.idToken);if(claims.firebase?.sign_in_second_factor!=="totp"||claims.email_verified!==true||!Number.isInteger(claims.auth_time))throw new Error("Real MFA token lacked required claims.");tokens.admin=mfa.idToken;
    const adminInspection=await must("rpc/admin_list_order_review_reports_v2",tokens.admin,{p_status:null,p_restaurant_id:restaurantA,p_cursor:null,p_limit:20}),versionsSeen=new Set(adminInspection.items.map(x=>Number(x.review?.contractVersion)));if(forbiddenKeys.slice(0,6).some(k=>JSON.stringify(adminInspection).includes(`\"${k}\"`))||!versionsSeen.has(1)||!versionsSeen.has(2))throw new Error("Admin inspection privacy or contract-version qualification failed.");
    await deny("rpc/admin_set_order_review_visibility_v2",firstFactor.idToken,{p_review_id:mainReview,p_status:"hidden",p_reason:"first factor",p_operation_id:crypto.randomUUID()});
    await query(`begin;select set_config('request.jwt.claims',jsonb_build_object('role','authenticated','iss','https://securetoken.google.com/hungrieapp-a2288','aud','hungrieapp-a2288','sub',${quote(users.admin.uid)},'email_verified',true,'auth_time',extract(epoch from statement_timestamp()-interval '10 minutes')::bigint,'firebase',jsonb_build_object('sign_in_second_factor','totp'))::text,true);do $$begin perform public.admin_set_order_review_visibility_v2(${quote(mainReview)},'hidden','stale auth',gen_random_uuid());raise exception 'stale auth unexpectedly accepted';exception when insufficient_privilege then null;end$$;rollback;`);
    await must("rpc/admin_set_order_review_report_status_v2",tokens.admin,{p_report_id:reportId,p_status:"resolved",p_resolution_note:"resolved",p_operation_id:op.resolve});
    await deny("rpc/admin_set_order_review_report_status_v2",tokens.admin,{p_report_id:reportId,p_status:"dismissed",p_resolution_note:"invalid",p_operation_id:crypto.randomUUID()});
    await must("rpc/admin_set_order_review_report_status_v2",tokens.admin,{p_report_id:reportId,p_status:"open",p_resolution_note:null,p_operation_id:op.reopen1});
    await must("rpc/admin_set_order_review_report_status_v2",tokens.admin,{p_report_id:reportId,p_status:"dismissed",p_resolution_note:"dismissed",p_operation_id:op.dismiss});
    await must("rpc/admin_set_order_review_report_status_v2",tokens.admin,{p_report_id:reportId,p_status:"open",p_resolution_note:null,p_operation_id:op.reopen2});
    const beforeHide=await must("rpc/get_restaurant_review_summary_v2",null,{p_restaurant_id:restaurantA});
    await must("rpc/admin_set_order_review_visibility_v2",tokens.admin,{p_review_id:mainReview,p_status:"hidden",p_reason:"policy probe",p_operation_id:op.hide});
    const hiddenSummary=await must("rpc/get_restaurant_review_summary_v2",null,{p_restaurant_id:restaurantA}),hiddenAgg=await must("rpc/restaurant_list_menu_item_reaction_aggregates_v2",tokens.restaurantA,{p_cursor:null,p_limit:50});if(Number(hiddenSummary.reviewCount)!==Number(beforeHide.reviewCount)-1||Number(hiddenAgg.items.find(x=>x.menuItemId===ids.item)?.likedCount||0)!==0)throw new Error("Admin hide did not remove metric/reaction contribution.");
    await must("rpc/admin_set_order_review_visibility_v2",tokens.admin,{p_review_id:mainReview,p_status:"published",p_reason:"restore probe",p_operation_id:op.restore});
    const restored=await must("rpc/get_restaurant_review_summary_v2",null,{p_restaurant_id:restaurantA}),restoredAgg=await must("rpc/restaurant_list_menu_item_reaction_aggregates_v2",tokens.restaurantA,{p_cursor:null,p_limit:50});if(Number(restored.reviewCount)!==Number(beforeHide.reviewCount)||Number(restoredAgg.items.find(x=>x.menuItemId===ids.item)?.likedCount)!==1)throw new Error("Admin restore did not restore exactly one contribution.");
    await query(`update private.audit_log set created_at='2026-09-18T12:00:00Z' where (target_id=${quote(String(reportId))} or target_id=${quote(mainReview)}) and action in('order_review.report_status_changed_v2','order_review.visibility_changed_v2')`);
    const auditPage1=await must("rpc/admin_list_order_review_audit_v2",tokens.admin,{p_report_id:reportId,p_cursor:null,p_limit:1}),auditPage2=await must("rpc/admin_list_order_review_audit_v2",tokens.admin,{p_report_id:reportId,p_cursor:auditPage1.nextCursor,p_limit:1});
    const auditText=JSON.stringify([auditPage1,auditPage2]),allowedAudit=new Set(["order_review.reported_v2","order_review.report_status_changed_v2","order_review.visibility_changed_v2"]),auditItems=[...auditPage1.items,...auditPage2.items];
    if(!auditPage1.nextCursor||auditItems.length!==2||auditItems[0].auditId===auditItems[1].auditId||auditItems.some(x=>!allowedAudit.has(x.action)||!x.actorProfileId||!x.restaurantId||!x.operationId)||["comment","internalNote","resolutionNote","orderId","reactions"].some(k=>auditText.includes(`\"${k}\"`)))throw new Error("Admin audit RPC filtering, cursor tie, metadata, or privacy failed.");
    await deny("rpc/admin_list_order_review_audit_v2",tokens.restaurantA,{p_report_id:reportId,p_cursor:null,p_limit:20});
    await deny("rpc/admin_list_order_review_audit_v2",null,{p_report_id:reportId,p_cursor:null,p_limit:20});
    const [audit]=await query(`select count(*)::integer events,bool_and(not(metadata ?| array['comment','internal_note','resolution_note'])) sanitized from private.audit_log where (target_id=${quote(mainReview)} or metadata->>'review_id'=${quote(mainReview)}) and action like 'order_review.%_v2'`);if(Number(audit.events)<6||!audit.sanitized)throw new Error("Audit coverage or sanitization failed.");
    console.log(JSON.stringify({action,environment:"development",activeCustomer:true,canonicalReplay:true,changedReplayDenied:true,authoritativeRecovery:true,configuredGrouping:true,independentRepeatMeal:true,ownershipIsolation:true,statusDenials:true,utcBoundary:true,v1Compatibility:true,contractVersions:true,publicPrivacy:true,keysetTieBreak:true,restaurantReportOnly:true,reportValidation:true,reportReplay:true,aggregatePrivacy:true,realMfaAdmin:true,firstFactorDenied:true,staleAuthDenied:true,reportTransitions:true,hideRestoreTransactional:true,auditRpcFiltered:true,auditCursorTie:true,auditSanitized:true}));
  }finally{
    if(fixtures){await query(`begin;
      delete from private.review_action_operations where actor_profile_id like ${quote(`${prefix}%`)};
      delete from private.order_review_reports where review_id in(select id from public.order_reviews where order_id like ${quote(`${prefix}%`)});
      delete from private.order_review_meal_reactions where order_id like ${quote(`${prefix}%`)};
      delete from private.customer_review_operations where profile_id like ${quote(`${prefix}%`)};
      delete from private.notification_deliveries where event_id in(select id from private.notification_events where order_id like ${quote(`${prefix}%`)});
      delete from private.notification_events where order_id like ${quote(`${prefix}%`)} or review_id in(select id from public.product_reviews where order_id like ${quote(`${prefix}%`)});
      delete from private.audit_log where actor_profile_id like ${quote(`${prefix}%`)} or target_id like ${quote(`${prefix}%`)} or metadata::text like ${quote(`%${prefix}%`)};
      delete from public.product_reviews where order_id like ${quote(`${prefix}%`)};delete from public.order_reviews where order_id like ${quote(`${prefix}%`)};
      delete from private.restaurant_order_visibility where order_id like ${quote(`${prefix}%`)};delete from private.customer_order_operations where order_id like ${quote(`${prefix}%`)};
      delete from private.order_status_history where order_id like ${quote(`${prefix}%`)};delete from private.order_contacts where order_id like ${quote(`${prefix}%`)};
      delete from public.order_items where order_id like ${quote(`${prefix}%`)};delete from public.orders where id like ${quote(`${prefix}%`)};
      delete from public.menu_items where id like ${quote(`${prefix}%`)};delete from public.categories where id=${quote(ids.category)};
      delete from private.account_access where profile_id like ${quote(`${prefix}%`)};delete from public.profiles where id like ${quote(`${prefix}%`)};commit;`)}
    const firebaseCleanupErrors=[];
    for(const user of Object.values(users))if(user?.uid)try{await auth.deleteUser(user.uid)}catch(error){if(error?.code!=="auth/user-not-found")firebaseCleanupErrors.push(error?.code||"unknown")}
    const remaining=[];let pageToken;
    do{const page=await auth.listUsers(1000,pageToken);remaining.push(...page.users.filter(user=>user.email?.startsWith(prefix)));pageToken=page.pageToken}while(pageToken);
    await app.delete();
    if(firebaseCleanupErrors.length||remaining.length)throw new Error(`Firebase fixture cleanup failed (${firebaseCleanupErrors.length} errors, ${remaining.length} remaining).`);
  }
}

if(action==="plans"){
  if(arg("--confirm")!=="development:review-v2-phase7-plans")throw new Error("Query-plan confirmation mismatch.");
  const versions=await history();if(versions.length!==47||String(versions.at(-1)?.version)!=="20260917110000")throw new Error("Development v2 migration is unavailable.");
  const planSql=`begin;
    create temporary table crv2p7_restaurants as select row_number()over(order by id)::integer n,id from public.restaurants where lifecycle_status='active' order by id limit 9;
    do $$begin if (select count(*) from crv2p7_restaurants)<2 then raise exception 'representative plans require two Restaurants';end if;end$$;
    create temporary table crv2p7_settings as select count(*)::integer restaurant_count,(select id from crv2p7_restaurants where n=1) target_restaurant from crv2p7_restaurants;
    insert into public.profiles(id,name,email,preferred_language)
      select 'crv2p7_plan_profile_'||g,'Plan fixture','crv2p7-plan-'||g||'@example.invalid','en' from generate_series(1,5000)g;
    insert into public.orders(id,profile_id,restaurant_id,status,payment_method,subtotal_kurus,total_kurus,delivered_at,created_at)
      select 'crv2p7_plan_order_'||g,'crv2p7_plan_profile_'||g,r.id,'delivered','cash',100,100,
        transaction_timestamp()-interval '1 hour',transaction_timestamp()-(g||' seconds')::interval
      from generate_series(1,5000)g join crv2p7_settings s on true join crv2p7_restaurants r on r.n=1+((g-1)%s.restaurant_count);
    insert into public.order_reviews(id,review_key,order_id,restaurant_id,profile_id,user_name_snapshot,restaurant_name_snapshot,
      speed_rating,taste_rating,value_rating,price_performance_rating,comment,items_snapshot,status,created_at,contract_version)
      select 'crv2p7_plan_review_'||g,'crv2p7_plan_key_'||g,'crv2p7_plan_order_'||g,r.id,'crv2p7_plan_profile_'||g,
        null,'Plan Restaurant',(g%5+1)::smallint,((g+2)%5+1)::smallint,null,null,'','[]',
        case when g%10=0 then 'hidden'::public.review_status else 'published'::public.review_status end,
        transaction_timestamp()-(g||' milliseconds')::interval,2
      from generate_series(1,5000)g join crv2p7_settings s on true join crv2p7_restaurants r on r.n=1+((g-1)%s.restaurant_count);
    insert into private.order_review_meal_reactions(review_id,order_id,restaurant_id,profile_id,menu_item_id,reaction,menu_item_name_snapshot)
      select 'crv2p7_plan_review_'||g,'crv2p7_plan_order_'||g,r.id,'crv2p7_plan_profile_'||g,
        'crv2p7_plan_item_'||(g%100),case when g%2=0 then 'liked'::private.meal_reaction else 'disliked'::private.meal_reaction end,'Plan Item'
      from generate_series(1,5000)g join crv2p7_settings s on true join crv2p7_restaurants r on r.n=1+((g-1)%s.restaurant_count);
    insert into private.customer_review_operations(profile_id,operation_id,request_sha256,review_id)
      select 'crv2p7_plan_profile_'||g,md5('crv2p7-operation-'||g)::uuid,repeat('a',64),'crv2p7_plan_review_'||g from generate_series(1,5000)g;
    insert into private.order_review_reports(review_id,restaurant_id,created_by_profile_id,reason,status,created_at)
      select 'crv2p7_plan_review_'||g,r.id,'crv2p7_plan_profile_'||g,'spam',
        case when g%3=0 then 'resolved'::public.review_report_status else 'open'::public.review_report_status end,
        transaction_timestamp()-(g||' milliseconds')::interval
      from generate_series(1,1500)g join crv2p7_settings s on true join crv2p7_restaurants r on r.n=1+((g-1)%s.restaurant_count);
    insert into private.audit_log(actor_profile_id,action,target_type,target_id,metadata,created_at)
      select 'crv2p7_plan_profile_1','order_review.report_status_changed_v2','order_review_report',
        (select id::text from private.order_review_reports where review_id='crv2p7_plan_review_1'),
        jsonb_build_object('contract_version',2,'restaurant_id',(select target_restaurant from crv2p7_settings),'operation_id',md5('crv2p7-audit-'||g)::uuid),
        transaction_timestamp()-(g||' milliseconds')::interval from generate_series(1,5000)g;
    analyze public.profiles;analyze public.orders;analyze public.order_reviews;analyze private.order_review_meal_reactions;
    analyze private.customer_review_operations;analyze private.order_review_reports;analyze private.audit_log;
    create temporary table crv2p7_plans(name text primary key,expected_index text not null,plan jsonb not null);
    do $$declare p jsonb;target text:=(select target_restaurant from crv2p7_settings);begin
      execute format('explain(analyze,buffers,format json)select id from public.order_reviews where restaurant_id=%L and status=''published'' order by created_at desc,id desc limit 20',target)into p;
      insert into crv2p7_plans values('public_feed','order_reviews_published_feed_idx',p);
      execute 'explain(analyze,buffers,format json)select id from public.order_reviews where order_id=''crv2p7_plan_order_4999'' and profile_id=''crv2p7_plan_profile_4999'''into p;
      insert into crv2p7_plans values('customer_lookup','order_reviews_profile_created_idx',p);
      execute format('explain(analyze,buffers,format json)select id from public.order_reviews where restaurant_id=%L and status=''hidden'' order by created_at desc,id desc limit 20',target)into p;
      insert into crv2p7_plans values('restaurant_queue','order_reviews_restaurant_status_created_id_idx',p);
      execute format('explain(analyze,buffers,format json)select id from private.order_review_reports where restaurant_id=%L and status=''open'' order by created_at desc,id desc limit 20',target)into p;
      insert into crv2p7_plans values('report_queue','order_review_reports_restaurant_status_created_id_idx',p);
      execute 'explain(analyze,buffers,format json)select id from private.audit_log where target_type=''order_review_report'' and target_id=(select id::text from private.order_review_reports where review_id=''crv2p7_plan_review_1'') order by created_at desc,id desc limit 20' into p;
      insert into crv2p7_plans values('report_audit','audit_log_target_created_idx',p);
      execute 'explain(analyze,buffers,format json)select review_id from private.customer_review_operations where profile_id=''crv2p7_plan_profile_4999'' and operation_id=md5(''crv2p7-operation-4999'')::uuid'into p;
      insert into crv2p7_plans values('operation_replay','customer_review_operations_pkey',p);
      execute format('explain(analyze,buffers,format json)select x.menu_item_id,count(*)filter(where x.reaction=''liked'') from private.order_review_meal_reactions x join public.order_reviews r on r.id=x.review_id where x.restaurant_id=%L and r.status=''published'' group by x.menu_item_id order by x.menu_item_id limit 50',target)into p;
      insert into crv2p7_plans values('reaction_aggregate','order_review_reactions_restaurant_item_reaction_idx',p);
    end$$;
    select name,expected_index,plan::text like '%'||expected_index||'%' uses_expected_index,
      case when name in('public_feed','customer_lookup','restaurant_queue')then jsonb_path_exists(plan,'$.** ? (@.\"Node Type\" == \"Seq Scan\" && @.\"Relation Name\" == \"order_reviews\")')
        when name='report_queue'then jsonb_path_exists(plan,'$.** ? (@.\"Node Type\" == \"Seq Scan\" && @.\"Relation Name\" == \"order_review_reports\")')
        when name='report_audit'then jsonb_path_exists(plan,'$.** ? (@.\"Node Type\" == \"Seq Scan\" && @.\"Relation Name\" == \"audit_log\")')
        when name='operation_replay'then jsonb_path_exists(plan,'$.** ? (@.\"Node Type\" == \"Seq Scan\" && @.\"Relation Name\" == \"customer_review_operations\")')
        else jsonb_path_exists(plan,'$.** ? (@.\"Node Type\" == \"Seq Scan\" && @.\"Relation Name\" == \"order_review_meal_reactions\")') end large_seq_scan,
      plan from crv2p7_plans order by name;
    rollback;`;
  const plans=await query(planSql);
  const output=path.join(phaseDir,"development-query-plans.json");fs.writeFileSync(output,JSON.stringify({environment:"development",capturedAt:new Date().toISOString(),volume:{reviews:5000,reactions:5000,reports:1500,operations:5000,audits:5000},plans},null,2),{mode:0o600});
  if(plans.length!==7||plans.some(row=>!row.uses_expected_index||row.large_seq_scan))throw new Error(`Representative query-plan gate failed: ${plans.map(row=>`${row.name}:${row.uses_expected_index}:${row.large_seq_scan}`).join(",")}; sanitized plans saved for review.`);
  console.log(JSON.stringify({action,environment:"development",volume:{reviews:5000,reactions:5000,reports:1500,operations:5000,audits:5000},plans:plans.map(({name,expected_index,uses_expected_index,large_seq_scan})=>({name,expectedIndex:expected_index,usesExpectedIndex:uses_expected_index,largeSeqScan:large_seq_scan})),rolledBack:true,evidencePath:output}));
}
