import { useCallback, useEffect, useState } from "react";
import Constants from "expo-constants";
import { Linking, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { supabaseCatalog } from "@/lib/supabase";
import { customerDataConfigurationError } from "@/src/data/backendFlags";
import { withRequestDeadline } from "@/src/lib/requestDeadline";

type State={kind:"checking"|"ready"|"error"}|{kind:"update";url:string};
const API_CONTRACT=2;
const storeUrl=Platform.OS==="ios"?"https://apps.apple.com/app/id6759683384":"https://play.google.com/store/apps/details?id=com.hungrie.app";
const CustomerReleaseGate=({onReadyChange}:{onReadyChange?:(ready:boolean)=>void})=>{
 const {i18n}=useTranslation();const tr=i18n.language?.startsWith("tr");const [state,setState]=useState<State>({kind:"checking"});
 const check=useCallback(async()=>{if(Platform.OS==="web"){setState(customerDataConfigurationError?{kind:"error"}:{kind:"ready"});return;}setState({kind:"checking"});
  const catalog=supabaseCatalog;
  if(customerDataConfigurationError||!catalog){setState({kind:"error"});return;}
  const build=Number(Platform.OS==="ios"?Constants.expoConfig?.ios?.buildNumber:Constants.expoConfig?.android?.versionCode);
  if(!Number.isSafeInteger(build)||build<1){setState({kind:"error"});return;}
  try{const {data,error}=await withRequestDeadline((signal)=>catalog.rpc("get_client_release_policy_v1",{p_application:"customer",p_platform:Platform.OS,p_build_number:build,p_api_contract:API_CONTRACT}).abortSignal(signal));if(error)throw error;
   const policy:any=data;setState(policy?.update_required?{kind:"update",url:storeUrl}:{kind:"ready"});}catch{setState({kind:"error"});}},[]);
 useEffect(()=>{void check();},[check]);
 useEffect(()=>{onReadyChange?.(state.kind==="ready");},[onReadyChange,state.kind]);
 if(state.kind==="ready")return null;
 const update=state.kind==="update";return <SafeAreaView style={styles.overlay}><View style={styles.card} accessibilityRole="alert"><Text style={styles.title}>{update?(tr?"Güncelleme gerekli":"Update required"):state.kind==="checking"?(tr?"Sürüm kontrol ediliyor…":"Checking app version…"):(tr?"Hungrie başlatılamadı":"Hungrie could not start")}</Text><Text style={styles.body}>{update?(tr?"Devam etmek için Hungrie'nin en son sürümünü yükleyin.":"Install the latest Hungrie version to continue."):(tr?"Müşteri hizmetleri doğrulanamadı. Bağlantınızı ve uygulama yapılandırmasını kontrol edin.":"Customer services could not be verified. Check your connection and app configuration.")}</Text>{update?<Pressable style={styles.button} onPress={()=>void Linking.openURL(state.url)}><Text style={styles.buttonText}>{tr?"Güncelle":"Update"}</Text></Pressable>:state.kind==="error"?<Pressable style={styles.button} onPress={()=>void check()}><Text style={styles.buttonText}>{tr?"Tekrar dene":"Try again"}</Text></Pressable>:null}</View></SafeAreaView>;
};
const styles=StyleSheet.create({overlay:{...StyleSheet.absoluteFillObject,zIndex:20010,elevation:10,alignItems:"center",justifyContent:"center",padding:24,backgroundColor:"rgba(11,18,32,0.78)"},card:{width:"100%",maxWidth:420,borderRadius:26,padding:26,backgroundColor:"#fff",alignItems:"center"},title:{fontFamily:"ChairoSans",fontSize:22,color:"#111827",textAlign:"center"},body:{fontFamily:"ChairoSans",fontSize:15,lineHeight:22,color:"#667085",textAlign:"center",marginTop:10},button:{marginTop:20,minHeight:46,borderRadius:14,backgroundColor:"#FE8C00",paddingHorizontal:24,alignItems:"center",justifyContent:"center"},buttonText:{fontFamily:"ChairoSans",fontSize:15,color:"#fff"}});
export default CustomerReleaseGate;
