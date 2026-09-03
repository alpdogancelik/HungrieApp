import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { createAdaptiveStyleSheet } from "@/src/theme/adaptiveStyles";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { router } from "expo-router";
import Icon from "../components/Icon";
import { useTheme } from "@/src/theme/themeContext";

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
    subtitle: "Sipariş, ödeme ve hesap konularında bize ulaşabilirsiniz.",
    hoursTitle: "Çalışma saatleri",
    hours: "Her gün 09:00 - 00:00",
    responseTitle: "Geri dönüş süresi",
    response: "Yoğunluğa göre ortalama 15 dakika içinde dönüş sağlanır.",
    contactsTitle: "Iletişim",
    contacts: [
        { label: "E-posta", value: "ahungrie@gmail.com", href: "mailto:ahungrie@gmail.com" },
        { label: "Web", value: "hungrie.app/support", href: "https://hungrie.app/support" },
    ],
    faqTitle: "Sık sorulan sorular",
    faq: [
        {
            q: "Siparişim gecikiyor, ne yapmalıyım?",
            a: "Sipariş detayındaki durum adımlarını kontrol edin. 5 dakikayı aşan gecikmelerde destek ekibine sipariş numarası ile yazın.",
        },
        {
            q: "Iptal/iade nasıl yapılıyor?",
            a: "Iptal ve iade süreci restoran onayına ve sipariş durumuna göre değerlendirilir. Destek ekibi gerekli adımları paylaşır.",
        },
        {
            q: "Restoran panel bildirimi gelmiyorsa ne yapmalıyım?",
            a: "Tarayıcı/telefon bildirim iznini açın, internet bağlantısını kontrol edin ve paneli yenileyin.",
        },
    ],
    note: "Not: Hızlı çözüm için mesajınıza sipariş numarası ekleyin.",
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
        { label: "Email", value: "ahungrie@gmail.com", href: "mailto:ahungrie@gmail.com" },
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
    const { theme } = useTheme();
    const { i18n } = useTranslation();
    const content = i18n.language.startsWith("tr") ? SUPPORT_TR : SUPPORT_EN;

    return (
        <SafeAreaView style={[styles.safeArea, { backgroundColor: theme.colors.background }]} edges={["top", "left", "right"]}>
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
                <View style={styles.headerRow}>
                    <Pressable onPress={() => router.back()} style={({ pressed }) => [styles.backButton, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }, pressed && styles.backButtonPressed]}>
                        <Icon name="arrowBack" size={20} color={theme.colors.ink} />
                    </Pressable>
                    <Text style={[styles.screenTitle, { color: theme.colors.ink }]}>{content.title}</Text>
                </View>

                <View style={[styles.heroCard, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
                    <Text style={[styles.subtitle, { color: theme.colors.textSecondary }]}>{content.subtitle}</Text>
                    <View style={styles.metaRow}>
                        <Text style={[styles.metaLabel, { color: theme.colors.muted }]}>{content.hoursTitle}</Text>
                        <Text style={[styles.metaValue, { color: theme.colors.ink }]}>{content.hours}</Text>
                    </View>
                    <View style={styles.metaRow}>
                        <Text style={[styles.metaLabel, { color: theme.colors.muted }]}>{content.responseTitle}</Text>
                        <Text style={[styles.metaValue, { color: theme.colors.ink }]}>{content.response}</Text>
                    </View>
                </View>

                <View style={[styles.card, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
                    <Text style={[styles.cardTitle, { color: theme.colors.ink }]}>{content.contactsTitle}</Text>
                    {content.contacts.map((item) => (
                        <Pressable
                            key={`${item.label}-${item.value}`}
                            style={({ pressed }) => [styles.contactRow, { backgroundColor: theme.colors.surfaceMuted, borderColor: theme.colors.border }, pressed && styles.rowPressed]}
                            onPress={() => openLink(item.href)}
                        >
                            <Text style={[styles.contactLabel, { color: theme.colors.muted }]}>{item.label}</Text>
                            <Text style={[styles.contactValue, { color: theme.colors.ink }]}>{item.value}</Text>
                        </Pressable>
                    ))}
                </View>

                <View style={[styles.card, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
                    <Text style={[styles.cardTitle, { color: theme.colors.ink }]}>{content.faqTitle}</Text>
                    {content.faq.map((item, index) => (
                        <View key={`${item.q}-${index}`} style={[styles.faqItem, { borderTopColor: theme.colors.divider }]}>
                            <Text style={[styles.faqQ, { color: theme.colors.ink }]}>{item.q}</Text>
                            <Text style={[styles.faqA, { color: theme.colors.textSecondary }]}>{item.a}</Text>
                        </View>
                    ))}
                </View>

                <View style={[styles.noteCard, { backgroundColor: theme.colors.warningSurface, borderColor: theme.colors.warning }]}>
                    <Text style={[styles.noteText, { color: theme.colors.warning }]}>{content.note}</Text>
                </View>
            </ScrollView>
        </SafeAreaView>
    );
};

const styles = createAdaptiveStyleSheet({
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
