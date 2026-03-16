import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { router } from "expo-router";
import Icon from "../components/Icon";

type TermsSection = {
    title: string;
    body?: string[];
    bullets?: string[];
};

type TermsContent = {
    title: string;
    header: string;
    meta: string[];
    sections: TermsSection[];
};

const TERMS_TR: TermsContent = {
    title: "Şartlar ve Koşullar",
    header: "ŞARTLAR VE KOŞULLAR - Hungrie",
    meta: ["Yürürlük Tarihi: 01.01.2026", "Sağlayıcı: HungrieApp"],
    sections: [
        {
            title: "1. Sözleşmenin Kabulü",
            body: ["Uygulamayı kullanarak bu sözleşmeyi kabul etmiş olursunuz."],
        },
        {
            title: "2. Hizmetler",
            body: [
                "Hungrie, restoran menülerini listeler, siparişi restorana iletir ve teslimat sürecini kolaylaştırır. Ürün içeriği, alerjen ve hijyen konularında restoran beyanları geçerlidir.",
            ],
        },
        {
            title: "3. Kullanıcı Hesabı",
            body: [
                "Hesabınızın doğru bilgilerle oluşturulması ve güvenli tutulması sizin sorumluluğunuzdadır. Aksi ispat edilmedikçe hesabınızdan yapılan işlemler size ait kabul edilir.",
            ],
        },
        {
            title: "4. Kullanıcı Yükümlülükleri",
            body: [
                "Hizmeti hukuka uygun şekilde kullanmayı, suistimal etmemeyi ve üçüncü kişi haklarını ihlal etmemeyi kabul edersiniz.",
            ],
        },
        {
            title: "5. İçerik ve Değişiklikler",
            body: [
                "Menü, fiyat ve stok bilgileri restoranlarca sağlanır ve değişebilir. Hungrie, hizmeti iyileştirmek için uygulamada değişiklik yapabilir.",
            ],
        },
        {
            title: "6. Kullanım Amacı",
            body: ["Siparişlerin kişisel kullanım amaçlı olduğunu kabul edersiniz."],
        },
        {
            title: "7. Ödeme",
            body: [
                "Ödeme, restoranın sunduğu seçeneklere göre kapıda nakit/POS ile yapılır. Hungrie mevcut modelde kart/banka bilgisi toplamaz.",
            ],
        },
        {
            title: "8. Kişisel Veriler",
            body: [
                "Kişisel veri işlemleri Gizlilik Politikası kapsamındadır. Teslimat için gerekli bilgiler restoran ve/veya kurye ile paylaşılabilir.",
            ],
        },
        {
            title: "9. Yasal Gereklilikler",
            body: ["Süreçler, mevzuat veya resmî makam taleplerine göre güncellenebilir."],
        },
        {
            title: "10. Teslimat",
            body: [
                "Teslimat, kullanıcının seçtiği adrese yapılır. Kullanıcı adreste bulunmazsa veya hatalı adres verirse doğacak sonuçlardan sorumlu olabilir.",
            ],
        },
        {
            title: "11. Ücret İadesi",
            body: [
                "İadeler, restoranın politikası ve geçerli mevzuata göre uygulanır. Hungrie iletişimi kolaylaştırabilir; ürün/teslimat kaynaklı uyuşmazlıklarda nihai sorumluluk ilgili tarafta olabilir.",
            ],
        },
        {
            title: "12. Kayıt ve Delil",
            body: [
                "Sipariş kayıtları ve sistem logları uyuşmazlık durumunda delil olarak kullanılabilir ve gerekli süre boyunca saklanır.",
            ],
        },
    ],
};

const TERMS_EN: TermsContent = {
    title: "Terms and Conditions",
    header: "TERMS AND CONDITIONS - Hungrie",
    meta: ["Effective Date: 01.01.2026", "Provider: HungrieApp"],
    sections: [
        {
            title: "1. Acceptance of the Agreement",
            body: ["By using the app, you accept this agreement."],
        },
        {
            title: "2. Services",
            body: [
                "Hungrie is a platform that lists restaurant menus, forwards your order to the restaurant, and facilitates delivery. For product contents, allergens, and hygiene matters, restaurant statements prevail.",
            ],
        },
        {
            title: "3. User Account",
            body: [
                "You are responsible for providing accurate account information and keeping your account secure. Transactions made through your account are considered yours unless proven otherwise.",
            ],
        },
        {
            title: "4. User Obligations",
            body: [
                "You agree to use the service lawfully, not abuse it, and not violate third-party rights.",
            ],
        },
        {
            title: "5. Content and Changes",
            body: [
                "Menu, price, and stock information is provided by restaurants and may change. Hungrie may update the app to improve service quality.",
            ],
        },
        {
            title: "6. Purpose of Use",
            body: ["You agree that orders are for personal use."],
        },
        {
            title: "7. Payment",
            body: [
                "Payment is made in cash/POS on delivery based on restaurant options. Hungrie does not collect card/bank information in the current model.",
            ],
        },
        {
            title: "8. Personal Data",
            body: [
                "Processing of personal data is subject to the Privacy Policy. Delivery-related information may be shared with the restaurant and/or courier.",
            ],
        },
        {
            title: "9. Legal Requirements",
            body: ["Processes may be updated due to laws or requests from official authorities."],
        },
        {
            title: "10. Delivery",
            body: [
                "Delivery is made to the address selected by the user. The user may be responsible for outcomes if they are unavailable or provide an incorrect address.",
            ],
        },
        {
            title: "11. Refunds",
            body: [
                "Refunds follow the policy of the restaurant preparing the order and applicable laws. Hungrie may facilitate communication, but final responsibility in product/delivery disputes may belong to the relevant party.",
            ],
        },
        {
            title: "12. Record Retention and Evidence",
            body: [
                "Order records and system logs may be used as verifiable evidence in disputes and are retained for the required period.",
            ],
        },
    ],
};

const SectionBlock = ({ section }: { section: TermsSection }) => (
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

const TermsScreen = () => {
    const { i18n } = useTranslation();
    const content = i18n.language.startsWith("tr") ? TERMS_TR : TERMS_EN;

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

export default TermsScreen;
