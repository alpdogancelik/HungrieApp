"use client";
import {createContext,useContext,useEffect,useMemo,useState} from "react";
import type {Locale} from "@/lib/contracts";import {translations} from "@/lib/i18n";
type State={locale:Locale;setLocale:(v:Locale)=>void;t:ReturnType<typeof translations>};const Context=createContext<State|null>(null);
export function AdminProviders({children}:{children:React.ReactNode}){const[locale,setValue]=useState<Locale>("en");useEffect(()=>{const saved=localStorage.getItem("hungrie-admin-locale");setValue(saved==="tr"||saved==="en"?saved:navigator.language.startsWith("tr")?"tr":"en")},[]);const setLocale=(v:Locale)=>{localStorage.setItem("hungrie-admin-locale",v);setValue(v)};const value=useMemo(()=>({locale,setLocale,t:translations(locale)}),[locale]);return <Context.Provider value={value}>{children}</Context.Provider>}
export const useLocale=()=>{const v=useContext(Context);if(!v)throw new Error("Locale provider missing");return v};
