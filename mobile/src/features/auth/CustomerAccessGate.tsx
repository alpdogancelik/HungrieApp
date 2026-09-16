import { useCallback, useEffect, useState } from "react";
import { AppState, Linking, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { signOut as firebaseSignOut } from "firebase/auth";
import { useTranslation } from "react-i18next";
import { auth } from "@/lib/firebase";
import useAuthStore from "@/store/auth.store";
import { getCurrentUser } from "@/src/data/profileRepository";
import { resolveCustomerAccess, type CustomerAccessOutcome } from "./customerAccess";

const CustomerAccessGate = ({ onReadyChange }: { onReadyChange?: (ready: boolean, identityKey: string) => void }) => {
    const { i18n } = useTranslation();
    const { isAuthenticated, isLoading, resetAuthState, setUser } = useAuthStore();
    const [outcome, setOutcome] = useState<CustomerAccessOutcome | null>(null);
    const [checking, setChecking] = useState(false);
    const [signingOut, setSigningOut] = useState(false);
    const tr = i18n.language?.startsWith("tr");
    const check = useCallback(async () => {
        if (!isAuthenticated) return;
        setChecking(true);
        try {
            const next = await resolveCustomerAccess();
            if (next.state === "active") {
                const current = useAuthStore.getState().user;
                const firebaseUid = auth?.currentUser?.uid;
                if (current) {
                    setUser({ ...current, firebaseUid, id: next.profileId, $id: next.profileId, accountId: next.profileId });
                }
                // Profile details improve display, but must never hold startup or
                // Customer authorization hostage to an unrelated slow read.
                void getCurrentUser().then((profile) => {
                    if (!profile || !firebaseUid || auth?.currentUser?.uid !== firebaseUid || !useAuthStore.getState().isAuthenticated) return;
                    setUser({ id: profile.accountId, $id: profile.accountId, accountId: profile.accountId, firebaseUid,
                        name: profile.name, email: profile.email, avatar: profile.avatar,
                        whatsappNumber: profile.whatsappNumber });
                }).catch(() => null);
            }
            if (next.state === "wrong_portal" || next.state === "revoked") {
                if (auth) await firebaseSignOut(auth).catch(() => null);
                resetAuthState();
            }
            setOutcome(next);
        } catch {
            setOutcome({ state: "unavailable", referenceId: "customer-access-unexpected" });
        } finally {
            setChecking(false);
        }
    }, [isAuthenticated, resetAuthState, setUser]);
    useEffect(() => { if (!isLoading && isAuthenticated) void check(); }, [check, isAuthenticated, isLoading]);
    useEffect(() => {
        if (isLoading || !isAuthenticated) return;
        const interval = setInterval(() => void check(), 15000);
        const subscription = AppState.addEventListener("change", (state) => {
            if (state === "active") void check();
        });
        return () => {
            clearInterval(interval);
            subscription.remove();
        };
    }, [check, isAuthenticated, isLoading]);
    useEffect(() => {
        if (!isAuthenticated && outcome && outcome.state !== "wrong_portal" && outcome.state !== "revoked") setOutcome(null);
    }, [isAuthenticated, outcome]);
    const ready = !isLoading && ((!isAuthenticated && !outcome) || (isAuthenticated && outcome?.state === "active"));
    const identityKey = isAuthenticated ? String(auth?.currentUser?.uid || "authenticated") : "guest";
    useEffect(() => { onReadyChange?.(ready, identityKey); }, [identityKey, onReadyChange, ready]);
    const blocked = isAuthenticated && outcome?.state !== "active" || outcome?.state === "wrong_portal" || outcome?.state === "revoked";
    if (!blocked) return null;
    const wrong = outcome?.state === "wrong_portal" ? outcome.accountType : null;
    const title = checking || !outcome ? (tr ? "Müşteri erişimi kontrol ediliyor…" : "Checking Customer access…")
        : wrong ? (tr ? "Farklı bir hesap türü" : "Different account type")
        : outcome.state === "suspended" ? (tr ? "Hesap askıya alındı" : "Account suspended")
        : outcome.state === "revoked" ? (tr ? "Erişim iptal edildi" : "Access revoked")
        : outcome.state === "session_error" ? (tr ? "Oturum sona erdi" : "Session expired")
        : outcome.state === "auth_preparing" ? (tr ? "Hesap hazırlanıyor" : "Preparing your account")
        : outcome.state === "configuration_error" ? (tr ? "Hesap yapılandırma hatası" : "Account configuration error")
        : (tr ? "Müşteri hizmetleri kullanılamıyor" : "Customer services unavailable");
    const body = checking || !outcome ? (tr ? "Güvenli oturumunuz hazırlanıyor." : "Preparing your secure session.")
        : wrong ? (tr ? "Bu hesap Müşteri uygulamasında kullanılamaz." : "This account cannot be used in the Customer app.")
        : outcome?.state === "suspended" ? (tr ? "Yardım için Hungrie destek ile iletişime geçin." : "Contact Hungrie support for help.")
        : outcome?.state === "session_error" ? (tr ? "Devam etmek için yeniden giriş yapın." : "Sign in again to continue.")
        : outcome?.state === "auth_preparing" ? (tr ? "Güvenli oturumunuz hazırlanıyor. Birkaç saniye sonra tekrar deneyin." : "Your secure session is being prepared. Try again in a few seconds.")
        : outcome?.state === "configuration_error" ? `${tr ? "Destek referansı" : "Support reference"}: ${outcome.referenceId || "unavailable"}`
        : `${tr ? "Bağlantınızı kontrol edip tekrar deneyin." : "Check your connection and try again."}${outcome?.state === "unavailable" && outcome.referenceId ? `\n${tr ? "Destek referansı" : "Support reference"}: ${outcome.referenceId}` : ""}`;
    const portalUrl = wrong === "restaurant" ? "https://restaurant.hungrie.app" : wrong === "admin" ? "https://admin.hungrie.app" : null;
    const canRetry = outcome?.state === "unavailable" || outcome?.state === "configuration_error" || outcome?.state === "auth_preparing";
    const suspended = outcome?.state === "suspended";
    const canRecoverBySigningOut = isAuthenticated && (canRetry || suspended || outcome?.state === "session_error");
    const recoverBySigningOut = async () => {
        setSigningOut(true);
        if (auth) await firebaseSignOut(auth).catch(() => null);
        resetAuthState();
        setOutcome(null);
        setSigningOut(false);
    };
    return <SafeAreaView style={styles.overlay}><View style={styles.card} accessibilityRole="alert"><Text style={styles.title}>{title}</Text><Text style={styles.body}>{body}</Text>{portalUrl ? <Pressable style={styles.button} onPress={() => void Linking.openURL(portalUrl)}><Text style={styles.buttonText}>{tr ? "Doğru portalı aç" : "Open correct portal"}</Text></Pressable> : suspended ? <Pressable style={styles.button} onPress={() => void Linking.openURL("https://hungrie.app/support")}><Text style={styles.buttonText}>{tr ? "Destek" : "Support"}</Text></Pressable> : canRetry ? <Pressable disabled={checking || signingOut} style={styles.button} onPress={() => void check()}><Text style={styles.buttonText}>{checking ? (tr ? "Kontrol ediliyor…" : "Checking…") : (tr ? "Tekrar dene" : "Try again")}</Text></Pressable> : null}{canRecoverBySigningOut ? <Pressable disabled={signingOut} style={styles.secondaryButton} onPress={() => void recoverBySigningOut()}><Text style={styles.secondaryButtonText}>{signingOut ? (tr ? "Çıkış yapılıyor…" : "Signing out…") : suspended ? (tr ? "Çıkış yap" : "Sign out") : (tr ? "Başka hesapla giriş yap" : "Sign in with another account")}</Text></Pressable> : !isAuthenticated && (wrong || outcome?.state === "revoked") ? <Pressable style={styles.secondaryButton} onPress={() => setOutcome(null)}><Text style={styles.secondaryButtonText}>{tr ? "Başka hesapla giriş yap" : "Sign in with another account"}</Text></Pressable> : null}</View></SafeAreaView>;
};

const styles=StyleSheet.create({overlay:{...StyleSheet.absoluteFillObject,zIndex:20000,elevation:5,alignItems:"center",justifyContent:"center",padding:24,backgroundColor:"rgba(11,18,32,0.76)"},card:{width:"100%",maxWidth:420,borderRadius:26,padding:26,backgroundColor:"#fff",alignItems:"center"},title:{fontFamily:"ChairoSans",fontSize:22,color:"#111827",textAlign:"center"},body:{fontFamily:"ChairoSans",fontSize:15,lineHeight:22,color:"#667085",textAlign:"center",marginTop:10},button:{marginTop:20,minHeight:46,borderRadius:14,backgroundColor:"#FE8C00",paddingHorizontal:22,alignItems:"center",justifyContent:"center"},buttonText:{fontFamily:"ChairoSans",fontSize:15,color:"#fff"},secondaryButton:{marginTop:12,minHeight:42,paddingHorizontal:18,alignItems:"center",justifyContent:"center"},secondaryButtonText:{fontFamily:"ChairoSans",fontSize:14,color:"#475467",textDecorationLine:"underline"}});
export default CustomerAccessGate;
