import type { LucideIcon } from "lucide-react-native";
import { AlertTriangle, Check, ChevronRight, CloudOff, RefreshCw, Wifi } from "lucide-react-native";
import type { PropsWithChildren, ReactNode } from "react";
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { getCopy } from "./copy";
import { useMock } from "./mock-context";
import { colors, radius, shadow } from "./theme";

export function AppText({ children, style, weight = "regular", numberOfLines }: PropsWithChildren<{ style?: object | object[]; weight?: "regular" | "medium" | "bold"; numberOfLines?: number }>) {
  return <Text numberOfLines={numberOfLines} style={StyleSheet.flatten([styles.text, weight === "medium" && styles.medium, weight === "bold" && styles.bold, style])}>{children}</Text>;
}

export function PageHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return <View style={styles.pageHeader}><View style={styles.pageTitleWrap}><AppText style={styles.pageTitle} weight="bold">{title}</AppText>{subtitle && <AppText style={styles.subtitle}>{subtitle}</AppText>}</View>{action}</View>;
}

export function Card({ children, style, onPress, label }: PropsWithChildren<{ style?: object | object[]; onPress?: () => void; label?: string }>) {
  if (onPress) return <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={({ pressed }) => StyleSheet.flatten([styles.card, style, pressed && { opacity: .84 }])}>{children}</Pressable>;
  return <View style={StyleSheet.flatten([styles.card, style])}>{children}</View>;
}

export function Button({ label, onPress, icon: Icon, variant = "primary", disabled = false, compact = false }: { label: string; onPress?: () => void; icon?: LucideIcon; variant?: "primary" | "secondary" | "ghost" | "danger"; disabled?: boolean; compact?: boolean }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={label} disabled={disabled} onPress={onPress} style={({ pressed }) => [styles.button, styles[`button_${variant}`], compact && styles.buttonCompact, disabled && styles.disabled, pressed && !disabled && { transform: [{ scale: .98 }] }]}>
    {Icon && <Icon size={18} color={variant === "primary" || variant === "danger" ? colors.white : colors.ink} />}
    <AppText weight="bold" style={[styles.buttonLabel, (variant === "primary" || variant === "danger") && { color: colors.white }]}>{label}</AppText>
  </Pressable>;
}

export function IconButton({ label, icon: Icon, onPress }: { label: string; icon: LucideIcon; onPress?: () => void }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={({ pressed }) => [styles.iconButton, pressed && { opacity: .7 }]}><Icon size={20} color={colors.ink} /></Pressable>;
}

export function Chip({ label, tone = "neutral", selected = false, onPress }: { label: string; tone?: "neutral" | "success" | "danger" | "warning" | "blue"; selected?: boolean; onPress?: () => void }) {
  const content = <AppText weight="medium" style={[styles.chipText, selected && { color: colors.white }, !selected && tone === "success" && { color: colors.green }, !selected && tone === "danger" && { color: colors.red }, !selected && tone === "warning" && { color: colors.amber }, !selected && tone === "blue" && { color: colors.blue }]}>{label}</AppText>;
  const chipStyle = [styles.chip, styles[`chip_${tone}`], selected && { backgroundColor: colors.ink }];
  return onPress ? <Pressable accessibilityRole="button" accessibilityState={{ selected }} onPress={onPress} style={chipStyle}>{content}</Pressable> : <View style={chipStyle}>{content}</View>;
}

export function Toggle({ value, onChange, label }: { value: boolean; onChange: (value: boolean) => void; label: string }) {
  return <Pressable accessibilityRole="switch" accessibilityLabel={label} accessibilityState={{ checked: value }} onPress={() => onChange(!value)} style={[styles.toggle, value && { backgroundColor: colors.green }]}><View style={[styles.toggleKnob, value && { transform: [{ translateX: 24 }] }]} /></Pressable>;
}

export function Field({ label, value, onChangeText, placeholder, multiline = false }: { label: string; value: string; onChangeText: (value: string) => void; placeholder?: string; multiline?: boolean }) {
  return <View style={styles.field}><AppText style={styles.fieldLabel} weight="medium">{label}</AppText><TextInput accessibilityLabel={label} value={value} onChangeText={onChangeText} placeholder={placeholder} placeholderTextColor={colors.mutedSoft} multiline={multiline} style={[styles.input, multiline && { minHeight: 92, textAlignVertical: "top" }]} /></View>;
}

export function ListRow({ title, subtitle, icon: Icon, onPress, trailing }: { title: string; subtitle?: string; icon?: LucideIcon; onPress?: () => void; trailing?: ReactNode }) {
  const body = <><View style={styles.rowIcon}>{Icon && <Icon size={19} color={colors.orange} />}</View><View style={{ flex: 1 }}><AppText weight="medium">{title}</AppText>{subtitle && <AppText style={styles.small}>{subtitle}</AppText>}</View>{trailing || (onPress && <ChevronRight size={19} color={colors.mutedSoft} />)}</>;
  return onPress ? <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.listRow, pressed && { backgroundColor: colors.canvas }]}>{body}</Pressable> : <View style={styles.listRow}>{body}</View>;
}

export function StateBoundary({ children }: PropsWithChildren) {
  const { scenario } = useMock(); const c = getCopy(useMock().locale);
  if (scenario === "loading") return <View style={styles.centerState}><ActivityIndicator size="large" color={colors.orange} /><AppText>{c.checking}</AppText></View>;
  if (scenario === "empty") return <View style={styles.centerState}><AppText style={{ fontSize: 38 }}>📭</AppText><AppText weight="bold">{c.noData}</AppText></View>;
  if (scenario === "error") return <View style={styles.centerState}><AlertTriangle size={34} color={colors.red} /><AppText weight="bold">{c.unavailable}</AppText><Button label={c.retry} icon={RefreshCw} /></View>;
  return <>{children}</>;
}

