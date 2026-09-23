import type { ButtonHTMLAttributes, ReactNode } from "react";

export function Button({ variant = "primary", icon, className = "", ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "ghost" | "danger"; icon?: ReactNode }) {
  return <button {...props} className={`ui-button ui-button--${variant} ${className}`.trim()}>{icon}{props.children}</button>;
}
