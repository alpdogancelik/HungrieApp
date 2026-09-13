import { mkdir, writeFile } from "node:fs/promises";
const keys={apiKey:"EXPO_PUBLIC_FIREBASE_API_KEY",authDomain:"EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN",projectId:"EXPO_PUBLIC_FIREBASE_PROJECT_ID",appId:"EXPO_PUBLIC_FIREBASE_APP_ID",messagingSenderId:"EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID"};
const config=Object.fromEntries(Object.entries(keys).map(([key,name])=>[key,process.env[name]||`build-${key}`]));
await mkdir(new URL("../public/",import.meta.url),{recursive:true});
await writeFile(new URL("../public/firebase-config.js",import.meta.url),`self.HUNGRIE_FIREBASE_CONFIG=${JSON.stringify(config)};\n`);
