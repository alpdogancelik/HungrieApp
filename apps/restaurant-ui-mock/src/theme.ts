export const colors = {
  ink: "#0F1729",
  inkSoft: "#27324A",
  orange: "#FF6520",
  orangeDark: "#D9460A",
  orangeSoft: "#FFF0E8",
  canvas: "#FFF8EF",
  card: "#FFFFFF",
  muted: "#697386",
  mutedSoft: "#A0A8B8",
  border: "#E7E9EF",
  line: "#F0F1F5",
  green: "#16A36A",
  greenSoft: "#EAF9F1",
  red: "#E23D36",
  redSoft: "#FFF0EF",
  amber: "#B77900",
  amberSoft: "#FFF7DB",
  blue: "#2E6EDB",
  blueSoft: "#EEF4FF",
  white: "#FFFFFF",
} as const;

export const radius = { sm: 10, md: 14, lg: 20, xl: 28, pill: 999 } as const;
export const shadow = {
  shadowColor: "#12213B",
  shadowOpacity: 0.08,
  shadowRadius: 18,
  shadowOffset: { width: 0, height: 8 },
  elevation: 3,
} as const;

export const breakpoints = { phone: 768, desktop: 1024 } as const;
