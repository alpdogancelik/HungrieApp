import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const STATE_PATH = path.join(ROOT_DIR, "secure", "supabase-projects.local.json");
const TOKEN_PATH = path.join(ROOT_DIR, "secure", "supabase-cli-hungrie", "access-token");
const FIREBASE_ISSUER = "https://securetoken.google.com/hungrieapp-a2288";

if (!fs.existsSync(STATE_PATH) || !fs.existsSync(TOKEN_PATH)) {
  throw new Error("Missing ignored Supabase project state or access token.");
}

const state = JSON.parse(fs.readFileSync(STATE_PATH, "utf8"));
const accessToken = fs.readFileSync(TOKEN_PATH, "utf8").trim();
const development = state.projects?.development;
if (!development?.ref) throw new Error("No development project is recorded.");
if (!development?.url || !development?.publishableKey) {
  throw new Error("Development mobile configuration has not been generated.");
}

const request = async (pathname) => {
  const response = await fetch(`https://api.supabase.com${pathname}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) {
    throw new Error(`Supabase Management API request failed (${response.status}).`);
  }
  return response.json();
};

const projectsPayload = await request("/v1/projects");
const projects = Array.isArray(projectsPayload)
  ? projectsPayload
  : Array.isArray(projectsPayload?.projects)
    ? projectsPayload.projects
    : [];
const developmentProject = projects.find((project) => project.id === development.ref);

const integrationsPayload = await request(
  `/v1/projects/${encodeURIComponent(development.ref)}/config/auth/third-party-auth`,
);
const integrations = Array.isArray(integrationsPayload)
  ? integrationsPayload
  : Array.isArray(integrationsPayload?.integrations)
    ? integrationsPayload.integrations
    : [];
const issuerFor = (integration) =>
  integration.oidc_issuer_url ?? integration.issuer ?? integration.config?.oidc_issuer_url;
const firebaseMatches = integrations.filter((integration) => issuerFor(integration) === FIREBASE_ISSUER);

const callProbe = async (token) => {
  const headers = {
    apikey: development.publishableKey,
    "content-type": "application/json",
  };
  if (token) headers.authorization = `Bearer ${token}`;
  const response = await fetch(
    `${development.url}/rest/v1/rpc/migration_auth_probe`,
    { method: "POST", headers, body: "{}" },
  );
  return response.ok;
};
const anonymousAllowed = await callProbe();
const malformedAllowed = await callProbe("not-a-jwt");

const stagingPresent = Boolean(state.projects?.staging?.ref);
const productionPresent = Boolean(state.projects?.production?.ref);
const result = {
  development: {
    present: Boolean(developmentProject),
    region: developmentProject?.region ?? null,
    postgresMajor: String(
      developmentProject?.database?.version ?? developmentProject?.database_version ?? "",
    ).match(/\d+/)?.[0] ?? null,
  },
  environmentsRecorded: {
    development: true,
    staging: stagingPresent,
    production: productionPresent,
  },
  thirdPartyAuth: {
    integrationCount: integrations.length,
    firebaseIssuerMatches: firebaseMatches.length,
  },
  hostedProbe: {
    anonymousDenied: !anonymousAllowed,
    malformedDenied: !malformedAllowed,
  },
};

if (!result.development.present) throw new Error("Recorded development project was not found.");
if (result.development.region !== "eu-central-1") {
  throw new Error("Development project is not in the approved Frankfurt region.");
}
if (result.thirdPartyAuth.firebaseIssuerMatches !== 1) {
  throw new Error("Expected exactly one Hungrie Firebase third-party Auth integration.");
}
if (!result.hostedProbe.anonymousDenied || !result.hostedProbe.malformedDenied) {
  throw new Error("Hosted probe unexpectedly allowed an unauthenticated request.");
}

console.log(JSON.stringify(result, null, 2));
