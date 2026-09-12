"use client";import{signOut}from"firebase/auth";import{auth}from"@/lib/firebase";import{useLocale}from"@/components/AdminProviders";
export default function Page(){const{t}=useLocale();return <main className="center-card"><h1>{t.suspended}</h1><button onClick={()=>void signOut(auth)}>{t.signOut}</button></main>}
