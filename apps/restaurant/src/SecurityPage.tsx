import { useState } from "react";
import { KeyRound, LogOut, Mail, ShieldCheck } from "lucide-react";
import { sendPasswordResetEmail } from "firebase/auth";
import { Shell } from "./Shell";
import { auth } from "./firebase";
import { useLocale } from "./providers";
import { useRestaurantAccessContext } from "./RestaurantAccessContext";
import { restaurantSignOut } from "./restaurantSignOut";
import { Button } from "./components/Button";
import { Dialog } from "./components/Dialog";
import { PageHeader } from "./components/PageHeader";

const copy={
  en:{title:"Security",intro:"Manage password recovery and securely end this browser session.",account:"Account",email:"Email",role:"Restaurant role",owner:"Owner",manager:"Manager",password:"Password recovery",passwordHelp:"Firebase sends reset instructions when the signed-in account is eligible.",send:"Send reset email",resetTitle:"Send password reset email?",resetDetail:"Instructions will be requested for the signed-in account. The result does not reveal account eligibility.",sent:"If the account is eligible, password reset instructions have been sent.",failed:"The request could not be completed. Check your connection and try again.",signout:"Sign out",signoutHelp:"Notification cleanup is attempted before Firebase signs out this browser.",signoutTitle:"Sign out of Hungrie Restaurant?",signoutDetail:"You will need to sign in again to manage this Restaurant.",cancel:"Cancel",sending:"Sending…",signingOut:"Signing out…",safe:"Authentication and Restaurant authorization remain server verified."},
  tr:{title:"Güvenlik",intro:"Şifre kurtarmayı yönetin ve bu tarayıcı oturumunu güvenle sonlandırın.",account:"Hesap",email:"E-posta",role:"Restoran rolü",owner:"Sahip",manager:"Yönetici",password:"Şifre kurtarma",passwordHelp:"Oturum açmış hesap uygunsa Firebase yenileme talimatlarını gönderir.",send:"Yenileme e-postası gönder",resetTitle:"Şifre yenileme e-postası gönderilsin mi?",resetDetail:"Oturum açmış hesap için talimat istenir. Sonuç hesap uygunluğunu açıklamaz.",sent:"Hesap uygunsa şifre yenileme talimatları gönderildi.",failed:"İstek tamamlanamadı. Bağlantınızı kontrol edip tekrar deneyin.",signout:"Çıkış yap",signoutHelp:"Firebase bu tarayıcı oturumunu kapatmadan önce bildirim temizliği denenir.",signoutTitle:"Hungrie Restaurant oturumu kapatılsın mı?",signoutDetail:"Bu Restoranı yönetmek için yeniden giriş yapmanız gerekir.",cancel:"İptal",sending:"Gönderiliyor…",signingOut:"Çıkış yapılıyor…",safe:"Kimlik doğrulama ve Restoran yetkisi sunucu tarafından doğrulanmaya devam eder."}
} as const;

export function SecurityPage(){
  const{locale}=useLocale(),c=copy[locale],access=useRestaurantAccessContext(),email=auth.currentUser?.email||"";
  const[dialog,setDialog]=useState<"reset"|"signout"|null>(null),[busy,setBusy]=useState(false),[message,setMessage]=useState<"sent"|"failed"|null>(null);
  const close=()=>{if(!busy)setDialog(null)};
  const reset=async()=>{if(busy||!email)return;setBusy(true);setMessage(null);try{await sendPasswordResetEmail(auth,email);setMessage("sent");setDialog(null);}catch{setMessage("failed");setDialog(null);}finally{setBusy(false)}};
  const signout=async()=>{if(busy)return;setBusy(true);try{await restaurantSignOut();}catch{setMessage("failed");setBusy(false);setDialog(null)}};
  return <Shell><div className="security-page"><PageHeader title={c.title} subtitle={c.intro}/>
    {message&&<p className={`ui-notice ${message==="failed"?"ui-notice--danger":"ui-notice--success"}`} role="status">{c[message]}</p>}
    <section className="ui-card security-account"><span className="security-icon"><ShieldCheck aria-hidden="true"/></span><div><h2>{c.account}</h2><dl><div><dt>{c.email}</dt><dd>{email}</dd></div><div><dt>{c.role}</dt><dd>{access?.restaurantRole==="owner"?c.owner:c.manager}</dd></div></dl><p>{c.safe}</p></div></section>
    <div className="security-grid"><section className="ui-card security-action"><span className="security-icon"><KeyRound aria-hidden="true"/></span><h2>{c.password}</h2><p>{c.passwordHelp}</p><Button icon={<Mail size={18} aria-hidden="true"/>} onClick={()=>{setMessage(null);setDialog("reset")}}>{c.send}</Button></section><section className="ui-card security-action"><span className="security-icon security-icon--danger"><LogOut aria-hidden="true"/></span><h2>{c.signout}</h2><p>{c.signoutHelp}</p><Button variant="danger" onClick={()=>{setMessage(null);setDialog("signout")}}>{c.signout}</Button></section></div>
    <Dialog open={dialog==="reset"} title={c.resetTitle} onClose={close} actions={<><Button variant="secondary" disabled={busy} onClick={close}>{c.cancel}</Button><Button disabled={busy} onClick={()=>void reset()}>{busy?c.sending:c.send}</Button></>}><p>{c.resetDetail}</p></Dialog>
    <Dialog open={dialog==="signout"} title={c.signoutTitle} onClose={close} actions={<><Button variant="secondary" disabled={busy} onClick={close}>{c.cancel}</Button><Button variant="danger" disabled={busy} onClick={()=>void signout()}>{busy?c.signingOut:c.signout}</Button></>}><p>{c.signoutDetail}</p></Dialog>
  </div></Shell>;
}
