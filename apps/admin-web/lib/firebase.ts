"use client";
import { getApp, getApps, initializeApp } from "firebase/app";
import { initializeAppCheck, ReCaptchaEnterpriseProvider } from "firebase/app-check";
import { browserSessionPersistence, getAuth, setPersistence } from "firebase/auth";
import { getFunctions } from "firebase/functions";
import {resolveAdminEnvironment} from "./environmentConfig";
const runtime=resolveAdminEnvironment(process.env),config=runtime.firebase;
if(typeof window!=="undefined"&&Object.values(config).some(value=>!value))throw new Error("Missing Firebase public configuration");
const app=getApps().length?getApp():initializeApp(config);
if(typeof window!=="undefined"&&runtime.appCheck.siteKey){
  if(runtime.appCheck.debugToken)(globalThis as any).FIREBASE_APPCHECK_DEBUG_TOKEN=runtime.appCheck.debugToken;
  try{initializeAppCheck(app,{provider:new ReCaptchaEnterpriseProvider(runtime.appCheck.siteKey),isTokenAutoRefreshEnabled:true})}
  catch(error){if((error as {code?:string})?.code!=="appCheck/already-initialized")throw error}
}
export const auth=getAuth(app);
export const functions=getFunctions(app);
const suffix=runtime.suffix;
export const adminFunctionNames={recordMfa:"recordAdminMfaEnrollment"+suffix,setAccountStatus:"setAdminAccountStatus"+suffix,recoverMfa:"recoverAdminMfa"+suffix} as const;
let persistenceReady:Promise<void>|undefined;
export const ensureSessionPersistence=()=>persistenceReady??=setPersistence(auth,browserSessionPersistence);
