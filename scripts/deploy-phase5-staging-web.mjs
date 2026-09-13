#!/usr/bin/env node
import{spawnSync}from"node:child_process";import{root,digestFiles,restaurantFiles}from"./phase5-batch.mjs";const sha=digestFiles(restaurantFiles);
if(!process.argv.includes("--apply")||!process.argv.includes("--confirm=staging:phase5-restaurant-web")||!process.argv.includes(`--expect-sha256=${sha}`))throw new Error(`Reviewed staging web confirmation and checksum required. Current SHA-256: ${sha}`);
const exported=spawnSync("npm",["run","export:web"],{cwd:`${root}/apps/restaurant`,stdio:"inherit"});if(exported.status!==0)throw new Error("Restaurant staging export failed.");
const r=spawnSync("npx",["eas-cli@16.32.0","deploy","--alias","staging","--environment","preview","--export-dir","dist","--non-interactive"],{cwd:`${root}/apps/restaurant`,stdio:"inherit"});if(r.status!==0)throw new Error("Restaurant staging deployment failed.");
