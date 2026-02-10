import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import Icon from "@/components/Icon";

const TERMS_CONTACT_EMAIL = "ahungrie@gmail.com";
const EFFECTIVE_DATE = "January 1, 2026";

export default function TermsOfServiceScreen() {
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
                        <Text style={styles.title}>Terms of Service</Text>
                        <Text style={styles.effective}>Effective date: {EFFECTIVE_DATE}</Text>
                    </View>
                </View>

                <View style={styles.card}>
                    <Text style={styles.sectionTitle}>Placeholder</Text>
                    <Text style={styles.paragraph}>
                        These Terms of Service are a placeholder. Please replace this content with your final terms before publishing.
                    </Text>
                    <Text style={styles.paragraph}>
                        If you have questions, contact us at:
                    </Text>

                    <Pressable
                        onPress={() => Linking.openURL(`mailto:${TERMS_CONTACT_EMAIL}`)}
                        accessibilityRole="link"
                        style={styles.emailRow}
                    >
                        <Text style={styles.emailLabel}>Email:</Text>
                        <Text style={styles.emailValue}>{TERMS_CONTACT_EMAIL}</Text>
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
    card: { backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: "#E2E8F0", borderRadius: 16, padding: 16, gap: 12 },
    sectionTitle: { fontSize: 16, fontWeight: "700", color: "#0F172A" },
    paragraph: { fontSize: 14, lineHeight: 20, color: "#334155" },
    emailRow: { marginTop: 6, flexDirection: "row", gap: 8, alignItems: "center" },
    emailLabel: { fontSize: 14, fontWeight: "700", color: "#0F172A" },
    emailValue: { fontSize: 14, color: "#2563EB" },
});

