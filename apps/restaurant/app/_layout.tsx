import { Stack, usePathname } from "expo-router";
import { RestaurantProviders } from "../src/providers";
import { AuthGate } from "../src/AuthGate";
import "../src/styles.css";
import "../src/reviewStyles.css";

export default function RootLayout() {
  const pathname = usePathname();
  const routes = <Stack screenOptions={{headerShown:false}}/>;
  return <RestaurantProviders>{__DEV__ && pathname === "/reviews-preview" ? routes : <AuthGate>{routes}</AuthGate>}</RestaurantProviders>;
}
