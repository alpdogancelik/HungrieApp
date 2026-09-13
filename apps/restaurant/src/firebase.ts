import {getApp,getApps,initializeApp} from "firebase/app";
import {browserSessionPersistence,getAuth,setPersistence} from "firebase/auth";
const config={apiKey:process.env.EXPO_PUBLIC_FIREBASE_API_KEY,authDomain:process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,projectId:process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,appId:process.env.EXPO_PUBLIC_FIREBASE_APP_ID,messagingSenderId:process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID};
const app=getApps().length?getApp():initializeApp(Object.fromEntries(Object.entries(config).map(([k,v])=>[k,v||`build-${k}`])));
export const auth=getAuth(app);export const firebaseApp=app;
let ready:Promise<void>|undefined;export const ensureSessionPersistence=()=>ready??=setPersistence(auth,browserSessionPersistence);
