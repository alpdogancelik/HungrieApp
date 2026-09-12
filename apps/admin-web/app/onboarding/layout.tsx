import { AuthGate } from "@/components/AuthGate";

export default function OnboardingLayout({ children }: { children: React.ReactNode }) {
  return <AuthGate>{children}</AuthGate>;
}
