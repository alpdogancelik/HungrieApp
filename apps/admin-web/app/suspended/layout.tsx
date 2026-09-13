import { AuthGate } from "@/components/AuthGate";

export default function SuspendedLayout({ children }: { children: React.ReactNode }) {
  return <AuthGate>{children}</AuthGate>;
}
