import {getApp,getApps,initializeApp} from "firebase/app";
import {getToken,initializeAppCheck,ReCaptchaEnterpriseProvider,type AppCheck}from"firebase/app-check";
import {browserSessionPersistence,getAuth,setPersistence} from "firebase/auth";
import {resolveRestaurantEnvironment} from "./environmentConfig";
const runtime=resolveRestaurantEnvironment(process.env),config=runtime.firebase;
const app=getApps().length?getApp():initializeApp(config);
let appCheck:AppCheck|undefined;
if(typeof window!=="undefined"&&runtime.appCheck.siteKey){
  if(runtime.appCheck.debugToken)(globalThis as any).FIREBASE_APPCHECK_DEBUG_TOKEN=runtime.appCheck.debugToken;
  try{appCheck=initializeAppCheck(app,{provider:new ReCaptchaEnterpriseProvider(runtime.appCheck.siteKey),isTokenAutoRefreshEnabled:true})}
  catch(error){if((error as {code?:string})?.code!=="appCheck/already-initialized")throw error}
}
export const auth=getAuth(app);export const firebaseApp=app;
export const restaurantFunctionNames={uploadMedia:"uploadRestaurantMedia"+runtime.suffix}as const;
export async function callRestaurantFunction<T>(name:string,data:Record<string,unknown>):Promise<T>{
  const user=auth.currentUser;if(!user)throw new Error("UNAUTHENTICATED");
  const headers:Record<string,string>={"Content-Type":"application/json",Authorization:`Bearer ${await user.getIdToken()}`};
  if(appCheck)headers["X-Firebase-AppCheck"]=(await getToken(appCheck)).token;
  const response=await fetch(`https://us-central1-${config.projectId}.cloudfunctions.net/${name}`,{method:"POST",headers,body:JSON.stringify({data})});
  const payload=await response.json().catch(()=>null);
  if(!response.ok||payload?.error){const error=new Error(String(payload?.error?.message||"FUNCTION_CALL_FAILED"));(error as any).details=payload?.error?.details;throw error}
  return (payload?.result??payload?.data)as T;
}
let ready:Promise<void>|undefined;export const ensureSessionPersistence=()=>ready??=setPersistence(auth,browserSessionPersistence);
