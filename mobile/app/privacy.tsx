import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { router } from "expo-router";
import Icon from "../components/Icon";

type PolicySection = {
    title: string;
    body?: string[];
    bullets?: string[];
};

type PolicyContent = {
    title: string;
    header: string;
    meta: string[];
    sections: PolicySection[];
};

const POLICY_TR: PolicyContent = {
    title: "Gizlilik Politikası",
    header: "GİZLİLİK POLİTİKASI - Hungrie",
    meta: [
        "Yürürlük Tarihi: 01.01.2026",
        "Veri Sorumlusu: HungrieApp (METU NCC)",
        "İletişim ve Veri Talepleri: privacy@hungrie.app",
    ],
    sections: [
        {
            title: "1. Hangi verileri topluyoruz?",
            bullets: [
                "Hesap bilgileri: ad soyad, e-posta, telefon/WhatsApp, kullanıcı kimliği (Firebase UID).",
                "Teslimat bilgileri: teslimat adresleri (Firestore'da saklanır).",
                "Sipariş bilgileri: sepet içeriği, tutar, ödeme yöntemi, sipariş durumu ve geçmişi.",
                "Bildirim bilgileri: push token ve bildirim gönderim kayıtları.",
                "Teknik veriler: çökme/hata kayıtları ve performans verileri (Sentry).",
                "Toplamadıklarımız: hassas konum, rehber, fotoğraf/mikrofon, kart/banka bilgileri.",
            ],
        },
        {
            title: "2. Verileri ne için kullanıyoruz?",
            bullets: [
                "Siparişi oluşturmak, restorana iletmek ve teslimatı koordine etmek.",
                "Hesap ve oturum yönetimi.",
                "Müşteri destek süreçleri.",
                "Güvenlik ve kötüye kullanımı önleme.",
                "Uygulama kararlılığı ve hata analizi (Sentry).",
            ],
        },
        {
            title: "3. Verileri kimlerle paylaşıyoruz?",
            bullets: [
                "Restoranlar: sipariş içeriği ve teslimat için gerekli iletişim/adres bilgileri.",
                "Kuryeler: teslimat için gerekli adres ve iletişim bilgileri.",
                "Hizmet sağlayıcılar: altyapı (Auth/DB/push) ve hata izleme (Sentry).",
            ],
        },
        {
            title: "4. Saklama süresi",
            body: [
                "Veriler, hizmetin yürütülmesi, güvenlik ve yasal yükümlülükler için gerekli süre boyunca saklanır; sonrasında silinir, anonimleştirilir veya erişim kısıtlanır.",
            ],
        },
        {
            title: "5. Güvenlik",
            body: [
                "TLS/HTTPS, erişim kontrolü ve benzeri teknik/idari güvenlik tedbirleri uygulanır.",
            ],
        },
        {
            title: "6. Haklar ve silme talebi",
            body: [
                "Kullanıcı; erişim, düzeltme, silme ve itiraz haklarını kullanabilir.",
                "İletişim: privacy@hungrie.app veya https://hungrie.app/privacy-choices",
            ],
        },
        {
            title: "7. Değişiklikler",
            body: ["Gizlilik politikası güncellenebilir; güncel sürüm ilgili URL'de yayımlanır."],
        },
    ],
};

const POLICY_EN: PolicyContent = {
    title: "Privacy Policy",
    header: "PRIVACY POLICY - Hungrie",
    meta: [
        "Effective Date: 01.01.2026",
        "Data Controller: HungrieApp (Metu Ncc)",
        "Contact and Data Requests: privacy@hungrie.app",
    ],
    sections: [
        {
            title: "1. What data do we collect?",
            bullets: [
                "Account info: full name, email, phone/WhatsApp, and user ID (Firebase UID).",
                "Delivery info: delivery addresses (stored in Firestore).",
                "Order info: cart contents, total amount, payment method, order status, and order history.",
                "Notification info: push token and notification delivery logs.",
                "Technical diagnostics: crash/error logs and performance metrics (Sentry).",
                "Not collected: precise location, contacts, photo/microphone access, card/bank details.",
            ],
        },
        {
            title: "2. What do we use it for?",
            bullets: [
                "Creating orders, sending them to restaurants, and coordinating delivery.",
                "Account and session management.",
                "Customer support operations.",
                "Security and abuse prevention.",
                "App stability and debugging (Sentry).",
            ],
        },
        {
            title: "3. Who do we share data with?",
            bullets: [
                "Restaurants: order contents and delivery-related contact/address details.",
                "Couriers: required delivery address and contact details.",
                "Service providers: infrastructure (Auth/DB/push) and monitoring (Sentry).",
            ],
        },
        {
            title: "4. Retention period",
            body: [
                "Data is stored as long as necessary for service delivery, security, and legal obligations; then it is deleted, anonymized, or access-restricted.",
            ],
        },
        {
            title: "5. Security",
            body: [
                "We apply reasonable technical and administrative safeguards such as TLS/HTTPS and access controls.",
            ],
        },
        {
            title: "6. Rights and deletion request",
            body: [
                "Users can request access, correction, deletion, and object to processing.",
                "Contact: privacy@hungrie.app or https://hungrie.app/privacy-choices",
            ],
        },
        {
            title: "7. Changes",
            body: ["This policy may be updated. The latest version is published at the relevant URL."],
        },
    ],
};

