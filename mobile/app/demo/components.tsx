import { useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ThemeProvider, useTheme } from "@/src/theme/themeContext";
import { AppBar, Badge, Button, Card, Chip, SectionHeader, Stepper } from "@/src/components/componentRegistry";

const DemoContent = () => {
    const { theme, toggleTheme, variant } = useTheme();
    const [chipSelected, setChipSelected] = useState(false);
    const [count, setCount] = useState(1);

    return (
        <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.surface }}>
            <AppBar title="Design System" rightAction={{ label: variant === "light" ? "Dark" : "Light", onPress: toggleTheme }} />
            <ScrollView contentContainerStyle={{ padding: theme.spacing.lg, gap: theme.spacing.lg }}>
                <SectionHeader title="Buttons" />
                <View style={{ flexDirection: "row", gap: theme.spacing.md, flexWrap: "wrap" }}>
                    <Button label="Solid" />
                    <Button label="Outline" variant="outline" />
                    <Button label="Ghost" variant="ghost" />
                    <Button label="Loading" loading />
                </View>

                <SectionHeader title="Chips" />
                <View style={{ flexDirection: "row", gap: theme.spacing.md }}>
                    <Chip label="Promos" selected={chipSelected} badgeCount={4} onPress={() => setChipSelected((prev) => !prev)} />
                    <Chip label="Favourite" />
                </View>

                <SectionHeader title="Badges" />
                <View style={{ flexDirection: "row", gap: theme.spacing.md }}>
                    <Badge label="Hazırlanıyor" status="warning" />
                    <Badge label="Teslim edildi" status="success" />
                    <Badge label="İptal" status="danger" />
                </View>

                <SectionHeader title="Card + Stepper" />
                <Card elevation={2}>
                    <Text style={{ color: theme.colors.ink, fontFamily: "ChairoSans", fontSize: theme.typography.h2 }}>
                        Kampüs Burger Menü
                    </Text>
                    <Text style={{ color: theme.colors.muted, fontFamily: "ChairoSans" }}>
                        Gece yarısı promosyonu devam ediyor.
                    </Text>
                    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: theme.spacing.md }}>
                        <Stepper value={count} min={1} max={5} onChange={setCount} />
                        <Button label="Sepete Ekle" size="sm" />
                    </View>
                </Card>
            </ScrollView>
        </SafeAreaView>
    );
};

const DesignSystemDemo = () => (
    <ThemeProvider>
        <DemoContent />
    </ThemeProvider>
);

export default DesignSystemDemo;


