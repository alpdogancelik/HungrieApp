#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const secure=path.join(root,'secure');
const arg=name=>process.argv.find(value=>value.startsWith(`${name}=`))?.slice(name.length+1);
if(arg('--target')!=='staging')throw new Error('Only staging bootstrap planning is supported.');
const email=String(arg('--email')||'').trim().toLowerCase();
if(!/^[^@\s]+@[^@\s]+$/.test(email))throw new Error('A valid dedicated staging email is required.');
const state=JSON.parse(fs.readFileSync(path.join(secure,'supabase-projects.local.json'),'utf8'));const project=state.projects?.staging;if(project?.name!=='HungrieApp Staging'||!project.ref||project.ref===state.projects?.development?.ref)throw new Error('Staging project identity is invalid.');
const firebaseProject='hungrieapp-a2288';
const lookupWithCliSession=async()=>{
  if(!process.argv.includes('--firebase-cli-session'))throw new Error('Use --firebase-cli-session with the authenticated operator session.');
  const cliConfigPath=path.join(os.homedir(),'.config','configstore','firebase-tools.json');
  if(!fs.existsSync(cliConfigPath))throw new Error('Firebase CLI operator session is unavailable.');
  const cliConfig=JSON.parse(fs.readFileSync(cliConfigPath,'utf8'));
  const accessToken=cliConfig.tokens?.access_token;
  if(!accessToken)throw new Error('Firebase CLI operator access token is unavailable.');
  const response=await fetch(`https://identitytoolkit.googleapis.com/v1/projects/${firebaseProject}/accounts:lookup`,{method:'POST',headers:{authorization:`Bearer ${accessToken}`,'content-type':'application/json','x-goog-user-project':firebaseProject},body:JSON.stringify({email:[email]})});
  if(!response.ok)throw new Error(`Firebase identity lookup failed (${response.status}).`);
  const matches=(await response.json()).users?.filter(candidate=>candidate.email?.trim().toLowerCase()===email)||[];
  if(matches.length!==1)throw new Error('Bootstrap identity lookup must return exactly one email match.');
  return {uid:matches[0].localId,emailVerified:matches[0].emailVerified===true,disabled:matches[0].disabled===true};
};
const user=await lookupWithCliSession();if(!user.emailVerified||user.disabled)throw new Error('Bootstrap identity must be enabled and email-verified.');
const token=fs.readFileSync(path.join(secure,'supabase-cli-hungrie/access-token'),'utf8').trim();const query=async sql=>{const response=await fetch(`https://api.supabase.com/v1/projects/${project.ref}/database/query`,{method:'POST',headers:{authorization:`Bearer ${token}`,'content-type':'application/json'},body:JSON.stringify({query:sql})});if(!response.ok)throw new Error(`Staging bootstrap query failed (${response.status}).`);return response.json()};
const b64=value=>Buffer.from(value).toString('base64');const [check]=await query(`select (select count(*) from private.account_access where account_type='admin')::int admins,(select count(*) from public.profiles where firebase_uid=convert_from(decode('${b64(user.uid)}','base64'),'utf8') or lower(btrim(email))=convert_from(decode('${b64(email)}','base64'),'utf8'))::int conflicts`);if(check?.admins!==0||check?.conflicts!==0)throw new Error('Bootstrap requires zero existing Admins and no identity conflict.');
const operationId=arg('--operation-id');if(!/^[0-9a-f-]{36}$/i.test(operationId||''))throw new Error('A reviewed operation UUID is required.');const planDigest=crypto.createHash('sha256').update(`${project.ref}:${user.uid}:${email}:${operationId}:super_admin`).digest('hex');
if(!process.argv.includes('--apply')){console.log(JSON.stringify({target:'staging',mode:'dry-run',identityHash:crypto.createHash('sha256').update(user.uid).digest('hex'),emailHash:crypto.createHash('sha256').update(email).digest('hex'),operationId,planDigest}));process.exit(0)}
if(arg('--confirm')!=='staging:phase4-first-super-admin'||arg('--expect-plan-sha256')!==planDigest)throw new Error('Apply requires exact staging confirmation and reviewed plan checksum.');const manifestPath=path.resolve(arg('--backup-manifest')||'');if(!manifestPath.startsWith(secure+path.sep)||!fs.existsSync(manifestPath))throw new Error('Fresh restricted staging backup manifest required.');const manifest=JSON.parse(fs.readFileSync(manifestPath,'utf8'));if(manifest.environment!=='staging'||manifest.projectRef!==project.ref||Date.now()-Date.parse(manifest.recordedAt)>24*60*60*1000)throw new Error('Staging backup is stale or mismatched.');
const sql=`begin; do $$ declare v_uid text:=convert_from(decode('${b64(user.uid)}','base64'),'utf8'); v_email text:=convert_from(decode('${b64(email)}','base64'),'utf8'); begin if exists(select 1 from private.account_access where account_type='admin') or exists(select 1 from public.profiles where firebase_uid=v_uid or lower(btrim(email))=v_email) then raise exception 'Bootstrap precondition changed'; end if; insert into public.profiles(id,firebase_uid,name,email) values(v_uid,v_uid,'Staging Super Admin',v_email); insert into private.account_access(profile_id,account_type,status,onboarding_step,admin_role) values(v_uid,'admin','pending','admin_mfa_enrollment_required','super_admin'); insert into private.account_email_reservations(normalized_email,account_type,firebase_uid,profile_id) values(v_email,'admin',v_uid,v_uid); perform private.write_audit(null,'account.bootstrap_super_admin','profile',v_uid,jsonb_build_object('operation_id','${operationId}'::uuid)); end $$; commit;`;
await query(sql);console.log(JSON.stringify({target:'staging',mode:'applied',operationId,planDigest}));
