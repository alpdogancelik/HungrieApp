import{signOut}from"firebase/auth";import{auth}from"./firebase";import{useLocale}from"./providers";
export function StatePage({kind}:{kind:"pending"|"suspended"}){const{t}=useLocale();return <main className="center card"><h1>Hungrie Restaurant</h1><p>{t[kind]}</p><button className="button" onClick={()=>void signOut(auth)}>{t.logout}</button></main>}
