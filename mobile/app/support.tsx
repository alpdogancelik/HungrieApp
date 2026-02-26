import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { router } from "expo-router";
import Icon from "../components/Icon";

type SupportLine = {
    label: string;
    value: string;
    href?: string;
};

type FaqItem = {
    q: string;
    a: string;
};

type SupportContent = {
    title: string;
    subtitle: string;
    hoursTitle: string;
    hours: string;
    responseTitle: string;
    response: string;
    contactsTitle: string;
    contacts: SupportLine[];
    faqTitle: string;
    faq: FaqItem[];
    note: string;
};

const SUPPORT_TR: SupportContent = {
    title: "Destek",
    subtitle: "Siparis, odeme ve hesap konularinda bize ulasabilirsiniz.",
    hoursTitle: "Calisma saatleri",
    hours: "Her gun 09:00 - 01:00",
    responseTitle: "Geri donus suresi",
    response: "Yogunluga gore ortalama 5-15 dakika icinde donus saglanir.",
    contactsTitle: "Iletisim",
    contacts: [
        { label: "E-posta", value: "support@hungrie.app", href: "mailto:support@hungrie.app" },
        { label: "Web", value: "hungrie.app/support", href: "https://hungrie.app/support" },
    ],
    faqTitle: "Sik sorulan sorular",
    faq: [
        {
            q: "Siparisim gecikiyor, ne yapmaliyim?",
            a: "Siparis detayindaki durum adimlarini kontrol edin. 5 dakikayi asan gecikmelerde destek ekibine siparis numarasi ile yazin.",
        },
        {
            q: "Iptal/iade nasil yapiliyor?",
            a: "Iptal ve iade sureci restoran onayina ve siparis durumuna gore degerlendirilir. Destek ekibi gerekli adimlari paylasir.",
        },
        {
            q: "Restoran panel bildirimi gelmiyorsa ne yapmaliyim?",
            a: "Tarayici/telefon bildirim iznini acin, internet baglantisini kontrol edin ve paneli yenileyin.",
        },
    ],
    note: "Not: Hizli cozum icin mesajiniza siparis numarasi ekleyin.",
};

const SUPPORT_EN: SupportContent = {
    title: "Support",
    subtitle: "Reach us for order, payment, and account issues.",
    hoursTitle: "Working hours",
    hours: "Every day 09:00 AM - 01:00 AM",
    responseTitle: "Response time",
    response: "Depending on queue, average response is within 5-15 minutes.",
    contactsTitle: "Contact",
    contacts: [
        { label: "Email", value: "support@hungrie.app", href: "mailto:support@hungrie.app" },
        { label: "Web", value: "hungrie.app/support", href: "https://hungrie.app/support" },
    ],
    faqTitle: "Frequently asked questions",
    faq: [
        {
            q: "My order is delayed. What should I do?",
            a: "Check the status steps in order details. If delay exceeds 5 minutes, contact support with your order ID.",
        },
        {
            q: "How do cancellation/refund requests work?",
            a: "Cancellation and refund flow depends on order status and restaurant approval. Support will guide the next steps.",
        },
        {
            q: "Restaurant panel notifications are not arriving. What should I do?",
            a: "Enable browser/phone notifications, verify internet connection, and refresh the panel.",
        },
    ],
    note: "Note: Include your order ID in the message for faster resolution.",
};

const openLink = async (href?: string) => {
    if (!href) return;
    const supported = await Linking.canOpenURL(href);
    if (supported) {
        await Linking.openURL(href);
    }
};

