import { mkdir, writeFile } from "node:fs/promises";
import { assertExactProductionIdentities, supabaseProjectRefFromUrl } from "../../../scripts/restaurant-production-environment-contract.mjs";
const keys={apiKey:"EXPO_PUBLIC_FIREBASE_API_KEY",authDomain:"EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN",projectId:"EXPO_PUBLIC_FIREBASE_PROJECT_ID",appId:"EXPO_PUBLIC_FIREBASE_APP_ID",messagingSenderId:"EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID"};
const environment=process.env.EXPO_PUBLIC_HUNGRIE_ENV||"build-proof";
if(environment==="production")assertExactProductionIdentities({environment,firebaseProjectId:process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,expectedFirebaseProjectId:process.env.EXPO_PUBLIC_EXPECTED_FIREBASE_PROJECT_ID,supabaseProjectRef:supabaseProjectRefFromUrl(process.env.EXPO_PUBLIC_SUPABASE_URL),expectedSupabaseProjectRef:process.env.EXPO_PUBLIC_EXPECTED_SUPABASE_PROJECT_REF,supabaseUrl:process.env.EXPO_PUBLIC_SUPABASE_URL});
const config=Object.fromEntries(Object.entries(keys).map(([key,name])=>[key,process.env[name]||(environment==="build-proof"?`build-${key}`:"")]));
if(Object.values(config).some(value=>!value))throw new Error(`Missing ${environment} Firebase public configuration.`);
await mkdir(new URL("../public/",import.meta.url),{recursive:true});
await writeFile(new URL("../public/firebase-config.js",import.meta.url),`self.HUNGRIE_FIREBASE_CONFIG=${JSON.stringify(config)};\n`);
