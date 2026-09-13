import { Stack } from "expo-router";
import { RestaurantProviders } from "../src/providers";
import { AuthGate } from "../src/AuthGate";
import "../src/styles.css";

export default function RootLayout() {
  return <RestaurantProviders><AuthGate><Stack screenOptions={{headerShown:false}}/></AuthGate></RestaurantProviders>;
}
