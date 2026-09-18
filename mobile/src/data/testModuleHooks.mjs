import { existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, resolve as resolvePath } from "node:path";

const mobileRoot = resolvePath(dirname(fileURLToPath(import.meta.url)), "../..");

export async function resolve(specifier, context, nextResolve) {
    const coordinatorTestStub = (source) => ({
        url: `data:text/javascript,${encodeURIComponent(source)}`,
        shortCircuit: true,
    });
    if (specifier === "react-native") return coordinatorTestStub("export const AppState={addEventListener:()=>({remove(){}})}; export const Platform={OS:'ios'};");
    if (specifier === "expo-crypto") return coordinatorTestStub("let sequence=0; export const CryptoDigestAlgorithm={SHA256:'SHA-256'}; export const randomUUID=()=>`11111111-1111-4111-8111-${String(++sequence).padStart(12,'0')}`; export const digestStringAsync=async(_a,v)=>{let h=2166136261;for(const c of v)h=Math.imul(h^c.charCodeAt(0),16777619);return (h>>>0).toString(16).padStart(8,'0').repeat(8)};");
    if (specifier === "expo-network") return coordinatorTestStub("export const addNetworkStateListener=()=>({remove(){}});");
    if (specifier === "firebase/app") return coordinatorTestStub("const app={name:'fixture'}; export const getApps=()=>[app]; export const getApp=()=>app; export const initializeApp=()=>app;");
    if (specifier === "firebase/auth") return coordinatorTestStub("export const browserSessionPersistence={}; export const getAuth=()=>({currentUser:null}); export const setPersistence=async()=>{}; export const onIdTokenChanged=()=>()=>{}; export const onAuthStateChanged=()=>()=>{}; export const signInWithEmailAndPassword=async()=>({user:{uid:'fixture',email:'fixture@example.invalid'}});");
    if (specifier === "firebase/functions") return coordinatorTestStub("export const getFunctions=()=>({});");
    if (specifier === "@/lib/firebase") return coordinatorTestStub("export const auth={currentUser:{uid:'fixture',getIdToken:async()=> 'fixture-token'}};");
    if (specifier === "@/lib/supabase") return coordinatorTestStub("export const getFirebaseAccessToken=async()=> 'fixture-token'; export const createSupabaseClientForFirebaseToken=()=>null; export const supabaseEnabled=true; export const supabase=null;");
    if (specifier === "@/src/features/notifications/NotificationManager") return coordinatorTestStub("export const NotificationManager={requestPermissions:async()=>true,getExpoPushToken:async()=>({token:'ExpoPushToken[fixture_mobile]',platform:'ios',provider:'expo'})}; export default NotificationManager;");
    if (specifier === "@/src/lib/storage") return coordinatorTestStub("const values=new Map(); export const storage={getItem:async(k)=>values.get(k)??null,setItem:async(k,v)=>void values.set(k,v),removeItem:async(k)=>void values.delete(k)};");
    if (specifier === "react-native-url-polyfill/auto") {
        return nextResolve("react-native-url-polyfill/auto.js", context);
    }
    if (specifier.startsWith("@/")) {
        const base = resolvePath(mobileRoot, specifier.slice(2));
        const target = existsSync(base) ? base : existsSync(`${base}.ts`) ? `${base}.ts` : `${base}.tsx`;
        return { url: pathToFileURL(target).href, shortCircuit: true };
    }

    if (specifier.startsWith(".") && context.parentURL) {
        const base = resolvePath(dirname(fileURLToPath(context.parentURL)), specifier);
        if (!existsSync(base) && existsSync(`${base}.js`)) {
            return { url: pathToFileURL(`${base}.js`).href, shortCircuit: true };
        }
        if (!existsSync(base) && existsSync(`${base}.ts`)) {
            return { url: pathToFileURL(`${base}.ts`).href, shortCircuit: true };
        }
    }
    return nextResolve(specifier, context);
}
