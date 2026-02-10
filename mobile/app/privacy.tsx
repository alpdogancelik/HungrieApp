import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import Icon from "@/components/Icon";

export const PRIVACY_CONTACT_EMAIL = "ahungrie@gmail.com";

const EFFECTIVE_DATE = "January 1, 2026";

type Section = {
    title: string;
    body: string[];
    bullets?: string[];
};

const SECTIONS: Section[] = [
    {
        title: "Overview",
        body: [
            "This Privacy Policy explains how Hungrie collects, uses, and protects your information when you use the app and related services.",
            "By using Hungrie, you agree to the practices described in this policy.",
        ],
    },
    {
        title: "Data we collect",
        body: ["Depending on how you use the app, we may collect:"],
        bullets: [
            "Account data: name, email address, and identifiers (e.g., Firebase UID).",
            "Delivery data: delivery addresses you save in the app.",
            "Order data: items in your cart, order totals, payment method (e.g., cash/POS on delivery), and order status/history.",
            "Notifications data: push notification token (to deliver updates you request).",
            "Diagnostics data: app crash reports and performance diagnostics (e.g., via Sentry), where enabled.",
        ],
    },
    {
        title: "How we use",
        body: ["We use your information to:"],
        bullets: [
            "Provide core features (account, orders, delivery coordination).",
            "Send service-related notifications (e.g., order updates) when enabled.",
            "Provide customer support and respond to requests.",
            "Improve app reliability and security, including debugging and abuse prevention.",
        ],
    },
    {
        title: "Sharing",
        body: ["We may share limited information with:"],
        bullets: [
            "Restaurants: order details and necessary delivery/contact information to fulfill your order.",
            "Couriers/delivery staff: necessary delivery/contact information to complete delivery.",
            "Service providers: infrastructure providers (auth, database, push notifications) and diagnostics providers (e.g., Sentry) acting on our behalf.",
        ],
    },
    {
        title: "Security",
        body: [
            "We use reasonable technical and organizational measures designed to protect your information (for example, encrypted transport where supported and access controls).",
            "No method of transmission or storage is 100% secure, but we work to protect your data and limit access.",
        ],
    },
    {
        title: "Retention",
        body: [
            "We retain information as long as needed to provide the service, comply with legal obligations, resolve disputes, and enforce our agreements.",
            "When information is no longer needed, we delete it, anonymize it, or restrict access according to our internal policies.",
        ],
    },
    {
        title: "Your rights",
        body: [
            "Depending on your location, you may have rights to access, correct, or delete your information, and to object to or restrict certain processing.",
            "To make a request, contact us using the email below.",
        ],
    },
    {
        title: "Contact",
        body: ["For privacy questions or requests, contact us at:"],
        bullets: [PRIVACY_CONTACT_EMAIL],
    },
];

const PolicySection = ({ section }: { section: Section }) => {
    return (
        <View style={styles.section}>
            <Text style={styles.sectionTitle}>{section.title}</Text>
            {section.body.map((p, idx) => (
                <Text key={`${section.title}-p-${idx}`} style={styles.paragraph}>
                    {p}
                </Text>
            ))}
            {section.bullets?.length ? (
                <View style={styles.bullets}>
                    {section.bullets.map((b, idx) => (
                        <Text key={`${section.title}-b-${idx}`} style={styles.bullet}>
                            {"\u2022"} {b}
                        </Text>
                    ))}
                </View>
            ) : null}
        </View>
    );
};

export default function PrivacyPolicyScreen() {
    const handleBack = () => {
        if (router.canGoBack()) router.back();
        else router.replace("/");
    };

    return (
        <SafeAreaView style={styles.safe}>
            <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
                <View style={styles.header}>
                    <Pressable onPress={handleBack} style={styles.backButton} accessibilityRole="button" accessibilityLabel="Back">
                        <Icon name="arrowBack" size={20} color="#0F172A" />
                    </Pressable>
                    <View style={{ flex: 1 }}>
                        <Text style={styles.title}>Privacy Policy</Text>
                        <Text style={styles.effective}>Effective date: {EFFECTIVE_DATE}</Text>
                    </View>
                </View>

                <View style={styles.card}>
                    {SECTIONS.map((section) => (
                        <PolicySection key={section.title} section={section} />
                    ))}

                    <Pressable
                        onPress={() => Linking.openURL(`mailto:${PRIVACY_CONTACT_EMAIL}`)}
                        accessibilityRole="link"
                        style={styles.emailRow}
                    >
                        <Text style={styles.emailLabel}>Email:</Text>
                        <Text style={styles.emailValue}>{PRIVACY_CONTACT_EMAIL}</Text>
                    </Pressable>
                </View>
            </ScrollView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    safe: { flex: 1, backgroundColor: "#F8FAFC" },
    container: { padding: 20, paddingBottom: 120 },
    header: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 14 },
    backButton: {
        width: 40,
        height: 40,
        borderRadius: 999,
        backgroundColor: "#FFFFFF",
        borderWidth: 1,
        borderColor: "#E2E8F0",
        alignItems: "center",
        justifyContent: "center",
    },
    title: { fontSize: 24, fontWeight: "700", color: "#0F172A" },
    effective: { marginTop: 2, fontSize: 12, color: "#475569" },
    card: { backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: "#E2E8F0", borderRadius: 16, padding: 16, gap: 14 },
    section: { gap: 8 },
    sectionTitle: { fontSize: 16, fontWeight: "700", color: "#0F172A" },
    paragraph: { fontSize: 14, lineHeight: 20, color: "#334155" },
    bullets: { gap: 6 },
    bullet: { fontSize: 14, lineHeight: 20, color: "#334155" },
    emailRow: { marginTop: 10, flexDirection: "row", gap: 8, alignItems: "center" },
    emailLabel: { fontSize: 14, fontWeight: "700", color: "#0F172A" },
    emailValue: { fontSize: 14, color: "#2563EB" },
});

