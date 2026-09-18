#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { loadRun } from "./phase7-runner-lib.mjs";
import { executeOrderFlow } from "./phase7-order-flow.mjs";
import { loadOperatorContext } from "./phase7-staging-client.mjs";

const at = name => { const index = process.argv.indexOf(name); return index < 0 ? null : process.argv[index + 1]; };
const runDirectory = path.resolve(at("--run-directory") || ""), index = Number(at("--journey"));
if (!runDirectory.includes(`${path.sep}secure${path.sep}phase7${path.sep}`) || !Number.isInteger(index) || index < 0 || index >= 40) throw new Error("Reviewed run directory and journey index are required.");
const context = loadOperatorContext(), fixtures = JSON.parse(fs.readFileSync(path.resolve("secure/phase7/fixtures.json"), "utf8"));
const { state } = loadRun(runDirectory), journey = state.journeys[index]; if (!journey) throw new Error("Journey is absent from immutable run state.");
const outcome = await executeOrderFlow({ context, fixtures, operationIds: journey.operationIds, stateFile: path.join(runDirectory, `journey-${index}.json`), label: `journey-${index}` });
console.log(JSON.stringify({ journey: index, ...outcome }));