const SupportScreen = () => {
    const { i18n } = useTranslation();
    const content = i18n.language.startsWith("tr") ? SUPPORT_TR : SUPPORT_EN;

    return (
        <SafeAreaView style={styles.safeArea} edges={["top", "left", "right"]}>
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
                <View style={styles.headerRow}>
                    <Pressable onPress={() => router.back()} style={({ pressed }) => [styles.backButton, pressed && styles.backButtonPressed]}>
                        <Icon name="arrowBack" size={20} color="#0F172A" />
                    </Pressable>
                    <Text style={styles.screenTitle}>{content.title}</Text>
                </View>

                <View style={styles.heroCard}>
                    <Text style={styles.subtitle}>{content.subtitle}</Text>
                    <View style={styles.metaRow}>
                        <Text style={styles.metaLabel}>{content.hoursTitle}</Text>
                        <Text style={styles.metaValue}>{content.hours}</Text>
                    </View>
                    <View style={styles.metaRow}>
                        <Text style={styles.metaLabel}>{content.responseTitle}</Text>
                        <Text style={styles.metaValue}>{content.response}</Text>
                    </View>
                </View>

                <View style={styles.card}>
                    <Text style={styles.cardTitle}>{content.contactsTitle}</Text>
                    {content.contacts.map((item) => (
                        <Pressable
                            key={`${item.label}-${item.value}`}
                            style={({ pressed }) => [styles.contactRow, pressed && styles.rowPressed]}
                            onPress={() => openLink(item.href)}
                        >
                            <Text style={styles.contactLabel}>{item.label}</Text>
                            <Text style={styles.contactValue}>{item.value}</Text>
                        </Pressable>
                    ))}
                </View>

                <View style={styles.card}>
                    <Text style={styles.cardTitle}>{content.faqTitle}</Text>
                    {content.faq.map((item, index) => (
                        <View key={`${item.q}-${index}`} style={styles.faqItem}>
                            <Text style={styles.faqQ}>{item.q}</Text>
                            <Text style={styles.faqA}>{item.a}</Text>
                        </View>
                    ))}
                </View>

                <View style={styles.noteCard}>
                    <Text style={styles.noteText}>{content.note}</Text>
                </View>
            </ScrollView>
        </SafeAreaView>
    );
};

const styles = StyleSheet.create({
    safeArea: { flex: 1, backgroundColor: "#F8FAFC" },
    content: { padding: 20, paddingBottom: 120, gap: 14 },
    headerRow: { flexDirection: "row", alignItems: "center", gap: 12 },
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
    heroCard: {
        borderRadius: 18,
        backgroundColor: "#FFFFFF",
        borderWidth: 1,
        borderColor: "#E2E8F0",
        padding: 14,
        gap: 10,
    },
    subtitle: {
        color: "#475569",
        fontFamily: "ChairoSans",
        fontSize: 16,
        lineHeight: 22,
    },
    metaRow: { gap: 2 },
    metaLabel: {
        color: "#64748B",
        fontFamily: "ChairoSans",
        fontSize: 13,
        lineHeight: 18,
    },
    metaValue: {
        color: "#0F172A",
        fontFamily: "ChairoSans",
        fontSize: 15,
        lineHeight: 20,
    },
    card: {
        borderRadius: 18,
        backgroundColor: "#FFFFFF",
        borderWidth: 1,
        borderColor: "#E2E8F0",
        padding: 14,
        gap: 10,
    },
    cardTitle: {
        color: "#0F172A",
        fontFamily: "ChairoSans",
        fontSize: 20,
        lineHeight: 26,
    },
    contactRow: {
        borderRadius: 12,
        borderWidth: 1,
        borderColor: "#E2E8F0",
        backgroundColor: "#F8FAFC",
        paddingVertical: 10,
        paddingHorizontal: 12,
        gap: 2,
    },
    rowPressed: { opacity: 0.8 },
    contactLabel: {
        color: "#64748B",
        fontFamily: "ChairoSans",
        fontSize: 13,
        lineHeight: 18,
    },
    contactValue: {
        color: "#0F172A",
        fontFamily: "ChairoSans",
        fontSize: 16,
        lineHeight: 21,
    },
    faqItem: {
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopColor: "#E2E8F0",
        paddingTop: 10,
        gap: 4,
    },
    faqQ: {
        color: "#0F172A",
        fontFamily: "ChairoSans",
        fontSize: 16,
        lineHeight: 22,
    },
    faqA: {
        color: "#475569",
        fontFamily: "ChairoSans",
        fontSize: 14,
        lineHeight: 20,
    },
    noteCard: {
        borderRadius: 14,
        backgroundColor: "#FFF7ED",
        borderWidth: 1,
        borderColor: "#FDBA74",
        padding: 12,
    },
    noteText: {
        color: "#9A3412",
        fontFamily: "ChairoSans",
        fontSize: 14,
        lineHeight: 20,
    },
});

export default SupportScreen;

