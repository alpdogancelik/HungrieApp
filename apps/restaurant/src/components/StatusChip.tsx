import type { ReactNode } from "react";

export function StatusChip({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "success" | "danger" | "warning" | "info" }) {
  return <span className={`ui-status ui-status--${tone}`}>{children}</span>;
}
