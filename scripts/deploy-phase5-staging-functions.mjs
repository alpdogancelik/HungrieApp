#!/usr/bin/env node
import{spawnSync}from"node:child_process";import{root,digestFiles,functionFiles}from"./phase5-batch.mjs";const sha=digestFiles(functionFiles);
if(!process.argv.includes("--apply")||!process.argv.includes("--confirm=staging:phase5-functions")||!process.argv.includes(`--expect-sha256=${sha}`))throw new Error(`Reviewed confirmation and checksum required. Current SHA-256: ${sha}`);
const r=spawnSync("npx",["--yes","firebase-tools","deploy","--project","hungrieapp-a2288","--only","functions:dispatchRestaurantWebPushStaging"],{cwd:root,stdio:"inherit"});if(r.status!==0)throw new Error("Phase 5 staging function deployment failed.");
