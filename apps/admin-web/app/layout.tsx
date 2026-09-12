import type { Metadata } from "next";

export const metadata: Metadata = { title: "Hungrie Admin proof" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: "system-ui, sans-serif", background: "#f8f7f4", color: "#26221c" }}>
        {children}
      </body>
    </html>
  );
}