const SectionBlock = ({ section }: { section: PolicySection }) => (
    <View style={styles.sectionBlock}>
        <Text style={styles.sectionTitle}>{section.title}</Text>

        {section.body?.map((line, index) => (
            <Text key={`${section.title}-body-${index}`} style={styles.bodyText}>
                {line}
            </Text>
        ))}

        {section.bullets?.map((line, index) => (
            <View key={`${section.title}-bullet-${index}`} style={styles.bulletRow}>
                <Text style={styles.bulletMark}>-</Text>
                <Text style={styles.bulletText}>{line}</Text>
            </View>
        ))}
    </View>
);

const PrivacyScreen = () => {
    const { i18n } = useTranslation();
    const content = i18n.language.startsWith("tr") ? POLICY_TR : POLICY_EN;

    return (
        <SafeAreaView style={styles.safeArea} edges={["top", "left", "right"]}>
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
                <View style={styles.headerRow}>
                    <Pressable onPress={() => router.back()} style={({ pressed }) => [styles.backButton, pressed && styles.backButtonPressed]}>
                        <Icon name="arrowBack" size={20} color="#0F172A" />
                    </Pressable>
                    <Text style={styles.screenTitle}>{content.title}</Text>
                </View>

                <View style={styles.metaCard}>
                    <Text style={styles.metaHeader}>{content.header}</Text>
                    {content.meta.map((line, index) => (
                        <Text key={`meta-${index}`} style={styles.metaText}>
                            {line}
                        </Text>
                    ))}
                </View>

                <View style={styles.sectionsWrap}>
                    {content.sections.map((section) => (
                        <SectionBlock key={section.title} section={section} />
                    ))}
                </View>
            </ScrollView>
        </SafeAreaView>
    );
};

const styles = StyleSheet.create({
    safeArea: { flex: 1, backgroundColor: "#F8FAFC" },
    content: { padding: 20, paddingBottom: 120 },
    headerRow: { flexDirection: "row", alignItems: "center", marginBottom: 16, gap: 12 },
    backButton: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: "#FFFFFF",
        borderWidth: 1,
        borderColor: "#E2E8F0",
        alignItems: "center",
        justifyContent: "center",
    },
    backButtonPressed: { opacity: 0.75 },
    screenTitle: {
        flex: 1,
        color: "#0F172A",
        fontFamily: "ChairoSans",
        fontSize: 28,
        lineHeight: 34,
    },
    metaCard: {
        borderRadius: 18,
        backgroundColor: "#FFFFFF",
        borderWidth: 1,
        borderColor: "#E2E8F0",
        padding: 14,
        marginBottom: 18,
    },
    metaHeader: {
        color: "#334155",
        fontFamily: "ChairoSans",
        fontSize: 12,
        lineHeight: 18,
        textTransform: "uppercase",
        letterSpacing: 1.5,
        marginBottom: 6,
    },
    metaText: {
        color: "#475569",
        fontFamily: "ChairoSans",
        fontSize: 14,
        lineHeight: 21,
        marginBottom: 2,
    },
    sectionsWrap: { gap: 14 },
    sectionBlock: {
        borderRadius: 18,
        backgroundColor: "#FFFFFF",
        borderWidth: 1,
        borderColor: "#E2E8F0",
        padding: 14,
        gap: 8,
    },
    sectionTitle: {
        color: "#0F172A",
        fontFamily: "ChairoSans",
        fontSize: 18,
        lineHeight: 24,
    },
    bodyText: {
        color: "#334155",
        fontFamily: "ChairoSans",
        fontSize: 15,
        lineHeight: 22,
    },
    bulletRow: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
    bulletMark: {
        color: "#334155",
        fontFamily: "ChairoSans",
        fontSize: 15,
        lineHeight: 22,
        width: 10,
    },
    bulletText: {
        flex: 1,
        color: "#334155",
        fontFamily: "ChairoSans",
        fontSize: 15,
        lineHeight: 22,
    },
});

export default PrivacyScreen;
