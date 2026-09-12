"use client";import{useLocale}from"@/components/AdminProviders";import{auth}from"@/lib/firebase";
export default function Page(){const{t}=useLocale();return <section><header className="page-header"><h2>{t.security}</h2></header><div className="panel"><p>{auth.currentUser?.email}</p><p>Firebase TOTP · Supabase canonical authorization</p></div></section>}
