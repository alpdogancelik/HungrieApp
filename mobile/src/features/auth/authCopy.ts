export const isTurkishLanguage = (language?: string | null) => String(language || "").toLowerCase().startsWith("tr");

const byLanguage = <T>(language: string | null | undefined, tr: T, en: T) => (isTurkishLanguage(language) ? tr : en);

export const getAuthScreenCopy = (language?: string | null) => ({
    signIn: {
        heroTitle: byLanguage(language, "Daha da acıkmak için giriş yap.", "Log in to become even Hungrier!"),
        heroBody: byLanguage(
            language,
            "Siparişini ver, kuryeler harekete geçsin, her şey tek ekranda aksın.",
            "We look forward to you placing your order and getting the couriers riding!",
        ),
        title: byLanguage(language, "Hungrie'ye hoş geldin!", "Welcome to the Hungrie App!"),
        subtitle: byLanguage(
            language,
            "Hungrie üzerinden hızlıca sipariş ver, yemeğin kapına gelsin.",
            "Sign in to order from Hungrie and get your food delivered fast.",
        ),
        emailLabel: byLanguage(language, "E-posta", "Email"),
        passwordLabel: byLanguage(language, "Şifre", "Password"),
        passwordRequirement: byLanguage(
            language,
            "Şifre en az 8 karakter olmalı; en az bir büyük harf, bir küçük harf ve bir sayı içermeli.",
            "Password must be at least 8 characters and include one uppercase letter, one lowercase letter, and one number.",
        ),
        staySignedIn: byLanguage(language, "Oturum açık kalsın :)", "Stay signed in :)"),
        forgotPassword: byLanguage(language, "Şifremi unuttum", "Forgot password"),
        submit: byLanguage(language, "Giriş yap", "Sign In"),
        noAccount: byLanguage(language, "Hesabın yok mu?", "Don't have an account?"),
        signUpLink: byLanguage(language, "Kayıt ol", "Sign Up"),
        emptyErrorTitle: byLanguage(language, "Giriş yapılamadı", "Sign in failed"),
        emptyErrorBody: byLanguage(language, "Lütfen e-posta adresini ve şifreni gir.", "Please enter your email and password."),
        fallbackError: byLanguage(language, "Şu anda giriş yapılamıyor. Lütfen tekrar dene.", "Unable to sign in right now. Please try again."),
    },
    signUp: {
        heroTitle: byLanguage(language, "Hungrie'ye bir dakikada katıl.", "Join Hungrie under a minute."),
        heroBody: byLanguage(language, "Tüm siparişlerin tek dokunuşta hazır.", "All orders in a single tap!"),
        title: byLanguage(language, "Hesap oluştur", "Create account"),
        subtitle: byLanguage(language, "Hesabını oluştur, saniyeler içinde siparişe başla.", "Create your account and start ordering in seconds!"),
        nameLabel: byLanguage(language, "Ad soyad", "Full name"),
        namePlaceholder: byLanguage(language, "Ahmet Çetin", "Ahmet Cetin"),
        whatsappLabel: byLanguage(language, "WhatsApp numarası (opsiyonel)", "WhatsApp number (optional)"),
        emailLabel: byLanguage(language, "E-posta", "Email"),
        passwordLabel: byLanguage(language, "Şifre", "Password"),
        passwordPlaceholder: byLanguage(language, "Aa123456", "Aa123456"),
        passwordRequirement: byLanguage(
            language,
            "Şifre en az 8 karakter olmalı; en az bir büyük harf, bir küçük harf ve bir sayı içermeli.",
            "Password must be at least 8 characters and include one uppercase letter, one lowercase letter, and one number.",
        ),
        submit: byLanguage(language, "Kayıt ol", "Sign Up"),
        alreadyAccount: byLanguage(language, "Zaten bir hesabın var mı?", "Already have an account?"),
        signInLink: byLanguage(language, "Giriş yap", "Sign In"),
        emptyErrorTitle: byLanguage(language, "Kayıt tamamlanamadı", "Registration failed"),
        emptyErrorBody: byLanguage(
            language,
            "Lütfen ad soyad, e-posta ve şifre alanlarını doldur.",
            "Please enter your full name, email, and password.",
        ),
        fallbackError: byLanguage(language, "Şu anda kayıt oluşturulamıyor. Lütfen tekrar dene.", "Unable to create your account right now. Please try again."),
    },
    forgotPassword: {
        heroTitle: byLanguage(language, "Şifreni yenile ve devam et.", "Reset your password and continue."),
        heroBody: byLanguage(
            language,
            "Şifre sıfırlama talimatı istemek için e-posta adresini gir.",
            "Enter your email to request password reset instructions.",
        ),
        title: byLanguage(language, "Şifremi unuttum", "Forgot password"),
        subtitle: byLanguage(language, "Hesabına tekrar ulaşmak için e-posta adresini gir.", "Enter your email to get back into your account."),
        emailLabel: byLanguage(language, "E-posta adresi", "Email address"),
        helper: byLanguage(
            language,
            "Yeni şifren en az 8 karakter olmalı; en az bir büyük harf, bir küçük harf ve bir sayı içermeli.",
            "Your new password must be at least 8 characters and include one uppercase letter, one lowercase letter, and one number.",
        ),
        submit: byLanguage(language, "Reset link gönder", "Send reset link"),
        backPrompt: byLanguage(language, "Giriş ekranına dönmek ister misin?", "Want to go back to sign in?"),
        backLink: byLanguage(language, "Giriş yap", "Sign In"),
        emptyTitle: byLanguage(language, "Şifre sıfırlama başarısız", "Password reset failed"),
        emptyBody: byLanguage(
            language,
            "Lütfen şifre sıfırlama linki için e-posta adresini gir.",
            "Please enter your email to receive a password reset link.",
        ),
        successTitle: byLanguage(language, "İstek alındı", "Request received"),
        successBody: byLanguage(
            language,
            "Bu e-posta için uygun bir hesap varsa şifre sıfırlama talimatları gönderilecektir.",
            "If an eligible account exists for this email, password reset instructions will be sent.",
        ),
        fallbackError: byLanguage(
            language,
            "Şu anda şifre sıfırlama e-postası gönderilemiyor.",
            "We can't send a password reset email right now.",
        ),
    },
    checkEmail: {
        heroTitle: byLanguage(language, "Mailini kontrol et ve hızlıca dön.", "Check your email and come right back."),
        heroBody: byLanguage(
            language,
            "Doğrulamayı tamamla ve Hungrie'de siparişe devam et.",
            "Complete verification and continue ordering on Hungrie.",
        ),
        title: byLanguage(language, "Kayıt e-postası gönderildi", "Verification email sent"),
        subtitle: byLanguage(
            language,
            "Hesabını etkinleştirmek için e-postandaki doğrulama linkini aç.",
            "Open the verification link in your email to activate your account.",
        ),
        cardTitle: byLanguage(language, "E-postanı kontrol et", "Check your email"),
        cardBody: byLanguage(
            language,
            "Kayıt e-postası gönderildi, lütfen e-postanı kontrol et. Spam klasörüne düşmüş olabilir.",
            "Registration email sent. Please check your email. It may have gone to spam.",
        ),
        sentAddress: byLanguage(language, "Gönderilen adres", "Sent to"),
        backToSignIn: byLanguage(language, "Giriş yap ekranına dön", "Back to Sign In"),
        editPrompt: byLanguage(language, "E-postayı düzeltmek ister misin?", "Need to fix your email address?"),
        editLink: byLanguage(language, "Kayıt ol", "Sign Up"),
        failedTitle: byLanguage(language, "Hesabın oluşturuldu", "Your account was created"),
        failedBody: byLanguage(
            language,
            "Doğrulama e-postası şu anda istenemedi. Hesabın güvende; aşağıdan tekrar deneyebilirsin.",
            "We couldn't request a verification email. Your account is safe; you can try again below.",
        ),
        pendingTitle: byLanguage(language, "E-posta doğrulaması gerekli", "Email verification required"),
        pendingBody: byLanguage(
            language,
            "Hesabına devam etmek için doğrulama e-postası iste veya e-postadaki bağlantıyı açtıktan sonra tekrar kontrol et.",
            "Request a verification email, or check again after opening the link in your email.",
        ),
        resend: byLanguage(language, "Doğrulama e-postasını tekrar gönder", "Resend verification email"),
        resending: byLanguage(language, "Gönderiliyor…", "Sending…"),
        checkAgain: byLanguage(language, "Doğrulamayı kontrol et", "Check verification"),
        checking: byLanguage(language, "Kontrol ediliyor…", "Checking…"),
        stillUnverified: byLanguage(language, "E-posta henüz doğrulanmadı. Bağlantıyı açtıktan sonra tekrar dene.", "Your email is not verified yet. Open the link and check again."),
        resendSucceeded: byLanguage(language, "Doğrulama isteği gönderildi. Gelen kutunu ve spam klasörünü kontrol et.", "Verification requested. Check your inbox and spam folder."),
        sessionMissing: byLanguage(language, "Doğrulamaya devam etmek için hesabına tekrar giriş yap.", "Sign in again to continue verification."),
        signOut: byLanguage(language, "Başka hesapla giriş yap", "Sign in with another account"),
        signOutFailed: byLanguage(language, "Şu anda çıkış yapılamıyor. Lütfen tekrar dene.", "Unable to sign out right now. Please try again."),
    },
});

