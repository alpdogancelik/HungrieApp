import { DMSans_400Regular, DMSans_500Medium, DMSans_600SemiBold } from "@expo-google-fonts/dm-sans";
import { Outfit_600SemiBold, Outfit_700Bold, useFonts } from "@expo-google-fonts/outfit";
import { Stack } from "expo-router";
import { ActivityIndicator, StatusBar, StyleSheet, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { MockProvider } from "../src/mock-context";
import { colors } from "../src/theme";

export default function RootLayout() {
  const [loaded] = useFonts({ DMSans_400Regular, DMSans_500Medium, DMSans_600SemiBold, Outfit_600SemiBold, Outfit_700Bold });
  if (!loaded) return <View style={styles.loading}><ActivityIndicator size="large" color={colors.orange} /></View>;
  return <SafeAreaProvider><MockProvider><StatusBar barStyle="dark-content" /><Stack screenOptions={{ headerShown: false }} /></MockProvider></SafeAreaProvider>;
}

const styles = StyleSheet.create({ loading: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.canvas } });
