import { useEffect } from "react";
import { Stack } from "expo-router";

export default function RootLayout() {
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
    void navigator.serviceWorker.register("/sw.js", { scope: "/" });
  }, []);

  return <Stack screenOptions={{ headerShown: false }} />;
}
