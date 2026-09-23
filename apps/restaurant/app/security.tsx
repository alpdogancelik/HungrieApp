import { sendPasswordResetEmail } from "firebase/auth";
import { Shell } from "../src/Shell";
import { auth } from "../src/firebase";
import { useLocale } from "../src/providers";
import { restaurantSignOut } from "../src/restaurantSignOut";
export default function Page(){const{t}=useLocale();return <Shell><section className="card"><h1>{t.security}</h1><p>{auth.currentUser?.email}</p><button onClick={()=>auth.currentUser?.email&&void sendPasswordResetEmail(auth,auth.currentUser.email)}>{t.resetPassword}</button> <button onClick={()=>void restaurantSignOut()}>{t.logout}</button></section></Shell>}
