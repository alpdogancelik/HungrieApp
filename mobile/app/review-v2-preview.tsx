import { Redirect } from "expo-router";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, SafeAreaView, StyleSheet, Text, View } from "react-native";
import OrderReviewSheet from "@/src/features/reviews/OrderReviewSheet";
import { useTheme } from "@/src/theme/themeContext";

const FIXTURE_ITEMS = [
    { menuItemId: "meal-1", name: "Margherita / Çok uzun yapılandırılmış yemek adı", quantity: 1 },
    { menuItemId: "meal-1", name: "Margherita", quantity: 2 },
    { menuItemId: "meal-2", name: "Ayran", quantity: 1 },
];

export default function ReviewV2Preview() {
    const { theme, variant, toggleTheme } = useTheme();
    const { i18n } = useTranslation();
    const [visible, setVisible] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    useEffect(() => {
        if (!submitting) return;
        const timeout = setTimeout(() => setSubmitting(false), 2500);
        return () => clearTimeout(timeout);
    }, [submitting]);
    if (!__DEV__) return <Redirect href="/" />;
    const turkish = i18n.language?.startsWith("tr");
    return <SafeAreaView style={[styles.safe, { backgroundColor: theme.colors.background }]}>
        <Text style={[styles.title, { color: theme.colors.ink }]}>Review v2 local preview</Text>
        <View style={styles.actions}>
            <Button label={turkish ? "English" : "Türkçe"} onPress={() => void i18n.changeLanguage(turkish ? "en" : "tr")} />
            <Button label={variant === "dark" ? "Light" : "Dark"} onPress={toggleTheme} />
            <Button label="Open" onPress={() => setVisible(true)} />
            <Button label={submitting ? "Stop submitting" : "Submitting"} onPress={() => setSubmitting((value) => !value)} />
            <Button label="Retry error" onPress={() => setError((value) => value ? null : "We could not submit your review. Try again.")} />
        </View>
        <Text style={[styles.note, { color: theme.colors.textSecondary }]}>Fixture only. No repository or network calls.</Text>
        <OrderReviewSheet visible={visible} restaurantName="Hungrie Test Restaurant" items={FIXTURE_ITEMS} submitting={submitting} errorText={error} onClose={() => setVisible(false)} onDiscard={() => setError(null)} onSubmit={() => { setError(null); setVisible(false); }} />
    </SafeAreaView>;
}

const Button = ({ label, onPress }: { label: string; onPress: () => void }) => <Pressable accessibilityRole="button" onPress={onPress} style={styles.button}><Text style={styles.buttonText}>{label}</Text></Pressable>;
const styles = StyleSheet.create({
    safe: { flex: 1, padding: 22 }, title: { fontFamily: "ChairoSans", fontSize: 24, fontWeight: "700" }, actions: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 18 }, button: { minHeight: 44, borderRadius: 12, backgroundColor: "#FE8C00", paddingHorizontal: 14, alignItems: "center", justifyContent: "center" }, buttonText: { color: "#FFFFFF", fontFamily: "ChairoSans", fontWeight: "700" }, note: { fontFamily: "ChairoSans", marginTop: 16 },
});
