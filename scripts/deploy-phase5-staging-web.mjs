#!/usr/bin/env node
import fs from"node:fs";import path from"node:path";import{spawnSync}from"node:child_process";import{root,digestFiles,restaurantFiles}from"./phase5-batch.mjs";const sha=digestFiles(restaurantFiles);
if(!process.argv.includes("--apply")||!process.argv.includes("--confirm=staging:phase5-restaurant-web")||!process.argv.includes(`--expect-sha256=${sha}`))throw new Error(`Reviewed staging web confirmation and checksum required. Current SHA-256: ${sha}`);
const appRoot=`${root}/apps/restaurant`;
const exported=spawnSync("npx",["eas-cli@16.32.0","env:exec","preview","npm run prepare:web && npx expo export --platform web --clear","--non-interactive"],{cwd:appRoot,stdio:"inherit"});if(exported.status!==0)throw new Error("Restaurant staging export failed.");
const checkedCsp=spawnSync(process.execPath,[path.join(root,"scripts/check-restaurant-export-csp.mjs")],{cwd:root,stdio:"inherit"});if(checkedCsp.status!==0)throw new Error("Restaurant export CSP check failed.");
const inspected=spawnSync("npx",["eas-cli@16.32.0","env:exec","preview",`node -e 'console.log(JSON.stringify({projectId:process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,vapidKey:process.env.EXPO_PUBLIC_FIREBASE_VAPID_KEY,supabaseUrl:process.env.EXPO_PUBLIC_SUPABASE_URL}))'`,"--non-interactive"],{cwd:appRoot,encoding:"utf8"});if(inspected.status!==0)throw new Error("Could not inspect the EAS Preview environment.");
const configuration=JSON.parse(inspected.stdout.trim().split("\n").findLast(line=>line.startsWith("{"))||"{}");
for(const name of["projectId","vapidKey","supabaseUrl"])if(!configuration[name])throw new Error(`EAS Preview is missing ${name}.`);
const files=[];const walk=directory=>{for(const entry of fs.readdirSync(directory,{withFileTypes:true})){const file=path.join(directory,entry.name);entry.isDirectory()?walk(file):files.push(file)}};walk(path.join(appRoot,"dist"));
const output=files.filter(file=>/\.(?:js|html)$/.test(file)).map(file=>fs.readFileSync(file,"utf8")).join("\n");
for(const[name,value]of Object.entries(configuration))if(!output.includes(value))throw new Error(`Restaurant export is missing EAS Preview ${name}.`);
for(const placeholder of["build-apiKey","build-projectId"])if(output.includes(placeholder))throw new Error(`Restaurant export contains placeholder configuration: ${placeholder}`);
const r=spawnSync("npx",["eas-cli@16.32.0","deploy","--alias","staging","--environment","preview","--export-dir","dist","--non-interactive"],{cwd:`${root}/apps/restaurant`,stdio:"inherit"});if(r.status!==0)throw new Error("Restaurant staging deployment failed.");
