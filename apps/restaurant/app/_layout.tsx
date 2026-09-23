import { Stack, usePathname } from "expo-router";
import { DMSans_400Regular, DMSans_500Medium, DMSans_600SemiBold } from "@expo-google-fonts/dm-sans";
import { Outfit_600SemiBold, Outfit_700Bold, useFonts } from "@expo-google-fonts/outfit";
import { RestaurantProviders } from "../src/providers";
import { AuthGate } from "../src/AuthGate";
import "../src/styles.css";
import "../src/reviewStyles.css";
import "../src/design/tokens.css";
import "../src/design/typography.css";
import "../src/design/responsive.css";
import "../src/design/components.css";

export default function RootLayout() {
  const pathname = usePathname();
  const [fontsLoaded, fontError] = useFonts({ DMSans_400Regular, DMSans_500Medium, DMSans_600SemiBold, Outfit_600SemiBold, Outfit_700Bold });
  if (!fontsLoaded && !fontError) return <div className="font-loading" role="status" aria-live="polite">Hungrie Restaurant</div>;
  const routes = <Stack screenOptions={{headerShown:false}}/>;
  return <RestaurantProviders>{__DEV__ && pathname === "/reviews-preview" ? routes : <AuthGate>{routes}</AuthGate>}</RestaurantProviders>;
}