export const getAuthErrorMessage = (language: string | null | undefined, key: string) => {
    switch (key) {
        case "invalidCredentials":
            return byLanguage(language, "Kullanıcı adı veya şifre hatalı.", "Incorrect username or password.");
        case "signupUnavailable":
            return byLanguage(
                language,
                "Bu bilgilerle kayıt işlemini tamamlayamadık. Daha önce hesap oluşturduysan giriş yapmayı veya erişimini kurtarmayı dene.",
                "We couldn't complete registration with these details. If you may already have an account, try signing in or recovering access.",
            );
        case "signupNetwork":
            return byLanguage(language, "Bağlantını kontrol edip kayıt işlemini tekrar dene.", "Check your connection and try registration again.");
        case "weakPassword":
            return byLanguage(
                language,
                "Şifre en az 8 karakter olmalı; en az bir büyük harf, bir küçük harf ve bir sayı içermeli.",
                "Password must be at least 8 characters and include one uppercase letter, one lowercase letter, and one number.",
            );
        case "invalidEmail":
            return byLanguage(language, "Lütfen geçerli bir e-posta adresi gir.", "Please enter a valid email address.");
        case "tooManyRequests":
            return byLanguage(language, "Çok fazla deneme yapıldı. Lütfen biraz sonra tekrar dene.", "Too many attempts. Please try again in a moment.");
        case "verifyEmail":
            return byLanguage(language, "Lütfen e-posta adresini doğrula ve ardından tekrar giriş yap.", "Please verify your email and then sign in again.");
        case "userNotFound":
            return byLanguage(language, "Bu e-posta adresi ile eşleşen bir hesap bulunamadı.", "No account was found for this email address.");
        case "invalidPassword":
            return byLanguage(language, "Şifre hatalı. Lütfen tekrar dene.", "Password is incorrect. Please try again.");
        case "emailRequired":
            return byLanguage(language, "E-posta adresi gerekli.", "Email address is required.");
        case "verificationNetwork":
            return byLanguage(language, "Bağlantını kontrol edip tekrar dene.", "Check your connection and try again.");
        case "verificationSession":
            return byLanguage(language, "Doğrulamaya devam etmek için tekrar giriş yap.", "Sign in again to continue verification.");
        case "verificationRequestFailed":
            return byLanguage(language, "Doğrulama e-postası şu anda istenemedi. Lütfen tekrar dene.", "We couldn't request a verification email. Please try again.");
        default:
            return null;
    }
};