export function ConnectivityBanner() {
  const { scenario, locale } = useMock(); const c = getCopy(locale);
  if (!["offline", "reconnecting", "stale"].includes(scenario)) return null;
  const offline = scenario === "offline";
  return <View accessibilityRole="alert" style={[styles.banner, offline && { backgroundColor: colors.redSoft }, scenario === "stale" && { backgroundColor: colors.amberSoft }]}>{offline ? <CloudOff size={18} color={colors.red} /> : scenario === "stale" ? <AlertTriangle size={18} color={colors.amber} /> : <Wifi size={18} color={colors.blue} />}<AppText style={{ flex: 1 }} weight="medium">{offline ? c.offline : scenario === "stale" ? c.stale : c.reconnecting}</AppText></View>;
}

export function Dialog({ visible, title, children, onClose, actions }: PropsWithChildren<{ visible: boolean; title: string; onClose: () => void; actions?: ReactNode }>) {
  return <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}><View style={styles.modalBackdrop}><View accessibilityRole="alert" accessibilityLabel={title} style={styles.dialog}><View style={styles.dialogTitle}><AppText weight="bold" style={{ fontSize: 20 }}>{title}</AppText><IconButton label="Close" icon={Check} onPress={onClose} /></View>{children}<View style={styles.dialogActions}>{actions}</View></View></View></Modal>;
}

export function HorizontalChips({ children }: PropsWithChildren) { return <ScrollView horizontal style={styles.horizontalScroll} showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>{children}</ScrollView>; }

const styles = StyleSheet.create({
  text: { color: colors.ink, fontFamily: "DMSans_400Regular", fontSize: 15, lineHeight: 21 }, medium: { fontFamily: "DMSans_600SemiBold" }, bold: { fontFamily: "Outfit_700Bold" },
  pageHeader: { flexDirection: "row", flexWrap: "wrap", alignItems: "flex-start", justifyContent: "space-between", gap: 16, marginBottom: 22 }, pageTitleWrap: { flex: 1, minWidth: 240, gap: 5 }, pageTitle: { fontSize: 29, lineHeight: 34 }, subtitle: { color: colors.muted, fontSize: 15 },
  card: { backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1, borderRadius: radius.lg, padding: 18, ...shadow },
  button: { minHeight: 46, borderRadius: radius.md, paddingHorizontal: 18, flexDirection: "row", gap: 9, alignItems: "center", justifyContent: "center" }, buttonCompact: { minHeight: 40, paddingHorizontal: 13 }, button_primary: { backgroundColor: colors.orange }, button_secondary: { backgroundColor: colors.white, borderColor: colors.border, borderWidth: 1 }, button_ghost: { backgroundColor: colors.orangeSoft }, button_danger: { backgroundColor: colors.red }, buttonLabel: { color: colors.ink, fontSize: 14 }, disabled: { opacity: .42 },
  iconButton: { width: 44, height: 44, borderRadius: radius.md, alignItems: "center", justifyContent: "center", backgroundColor: colors.canvas, borderColor: colors.border, borderWidth: 1 },
  chip: { minHeight: 36, paddingHorizontal: 13, borderRadius: radius.pill, alignItems: "center", justifyContent: "center", backgroundColor: colors.canvas, borderWidth: 1, borderColor: colors.border }, chip_neutral: {}, chip_success: { backgroundColor: colors.greenSoft, borderColor: colors.greenSoft }, chip_danger: { backgroundColor: colors.redSoft, borderColor: colors.redSoft }, chip_warning: { backgroundColor: colors.amberSoft, borderColor: colors.amberSoft }, chip_blue: { backgroundColor: colors.blueSoft, borderColor: colors.blueSoft }, chipText: { fontSize: 13 }, chipRow: { gap: 8, paddingBottom: 4 },
  toggle: { width: 52, height: 28, padding: 3, borderRadius: radius.pill, backgroundColor: colors.mutedSoft }, toggleKnob: { width: 22, height: 22, borderRadius: 11, backgroundColor: colors.white, ...shadow },
  field: { gap: 7, width: "100%", minWidth: 0 }, fieldLabel: { fontSize: 13, color: colors.muted }, input: { minHeight: 46, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.canvas, paddingHorizontal: 14, paddingVertical: 11, color: colors.ink, fontFamily: "DMSans_400Regular", fontSize: 15 },
  listRow: { minHeight: 62, flexDirection: "row", alignItems: "center", gap: 12, borderBottomWidth: 1, borderBottomColor: colors.line, paddingVertical: 10 }, rowIcon: { width: 36, height: 36, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: colors.orangeSoft }, small: { color: colors.muted, fontSize: 13, lineHeight: 18, marginTop: 2 },
  centerState: { minHeight: 360, alignItems: "center", justifyContent: "center", gap: 14, padding: 28 }, banner: { flexDirection: "row", alignItems: "center", gap: 10, padding: 13, borderRadius: radius.md, backgroundColor: colors.blueSoft, marginBottom: 18 },
  horizontalScroll: { flexShrink: 1, minWidth: 0 }, modalBackdrop: { flex: 1, backgroundColor: "rgba(15,23,41,.54)", padding: 20, alignItems: "center", justifyContent: "center" }, dialog: { width: "100%", maxWidth: 520, maxHeight: "90%", backgroundColor: colors.white, borderRadius: radius.xl, padding: 22, gap: 18 }, dialogTitle: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 }, dialogActions: { flexDirection: "row", justifyContent: "flex-end", gap: 10, flexWrap: "wrap" },
});
