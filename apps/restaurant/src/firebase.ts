import {getApp,getApps,initializeApp} from "firebase/app";
import {browserSessionPersistence,getAuth,setPersistence} from "firebase/auth";
import {resolveRestaurantEnvironment} from "./environmentConfig";
const config=resolveRestaurantEnvironment(process.env).firebase;
const app=getApps().length?getApp():initializeApp(config);
export const auth=getAuth(app);export const firebaseApp=app;
let ready:Promise<void>|undefined;export const ensureSessionPersistence=()=>ready??=setPersistence(auth,browserSessionPersistence);
