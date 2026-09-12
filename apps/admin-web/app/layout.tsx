import type { Metadata } from "next";
import "./styles.css";
import { AdminProviders } from "@/components/AdminProviders";

export const metadata: Metadata = { title: "Hungrie Admin" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body><AdminProviders>{children}</AdminProviders></body>
    </html>
  );
}
