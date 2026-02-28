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
        emailLabel: byLanguage(
            language,
            "E-posta (mümkünse METU e-postanı kullanırsan harika olur)",
            "Email (If you could, please use your METU email, that would be great!)",
        ),
        passwordLabel: byLanguage(language, "Şifre", "Password"),
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
        whatsappLabel: byLanguage(language, "WhatsApp numarası", "WhatsApp number"),
        emailLabel: byLanguage(
            language,
            "E-posta (mümkünse METU e-postanı kullanırsan harika olur)",
            "Email (If you could, please use your METU email, that would be great!)",
        ),
        passwordLabel: byLanguage(language, "Şifre", "Password"),
        passwordPlaceholder: byLanguage(language, "En az 8 karakter", "At least 8 characters"),
        submit: byLanguage(language, "Kayıt ol", "Sign Up"),
        alreadyAccount: byLanguage(language, "Zaten bir hesabın var mı?", "Already have an account?"),
        signInLink: byLanguage(language, "Giriş yap", "Sign In"),
        emptyErrorTitle: byLanguage(language, "Kayıt tamamlanamadı", "Registration failed"),
        emptyErrorBody: byLanguage(
            language,
            "Lütfen tüm alanları doldur. WhatsApp numarası da gerekli.",
            "Please fill in all fields, including your WhatsApp number.",
        ),
        fallbackError: byLanguage(language, "Şu anda kayıt oluşturulamıyor. Lütfen tekrar dene.", "Unable to create your account right now. Please try again."),
    },
    forgotPassword: {
        heroTitle: byLanguage(language, "Şifreni yenile ve devam et.", "Reset your password and continue."),
        heroBody: byLanguage(
            language,
            "Mail adresini yaz, sana şifre sıfırlama bağlantısını gönderelim.",
            "Enter your email and we will send you a password reset link.",
        ),
        title: byLanguage(language, "Şifremi unuttum", "Forgot password"),
        subtitle: byLanguage(language, "Hesabına tekrar ulaşmak için e-posta adresini gir.", "Enter your email to get back into your account."),
        emailLabel: byLanguage(language, "E-posta adresi", "Email address"),
        helper: byLanguage(
            language,
            "Link geldikten sonra yeni şifreni e-posta üzerinden belirleyebilirsin.",
            "After the email arrives, you can set a new password from the link.",
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
        successTitle: byLanguage(language, "E-posta gönderildi", "Email sent"),
        successBody: byLanguage(
            language,
            "Şifre sıfırlama bağlantısı gönderildi. Gelen kutunu ve spam klasörünü kontrol et.",
            "We sent a password reset link. Please check your inbox and spam folder.",
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
            "Hesabını aktifleştirmek için e-postandaki doğrulama linkini aç.",
            "Open the verification link in your email to activate your account.",
        ),
        cardTitle: byLanguage(language, "Emailini kontrol et", "Check your email"),
        cardBody: byLanguage(
            language,
            "Kayıt emaili gönderildi, lütfen emailinizi kontrol ediniz. Spam klasörüne düşmüş olabilir :(",
            "Registration email sent. Please check your email (it may have gone to spam :( )",
        ),
        sentAddress: byLanguage(language, "Gönderilen adres", "Sent to"),
        backToSignIn: byLanguage(language, "Giriş yap ekranına dön", "Back to Sign In"),
        editPrompt: byLanguage(language, "E-postayı düzeltmek ister misin?", "Need to fix your email address?"),
        editLink: byLanguage(language, "Kayıt ol", "Sign Up"),
    },
});

export const getAuthErrorMessage = (language: string | null | undefined, key: string) => {
    switch (key) {
        case "invalidCredentials":
            return byLanguage(language, "Kullanıcı adı veya şifre hatalı.", "Incorrect username or password.");
        case "emailAlreadyInUse":
            return byLanguage(language, "Bu e-posta adresi ile zaten bir hesap var.", "An account already exists for this email address.");
        case "weakPassword":
            return byLanguage(language, "Şifre çok zayıf. Lütfen daha güçlü bir şifre gir.", "Password is too weak. Please enter a stronger password.");
        case "invalidEmail":
            return byLanguage(language, "Lütfen geçerli bir e-posta adresi gir.", "Please enter a valid email address.");
        case "tooManyRequests":
            return byLanguage(language, "Çok fazla deneme yapıldı. Lütfen biraz sonra tekrar dene.", "Too many attempts. Please try again in a moment.");
        case "verifyEmail":
            return byLanguage(language, "Lütfen e-posta adresini doğrula ve ardından tekrar giriş yap.", "Please verify your email and then sign in again.");
        case "emailRequired":
            return byLanguage(language, "E-posta adresi gerekli.", "Email address is required.");
        case "resetUserNotFound":
            return byLanguage(language, "Bu e-posta adresi ile eşleşen bir hesap bulunamadı.", "No account was found for this email address.");
        default:
            return null;
    }
};
