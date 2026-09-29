const NON_PROD_FIREBASE="hungrieapp-a2288";
const NON_PROD_SUPABASE=new Set(["rgjlsjwsitbnwoetmidb","rlrfvqskzvpysewdxqcr"]);
const refFromUrl=(value:string)=>{try{return new URL(value).hostname.match(/^([a-z0-9]{20})\.supabase\.co$/)?.[1]||""}catch{return""}};
export const resolveAdminEnvironment=(env:Record<string,string|undefined>)=>{
 const environment=env.NEXT_PUBLIC_HUNGRIE_ENV||"build-proof";
 if(!new Set(["development","staging","production","build-proof"]).has(environment))throw new Error("Invalid Admin environment");
 const firebase={apiKey:env.NEXT_PUBLIC_FIREBASE_API_KEY||"",authDomain:env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN||"",projectId:env.NEXT_PUBLIC_FIREBASE_PROJECT_ID||"",appId:env.NEXT_PUBLIC_FIREBASE_APP_ID||""};
 const supabaseUrl=env.NEXT_PUBLIC_SUPABASE_URL||"",supabaseRef=refFromUrl(supabaseUrl),build=environment==="build-proof";
 if(environment==="production"){
  if(Object.values(firebase).some(v=>!v)||!env.NEXT_PUBLIC_EXPECTED_FIREBASE_PROJECT_ID||firebase.projectId!==env.NEXT_PUBLIC_EXPECTED_FIREBASE_PROJECT_ID||firebase.projectId===NON_PROD_FIREBASE)throw new Error("Production Admin Firebase binding is invalid.");
  if(!env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY||!env.NEXT_PUBLIC_EXPECTED_SUPABASE_PROJECT_REF||supabaseRef!==env.NEXT_PUBLIC_EXPECTED_SUPABASE_PROJECT_REF||NON_PROD_SUPABASE.has(supabaseRef))throw new Error("Production Admin Supabase binding is invalid.");
 }
 const suffix=environment==="production"?"Production":environment==="staging"?"Staging":"Development";
 return{environment,suffix,firebase:Object.fromEntries(Object.entries(firebase).map(([k,v])=>[k,v||(build?`build-${k}`:"")])),supabaseUrl:supabaseUrl||(build?"https://buildproof0000000000.supabase.co":""),supabaseKey:env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY||(build?"build-proof":""),supabaseRef};
};
