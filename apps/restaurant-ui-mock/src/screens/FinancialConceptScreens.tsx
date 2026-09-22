import { useLocalSearchParams, useRouter } from "expo-router";
import { Activity, AlertTriangle, ArrowLeft, Banknote, BarChart3, CalendarDays, CheckCircle2, ChevronLeft, ChevronRight, CircleDollarSign, Clock3, CreditCard, FileClock, History, Languages, LockKeyhole, RefreshCw, Save, ShieldAlert, Store, TrendingUp, Users } from "lucide-react-native";
import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from "react-native";
import { commissionRules, earningsOrderPages, earningsSummaries, monthlyEarningsSeries } from "../financial-fixtures";
import type { CommissionRuleFixture, EarningsOrderFixture, EarningsRange } from "../financial-fixtures";
import { useMock } from "../mock-context";
import { money } from "../order-ui";
import { AppShell } from "../shell";
import { breakpoints, colors, radius } from "../theme";
import { AppText, Button, Card, Chip, Dialog, Field, HorizontalChips, PageHeader } from "../ui";

type AdminScenario = "success" | "loading" | "empty" | "permission" | "validation" | "replay" | "service" | "stale_totp";

const rangeLabels: Record<EarningsRange, { en: string; tr: string }> = {
  day: { en: "Daily", tr: "Günlük" },
  week: { en: "Weekly", tr: "Haftalık" },
  month: { en: "Monthly", tr: "Aylık" },
  custom: { en: "Custom", tr: "Özel aralık" },
};

function rateLabel(rateBps: number) {
  const whole = Math.floor(rateBps / 100);
  const fraction = String(rateBps % 100).padStart(2, "0");
  return `${whole}.${fraction}%`;
}

export function EarningsScreen() {
  const { locale, scenario } = useMock();
  const { width } = useWindowDimensions();
  const router = useRouter();
  const params = useLocalSearchParams<{ range?: string; page?: string }>();
  const [range, setRange] = useState<EarningsRange>("month");
  const [fromDate, setFromDate] = useState("08.09.2026");
  const [toDate, setToDate] = useState("21.09.2026");
  const [page, setPage] = useState(0);
  const summary = earningsSummaries[range];
  const compactRows = width < breakpoints.phone;
  const tr = locale === "tr";
  useEffect(() => {
    if (["day", "week", "month", "custom"].includes(params.range || "")) setRange(params.range as EarningsRange);
    if (params.page === "2") setPage(1);
  }, [params.page, params.range]);

  return <AppShell>
    <PageHeader
      title={tr ? "Kazançlar" : "Earnings"}
      subtitle={tr ? "Teslim edilen siparişlerden, Hungrie komisyonu sonrası hesaplanan tahmini kazançlar." : "Estimated earnings after Hungrie commission from delivered orders."}
      action={<Button label={tr ? "Admin komisyon konsepti" : "Admin commission concept"} variant="secondary" icon={ShieldAlert} onPress={() => router.push("/concepts/admin-commission" as never)} />}
    />
    <ConceptBoundary />
    <View style={styles.disclaimer} accessibilityRole="summary">
      <CircleDollarSign size={20} color={colors.blue} />
      <View style={{ flex: 1, gap: 3 }}>
        <AppText weight="bold">{tr ? "Hesaplanan tahmini değer" : "Calculated estimate"}</AppText>
        <AppText style={styles.small}>{tr ? "Bu değer ödeme, aktarım, çekilebilir bakiye, nihai muhasebe kârı veya yasal mutabakat değildir; vergi, KDV, iade ve ters ibrazları içermez." : "This is not a payout, transfer, withdrawable balance, final accounting profit, or legal settlement; it does not include taxes, VAT, refunds, or chargebacks."}</AppText>
      </View>
    </View>
    <HorizontalChips>{(["day", "week", "month", "custom"] as EarningsRange[]).map(value => <Chip key={value} selected={range === value} onPress={() => { setRange(value); setPage(0); }} label={rangeLabels[value][locale]} />)}</HorizontalChips>
    {range === "custom" && <Card style={styles.customRange}><View style={styles.customFields}><Field label={tr ? "Başlangıç tarihi" : "From date"} value={fromDate} onChangeText={setFromDate} /><Field label={tr ? "Bitiş tarihi" : "To date"} value={toDate} onChangeText={setToDate} /></View><Button label={tr ? "Aralığı uygula" : "Apply range"} icon={CalendarDays} /></Card>}
    <AppText style={styles.timezone}>{tr ? "Dönem saat dilimi" : "Period timezone"}: <AppText weight="bold">{summary.timezone}</AppText></AppText>
    <RestaurantStateBoundary>
      <View style={[styles.metrics, compactRows && styles.metricsStacked]}>
        <Metric compact={compactRows} icon={TrendingUp} title={tr ? "Uygun brüt satış" : "Eligible gross sales"} value={money(summary.eligibleGrossKurus, locale)} tone={colors.orangeSoft} color={colors.orange} />
        <Metric compact={compactRows} icon={CircleDollarSign} title={tr ? "Hungrie komisyonu" : "Hungrie commission"} value={`−${money(summary.commissionKurus, locale)}`} detail={tr ? "Sipariş anında sabitlenen oran" : "Rate fixed when order was created"} tone={colors.redSoft} color={colors.red} />
        <Metric compact={compactRows} icon={CheckCircle2} title={tr ? "Tahmini net kazanç" : "Estimated net earnings"} value={money(summary.estimatedNetKurus, locale)} tone={colors.greenSoft} color={colors.green} />
        <Metric compact={compactRows} icon={Store} title={tr ? "Teslim edilen sipariş" : "Delivered orders"} value={String(summary.deliveredOrderCount)} tone={colors.blueSoft} color={colors.blue} />
      </View>
      <View style={[styles.columns, width < breakpoints.desktop && styles.columnsStacked]}>
        <Card style={[styles.trendCard, width < breakpoints.desktop && styles.fullWidth]}>
          <View style={styles.sectionHeading}><View><AppText weight="bold" style={styles.sectionTitle}>{tr ? "Kazanç eğilimi" : "Earnings trend"}</AppText><AppText style={styles.small}>{tr ? "Tahmini net · dönem özeti" : "Estimated net · period summary"}</AppText></View><BarChart3 size={22} color={colors.orange} /></View>
          <View accessibilityRole="list" style={styles.chart}>{monthlyEarningsSeries.map((point, index) => compactRows ? <View accessible accessibilityLabel={`${tr ? point.labelTr : point.labelEn}, ${money(point.estimatedNetKurus, locale)}`} key={point.labelEn} style={styles.mobileTrendRow}><AppText weight="medium">{tr ? point.labelTr : point.labelEn} · {money(point.estimatedNetKurus, locale)}</AppText></View> : <View accessible accessibilityLabel={`${tr ? point.labelTr : point.labelEn}, ${money(point.estimatedNetKurus, locale)}`} key={point.labelEn} style={styles.chartRow}><AppText style={styles.chartLabel}>{tr ? point.labelTr : point.labelEn}</AppText><View style={styles.barTrack}><View style={[styles.bar, { width: `${[64, 74, 86, 100, 97][index]}%` }]} /></View><AppText weight="medium" style={styles.chartValue}>{money(point.estimatedNetKurus, locale)}</AppText></View>)}</View>
        </Card>
        <Card style={[styles.collectionCard, width < breakpoints.desktop && styles.fullWidth]}>
          <View style={styles.sectionHeading}><View><AppText weight="bold" style={styles.sectionTitle}>{tr ? "Tahsilat yöntemleri" : "Collection methods"}</AppText><AppText style={styles.small}>{tr ? "Kapıda müşteri tarafından ödenir" : "Collected from the Customer at the door"}</AppText></View><CreditCard size={22} color={colors.blue} /></View>
          <CollectionRow icon={Banknote} label={tr ? "Nakit" : "Cash"} value={money(summary.cashKurus, locale)} />
          <CollectionRow icon={CreditCard} label={tr ? "Kapıda POS" : "POS at door"} value={money(summary.posKurus, locale)} />
          <View style={[styles.collectionTotal, compactRows && styles.collectionTotalCompact]}><AppText weight="bold">{tr ? "Toplam uygun brüt" : "Total eligible gross"}</AppText><AppText weight="bold">{money(summary.eligibleGrossKurus, locale)}</AppText></View>
        </Card>
      </View>
      <Card style={styles.ordersCard}>
        <View style={styles.sectionHeading}><View><AppText weight="bold" style={styles.sectionTitle}>{tr ? "Teslim edilen siparişler" : "Delivered orders"}</AppText><AppText style={styles.small}>{tr ? "Müşteri bilgisi içermez · yalnızca finansal anlık görüntüler" : "No Customer details · financial snapshots only"}</AppText></View><FileClock size={22} color={colors.orange} /></View>
        {!compactRows && <View style={styles.tableHeader}><TableCell wide text={tr ? "Sipariş / teslim" : "Order / delivered"} /><TableCell text={tr ? "Tahsilat" : "Collection"} /><TableCell text={tr ? "Uygun brüt" : "Eligible gross"} align="right" /><TableCell text={tr ? "Komisyon" : "Commission"} align="right" /><TableCell text={tr ? "Tahmini net" : "Estimated net"} align="right" /></View>}
        {earningsOrderPages[page].map(order => <FinancialOrderRow key={order.orderReference} order={order} compact={compactRows} locale={locale} />)}
        <View style={styles.pagination}><AppText style={styles.small}>{tr ? `Sayfa ${page + 1} / ${earningsOrderPages.length}` : `Page ${page + 1} of ${earningsOrderPages.length}`}</AppText><View style={styles.pageButtons}><Button label={tr ? "Önceki" : "Previous"} variant="secondary" compact icon={ChevronLeft} disabled={page === 0} onPress={() => setPage(value => Math.max(0, value - 1))} /><Button label={tr ? "Sonraki" : "Next"} variant="secondary" compact icon={ChevronRight} disabled={page === earningsOrderPages.length - 1} onPress={() => setPage(value => Math.min(earningsOrderPages.length - 1, value + 1))} /></View></View>
      </Card>
    </RestaurantStateBoundary>
  </AppShell>;
}

function ConceptBoundary() {
  const { locale } = useMock();
  return <View style={styles.conceptNotice}><ShieldAlert size={18} color={colors.amber} /><AppText style={{ flex: 1, color: colors.amber }} weight="medium">{locale === "tr" ? "Yalnızca ürün ve UI değerlendirmesi. Canlı finansal veri veya sunucu yetkisi içermez." : "Product and UI review only. No live financial data or server authority is present."}</AppText></View>;
}

function RestaurantStateBoundary({ children }: { children: React.ReactNode }) {
  const { scenario, locale } = useMock();
  const tr = locale === "tr";
  if (scenario === "loading") return <StatePanel icon={Activity} title={tr ? "Kazançlar yükleniyor" : "Loading earnings"} detail={tr ? "Yetki ve finansal özet kontrol ediliyor." : "Checking access and financial summaries."} loading />;
  if (scenario === "empty") return <StatePanel icon={FileClock} title={tr ? "Bu dönemde kazanç yok" : "No earnings in this period"} detail={tr ? "Yalnızca teslim edilen siparişler burada görünür." : "Only delivered orders appear here."} />;
  if (scenario === "error") return <StatePanel icon={AlertTriangle} title={tr ? "Kazançlar şu anda kullanılamıyor" : "Earnings are unavailable"} detail={tr ? "Sunucu değerleri alınamadı. Hiçbir tahmini değer oluşturulmadı." : "Server values could not be loaded. No values were estimated locally."} action={tr ? "Tekrar dene" : "Try again"} />;
  if (scenario === "permission") return <StatePanel icon={LockKeyhole} title={tr ? "Finansal erişim reddedildi" : "Financial access denied"} detail={tr ? "İlk sürümde yalnızca aktif Restoran sahipleri kazançları görüntüleyebilir. Yöneticiler erişemez." : "Only active Restaurant owners may view earnings in the first release. Managers are denied."} />;
  return <>{children}</>;
}

function StatePanel({ icon: Icon, title, detail, action, loading = false }: { icon: typeof Activity; title: string; detail: string; action?: string; loading?: boolean }) {
  return <Card style={styles.statePanel}>{loading ? <ActivityIndicator size="large" color={colors.orange} /> : <Icon size={36} color={colors.orange} />}<AppText weight="bold" style={styles.sectionTitle}>{title}</AppText><AppText style={[styles.small, { textAlign: "center" }]}>{detail}</AppText>{action && <Button label={action} icon={RefreshCw} />}</Card>;
}

function Metric({ icon: Icon, title, value, detail, tone, color, compact = false }: { icon: typeof TrendingUp; title: string; value: string; detail?: string; tone: string; color: string; compact?: boolean }) {
  return <Card style={[styles.metric, compact && styles.metricCompact]}><View style={[styles.metricIcon, { backgroundColor: tone }]}><Icon size={21} color={color} /></View><AppText style={styles.small}>{title}</AppText><AppText weight="bold" style={styles.metricValue}>{value}</AppText>{detail && <AppText style={styles.metricDetail}>{detail}</AppText>}</Card>;
}

function CollectionRow({ icon: Icon, label, value }: { icon: typeof Banknote; label: string; value: string }) {
  return <View style={styles.collectionRow}><View style={styles.collectionIcon}><Icon size={19} color={colors.orange} /></View><AppText style={{ flex: 1 }} weight="medium">{label}</AppText><AppText weight="bold">{value}</AppText></View>;
}

function TableCell({ text, align = "left", wide = false }: { text: string; align?: "left" | "right"; wide?: boolean }) {
  return <AppText style={[styles.tableCell, wide && styles.tableCellWide, { textAlign: align }]}>{text}</AppText>;
}

function FinancialOrderRow({ order, compact, locale }: { order: EarningsOrderFixture; compact: boolean; locale: "en" | "tr" }) {
  const tr = locale === "tr";
  if (compact) return <View style={styles.orderCardRow}><View style={styles.orderTop}><View><AppText weight="bold">{order.orderReference}</AppText><AppText style={styles.small}>{tr ? order.deliveredLabelTr : order.deliveredLabelEn}</AppText></View><Chip label={order.paymentMethod === "cash" ? (tr ? "Nakit" : "Cash") : "POS"} tone="blue" /></View><View style={[styles.orderAmounts, styles.orderAmountsCompact]}><Amount label={tr ? "Uygun brüt" : "Eligible gross"} value={money(order.eligibleGrossKurus, locale)} /><Amount label={`${tr ? "Komisyon" : "Commission"} · ${rateLabel(order.commissionRateBps)}`} value={`−${money(order.commissionKurus, locale)}`} /><Amount label={tr ? "Tahmini net" : "Estimated net"} value={money(order.estimatedNetKurus, locale)} strong /></View></View>;
  return <View style={styles.tableRow}><View style={[styles.tableCellWrap, styles.tableCellWide]}><AppText weight="bold">{order.orderReference}</AppText><AppText style={styles.small}>{tr ? order.deliveredLabelTr : order.deliveredLabelEn}</AppText></View><View style={styles.tableCellWrap}><Chip label={order.paymentMethod === "cash" ? (tr ? "Nakit" : "Cash") : "POS"} tone="blue" /></View><AppText style={[styles.tableCell, { textAlign: "right" }]}>{money(order.eligibleGrossKurus, locale)}</AppText><View style={styles.tableCellWrap}><AppText style={{ textAlign: "right" }}>−{money(order.commissionKurus, locale)}</AppText><AppText style={[styles.small, { textAlign: "right" }]}>{rateLabel(order.commissionRateBps)}</AppText></View><AppText weight="bold" style={[styles.tableCell, { textAlign: "right" }]}>{money(order.estimatedNetKurus, locale)}</AppText></View>;
}

function Amount({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return <View style={styles.amount}><AppText style={styles.small}>{label}</AppText><AppText weight={strong ? "bold" : "medium"}>{value}</AppText></View>;
}

export function AdminCommissionScreen() {
  const { locale, setLocale } = useMock();
  const { width } = useWindowDimensions();
  const router = useRouter();
  const params = useLocalSearchParams<{ adminState?: string; confirm?: string }>();
  const tr = locale === "tr";
  const desktop = width >= breakpoints.desktop;
  const [state, setState] = useState<AdminScenario>("success");
  const [rate, setRate] = useState("9.50");
  const [effective, setEffective] = useState("01.10.2026 09:00");
  const [reason, setReason] = useState(tr ? "Sonbahar ticari anlaşması" : "Autumn commercial agreement");
  const [confirming, setConfirming] = useState(false);
  useEffect(() => {
    const requested = params.adminState;
    if (["success", "loading", "empty", "permission", "validation", "replay", "service", "stale_totp"].includes(requested || "")) setState(requested as AdminScenario);
    if (params.confirm === "1") setConfirming(true);
  }, [params.adminState, params.confirm]);
  useEffect(() => {
    setRate(tr ? "9,50" : "9.50");
    setReason(tr ? "Sonbahar ticari anlaşması" : "Autumn commercial agreement");
  }, [tr]);

  return <View style={adminStyles.shell}>
    {desktop && <View style={adminStyles.sidebar}><View style={adminStyles.brand}><View style={adminStyles.brandMark}><AppText weight="bold" style={{ color: colors.white, fontSize: 20 }}>H</AppText></View><View><AppText weight="bold" style={{ color: colors.white, fontSize: 18 }}>Hungrie</AppText><AppText style={adminStyles.sideMuted}>Admin</AppText></View></View><View style={adminStyles.sideActive}><Store size={19} color={colors.white} /><AppText weight="bold" style={{ color: colors.white }}>{tr ? "Restoranlar" : "Restaurants"}</AppText></View><View style={adminStyles.sideLink}><History size={19} color="#AEB7C8" /><AppText style={adminStyles.sideText}>{tr ? "Denetim kaydı" : "Audit log"}</AppText></View><View style={adminStyles.sideLink}><Users size={19} color="#AEB7C8" /><AppText style={adminStyles.sideText}>{tr ? "Hesaplar" : "Accounts"}</AppText></View></View>}
    <View style={adminStyles.main}>
      <View style={adminStyles.topbar}><Pressable accessibilityRole="button" accessibilityLabel={tr ? "Kazanç konseptine dön" : "Back to earnings concept"} onPress={() => router.push("/concepts/earnings" as never)} style={adminStyles.topButton}><ArrowLeft size={19} color={colors.ink} /></Pressable><View style={adminStyles.topbarTitle}><AppText numberOfLines={1} weight="bold">{width < breakpoints.phone ? (tr ? "Restoran" : "Restaurant") : (tr ? "Restoran ayrıntısı" : "Restaurant detail")}</AppText>{width >= breakpoints.phone && <AppText numberOfLines={1} style={styles.small}>Phase 5 Staging Pilot</AppText>}</View><Pressable accessibilityRole="button" accessibilityLabel={tr ? "Dili İngilizce yap" : "Switch language to Turkish"} onPress={() => setLocale(tr ? "en" : "tr")} style={adminStyles.language}>{width >= breakpoints.phone && <Languages size={18} color={colors.ink} />}<AppText weight="bold">{locale.toUpperCase()}</AppText></Pressable></View>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={[adminStyles.page, !desktop && adminStyles.pageCompact]} keyboardShouldPersistTaps="handled">
        <View style={adminStyles.header}><View style={{ flex: 1, minWidth: width < breakpoints.phone ? 0 : 240 }}><AppText weight="bold" style={styles.pageTitle}>{tr ? "Komisyon yönetimi" : "Commission management"}</AppText><AppText style={styles.subtitle}>{tr ? "Yeni siparişlere uygulanacak Restoran komisyon kurallarını inceleyin ve planlayın." : "Review and schedule Restaurant commission rules for new orders."}</AppText></View>{width >= breakpoints.phone && <Chip label={tr ? "UI KONSEPTİ" : "UI CONCEPT"} tone="warning" />}</View>
        <View style={styles.conceptNotice}><ShieldAlert size={18} color={colors.amber} /><AppText style={{ flex: 1, color: colors.amber }} weight="medium">{tr ? "Canlı veri yoktur. Kural ekleme yalnızca aktif super_admin ve yakın tarihli TOTP doğrulamasıyla sunucuda yapılır." : "No live data. Rule creation is server-guarded and requires an active super_admin with recent TOTP."}</AppText></View>
        <AppText style={adminStyles.stateLabel} weight="bold">{tr ? "İNCELEME DURUMU" : "REVIEW STATE"}</AppText>
        <View style={adminStyles.stateRow}>{(["success", "loading", "empty", "permission", "validation", "replay", "service", "stale_totp"] as AdminScenario[]).map(value => <Chip key={value} label={adminStateLabel(value, locale)} selected={state === value} onPress={() => setState(value)} />)}</View>
        <AdminStateBoundary state={state}>
          <View style={[styles.columns, !desktop && styles.columnsStacked]}>
            <View style={[adminStyles.primaryColumn, !desktop && styles.fullWidth]}>
              <Card style={adminStyles.currentCard}>
                <View style={styles.sectionHeading}><View><AppText style={styles.small}>{tr ? "GEÇERLİ ORAN" : "CURRENT RATE"}</AppText><AppText weight="bold" style={adminStyles.rate}>{rateLabel(800)}</AppText></View><View style={adminStyles.rateIcon}><CircleDollarSign size={24} color={colors.orange} /></View></View>
                <AppText>{tr ? "1 Ağustos 2026 03:00 itibarıyla yeni siparişler" : "New orders from 1 August 2026 at 03:00"}</AppText><AppText style={styles.small}>{tr ? "Sözleşme sürümü 1 · Asia/Famagusta gösterimi" : "Contract version 1 · Asia/Famagusta display"}</AppText>
              </Card>
              <Card style={adminStyles.scheduledCard}>
                <View style={styles.sectionHeading}><View><AppText style={styles.small}>{tr ? "PLANLANAN SONRAKİ ORAN" : "NEXT SCHEDULED RATE"}</AppText><AppText weight="bold" style={adminStyles.scheduledRate}>{rateLabel(950)}</AppText></View><Clock3 size={23} color={colors.blue} /></View><AppText weight="medium">{tr ? "1 Ekim 2026 09:00 itibarıyla" : "Effective 1 October 2026 at 09:00"}</AppText><AppText style={styles.small}>{tr ? "Daha önce oluşturulan siparişleri değiştirmez." : "Does not change previously created orders."}</AppText>
              </Card>
              <Card style={{ gap: 16 }}>
                <View><AppText weight="bold" style={styles.sectionTitle}>{tr ? "Yeni oran planla" : "Schedule a new rate"}</AppText><AppText style={styles.small}>{tr ? "Yüzde en fazla iki ondalık basamakla girilir ve tam baz puana dönüştürülür." : "Enter a percentage with at most two decimal places; it is converted to exact basis points."}</AppText></View>
                {state === "validation" && <InlineAlert tone="danger" text={tr ? "Oran 0,00 ile 100,00 arasında ve en fazla iki ondalık basamaklı olmalıdır. Gerekçe zorunludur." : "Rate must be between 0.00 and 100.00 with at most two decimal places. Reason is required."} />}
                {state === "stale_totp" && <InlineAlert tone="warning" text={tr ? "TOTP doğrulamanız artık güncel değil. Oran planlamadan önce yeniden doğrulayın." : "Your TOTP verification is no longer recent. Re-authenticate before scheduling a rate."} />}
                <View style={[adminStyles.formRow, width < breakpoints.phone && adminStyles.formStack]}><View style={{ flex: 1, minWidth: 180 }}><Field label={tr ? "Komisyon yüzdesi" : "Commission percentage"} value={rate} onChangeText={setRate} placeholder="9.50" /></View><View style={{ flex: 1.4, minWidth: 220 }}><Field label={tr ? "Yürürlük tarihi ve saati" : "Effective date and time"} value={effective} onChangeText={setEffective} placeholder="01.10.2026 09:00" /></View></View>
                <Field label={tr ? "Denetim gerekçesi" : "Audit reason"} value={reason} onChangeText={setReason} placeholder={tr ? "Değişikliğin nedenini yazın" : "Explain why the rate is changing"} multiline />
                <InlineAlert tone="blue" text={tr ? "Kesin zaman: 1 Ekim 2026 06:00 UTC. Bu andan önce oluşturulan siparişler %8,00 oranını korur." : "Exact time: 1 October 2026 06:00 UTC. Orders created before that instant retain the 8.00% rate."} />
                <View style={[adminStyles.actions, width < breakpoints.phone && adminStyles.actionsMobile]}>{state === "stale_totp" && <Button label={tr ? "TOTP ile yeniden doğrula" : "Re-authenticate with TOTP"} variant="secondary" icon={LockKeyhole} />}<Button label={width < breakpoints.phone ? (tr ? "İncele" : "Review") : (tr ? "Değişikliği incele" : "Review change")} icon={Save} disabled={state === "stale_totp" || state === "validation" || !reason.trim()} onPress={() => setConfirming(true)} /></View>
              </Card>
            </View>
            <Card style={[adminStyles.historyCard, !desktop && styles.fullWidth]}><View style={styles.sectionHeading}><View><AppText weight="bold" style={styles.sectionTitle}>{tr ? "Oran geçmişi" : "Rate history"}</AppText><AppText style={styles.small}>{tr ? "Yalnızca eklemeli kayıt" : "Append-only record"}</AppText></View><History size={22} color={colors.orange} /></View>{commissionRules.map(rule => <RuleHistory key={rule.id} rule={rule} locale={locale} />)}</Card>
          </View>
        </AdminStateBoundary>
      </ScrollView>
    </View>
    <Dialog visible={confirming} title={tr ? "Komisyon değişikliğini onayla" : "Confirm commission change"} onClose={() => setConfirming(false)} actions={<><Button label={tr ? "Vazgeç" : "Cancel"} variant="secondary" onPress={() => setConfirming(false)} /><Button label={tr ? "Planla" : "Schedule"} onPress={() => { setConfirming(false); setState("replay"); }} /></>}>
      <View style={adminStyles.confirmRates}><RateChange label={tr ? "Eski oran" : "Old rate"} value="8.00%" /><AppText weight="bold" style={{ color: colors.muted }}>→</AppText><RateChange label={tr ? "Yeni oran" : "New rate"} value={`${rate}%`} /></View><InlineAlert tone="warning" text={tr ? "Yeni oran 1 Ekim 2026 06:00 UTC anında veya sonrasında oluşturulan siparişlere uygulanır. Var olan siparişler yeniden hesaplanmaz." : "The new rate applies to orders created at or after 1 October 2026 06:00 UTC. Existing orders are never recalculated."} /><AppText style={styles.small}>{tr ? `Gerekçe: ${reason}` : `Reason: ${reason}`}</AppText>
    </Dialog>
  </View>;
}

function adminStateLabel(state: AdminScenario, locale: "en" | "tr") {
  const labels: Record<AdminScenario, { en: string; tr: string }> = { success: { en: "Success", tr: "Başarılı" }, loading: { en: "Loading", tr: "Yükleniyor" }, empty: { en: "Empty", tr: "Boş" }, permission: { en: "Permission", tr: "Yetki" }, validation: { en: "Validation", tr: "Doğrulama" }, replay: { en: "Replay", tr: "Tekrar" }, service: { en: "Service error", tr: "Servis hatası" }, stale_totp: { en: "Stale TOTP", tr: "Eski TOTP" } };
  return labels[state][locale];
}

function AdminStateBoundary({ state, children }: { state: AdminScenario; children: React.ReactNode }) {
  const { locale } = useMock(); const tr = locale === "tr";
  if (state === "loading") return <StatePanel icon={Activity} title={tr ? "Komisyon kuralları yükleniyor" : "Loading commission rules"} detail={tr ? "Aktif Admin erişimi yeniden doğrulanıyor." : "Active Admin access is being rechecked."} loading />;
  if (state === "empty") return <StatePanel icon={FileClock} title={tr ? "Uygulanabilir kural yok" : "No applicable rule"} detail={tr ? "Bu Restoran sipariş kabul etmeye başlayamaz. İlk kural güvenli Admin sözleşmesiyle oluşturulmalıdır." : "This Restaurant cannot begin accepting orders. An initial rule must be created through the guarded Admin contract."} />;
  if (state === "permission") return <StatePanel icon={LockKeyhole} title={tr ? "Komisyon yönetimi reddedildi" : "Commission management denied"} detail={tr ? "Yalnızca aktif super_admin ve yakın tarihli TOTP doğrulaması oran planlayabilir." : "Only an active super_admin with recent TOTP may schedule a rate."} />;
  if (state === "service") return <StatePanel icon={AlertTriangle} title={tr ? "Komisyon hizmeti kullanılamıyor" : "Commission service unavailable"} detail={tr ? "İşlem kaydedilmedi. Aynı sabit işlem kimliğiyle güvenli şekilde yeniden deneyin." : "The operation was not recorded. Retry safely with the same stable operation ID."} action={tr ? "Tekrar dene" : "Try again"} />;
  return <>{state === "replay" && <InlineAlert tone="success" text={tr ? "Aynı işlem daha önce kaydedildi. Mevcut kural sonucu güvenli şekilde yeniden gösteriliyor; ikinci bir kural oluşturulmadı." : "This operation was already recorded. The existing result is replayed safely; no duplicate rule was created."} />}{children}</>;
}

function InlineAlert({ tone, text }: { tone: "blue" | "warning" | "danger" | "success"; text: string }) {
  const palette = tone === "danger" ? { bg: colors.redSoft, fg: colors.red } : tone === "warning" ? { bg: colors.amberSoft, fg: colors.amber } : tone === "success" ? { bg: colors.greenSoft, fg: colors.green } : { bg: colors.blueSoft, fg: colors.blue };
  const Icon = tone === "success" ? CheckCircle2 : tone === "blue" ? ShieldAlert : AlertTriangle;
  return <View accessibilityRole="alert" style={[adminStyles.inlineAlert, { backgroundColor: palette.bg }]}><Icon size={18} color={palette.fg} /><AppText style={{ flex: 1, color: palette.fg }} weight="medium">{text}</AppText></View>;
}

function RuleHistory({ rule, locale }: { rule: CommissionRuleFixture; locale: "en" | "tr" }) {
  const tr = locale === "tr";
  const status = rule.status === "current" ? (tr ? "Geçerli" : "Current") : rule.status === "scheduled" ? (tr ? "Planlandı" : "Scheduled") : (tr ? "Sona erdi" : "Superseded");
  return <View style={adminStyles.historyRow}><View style={adminStyles.timeline}><View style={[adminStyles.timelineDot, rule.status === "current" && { backgroundColor: colors.green }, rule.status === "scheduled" && { backgroundColor: colors.blue }]} /><View style={adminStyles.timelineLine} /></View><View style={{ flex: 1, gap: 4, paddingBottom: 18 }}><View style={adminStyles.historyTop}><AppText weight="bold" style={{ fontSize: 18 }}>{rateLabel(rule.rateBps)}</AppText><Chip label={status} tone={rule.status === "current" ? "success" : rule.status === "scheduled" ? "blue" : "neutral"} /></View><AppText style={styles.small}>{tr ? rule.reasonTr : rule.reasonEn}</AppText><AppText style={styles.small}>{rule.effectiveFromUtc.replace("T", " · ").replace(":00Z", " UTC")}</AppText></View></View>;
}

function RateChange({ label, value }: { label: string; value: string }) { return <View style={adminStyles.rateChange}><AppText style={styles.small}>{label}</AppText><AppText weight="bold" style={{ fontSize: 24 }}>{value}</AppText></View>; }

const styles = StyleSheet.create({
  pageTitle: { fontSize: 29, lineHeight: 34 }, subtitle: { color: colors.muted, fontSize: 15, marginTop: 5 }, small: { color: colors.muted, fontSize: 13, lineHeight: 18 }, conceptNotice: { flexDirection: "row", gap: 10, padding: 13, borderRadius: radius.md, backgroundColor: colors.amberSoft, marginBottom: 16 }, disclaimer: { flexDirection: "row", gap: 11, padding: 15, borderRadius: radius.md, backgroundColor: colors.blueSoft, marginBottom: 16 }, customRange: { marginTop: 12, gap: 12 }, customFields: { flexDirection: "row", flexWrap: "wrap", gap: 12 }, timezone: { color: colors.muted, fontSize: 12, marginVertical: 12 }, metrics: { flexDirection: "row", flexWrap: "wrap", gap: 12, marginBottom: 16 }, metricsStacked: { flexDirection: "column", flexWrap: "nowrap", width: "100%" }, metric: { flex: 1, minWidth: 210, gap: 7 }, metricCompact: { width: "100%", minWidth: 0, flexGrow: 0, flexShrink: 0, flexBasis: "auto" }, metricIcon: { width: 43, height: 43, borderRadius: 14, alignItems: "center", justifyContent: "center" }, metricValue: { fontSize: 24 }, metricDetail: { color: colors.muted, fontSize: 11, lineHeight: 15 }, columns: { flexDirection: "row", gap: 16, alignItems: "flex-start" }, columnsStacked: { flexDirection: "column", width: "100%" }, fullWidth: { width: "100%", flexGrow: 0, flexBasis: "auto" }, trendCard: { flex: 1.45 }, collectionCard: { flex: 1, minWidth: 300 }, sectionHeading: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 12, marginBottom: 12 }, sectionTitle: { fontSize: 19 }, chart: { gap: 12, marginTop: 6 }, chartRow: { flexDirection: "row", alignItems: "center", gap: 10 }, mobileTrendRow: { minHeight: 38, justifyContent: "center", borderBottomWidth: 1, borderBottomColor: colors.line }, chartLabel: { width: 68, fontSize: 12, color: colors.muted }, barTrack: { flex: 1, minWidth: 80, height: 12, borderRadius: 6, backgroundColor: colors.orangeSoft, overflow: "hidden" }, bar: { height: "100%", backgroundColor: colors.orange, borderRadius: 6 }, chartValue: { width: 92, textAlign: "right", fontSize: 12 }, collectionRow: { minHeight: 60, flexDirection: "row", alignItems: "center", gap: 10, borderBottomWidth: 1, borderBottomColor: colors.line }, collectionIcon: { width: 38, height: 38, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: colors.orangeSoft }, collectionTotal: { flexDirection: "row", justifyContent: "space-between", gap: 12, paddingTop: 16 }, collectionTotalCompact: { flexDirection: "column", gap: 4 }, ordersCard: { marginTop: 16, paddingBottom: 8 }, tableHeader: { minHeight: 42, flexDirection: "row", alignItems: "center", borderBottomWidth: 1, borderBottomColor: colors.border }, tableRow: { minHeight: 68, flexDirection: "row", alignItems: "center", borderBottomWidth: 1, borderBottomColor: colors.line }, tableCell: { flex: 1, minWidth: 100, color: colors.muted, fontSize: 12, paddingHorizontal: 6 }, tableCellWide: { flex: 1.35, minWidth: 140 }, tableCellWrap: { flex: 1, minWidth: 100, paddingHorizontal: 6 }, orderCardRow: { paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: colors.line, gap: 12 }, orderTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }, orderAmounts: { flexDirection: "row", flexWrap: "wrap", gap: 8 }, orderAmountsCompact: { flexDirection: "column", flexWrap: "nowrap" }, amount: { flex: 1, minWidth: 96, gap: 3 }, pagination: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 12, paddingTop: 14 }, pageButtons: { flexDirection: "row", flexWrap: "wrap", gap: 8 }, statePanel: { minHeight: 380, alignItems: "center", justifyContent: "center", gap: 12, padding: 28 },
});

const adminStyles = StyleSheet.create({
  shell: { flex: 1, minHeight: "100%", flexDirection: "row", backgroundColor: "#F5F7FB" }, sidebar: { width: 250, backgroundColor: colors.ink, padding: 20, gap: 7 }, brand: { flexDirection: "row", alignItems: "center", gap: 11, marginBottom: 26 }, brandMark: { width: 40, height: 40, borderRadius: 13, backgroundColor: colors.orange, alignItems: "center", justifyContent: "center" }, sideMuted: { color: "#8E99AD", fontSize: 12 }, sideActive: { minHeight: 46, borderRadius: radius.md, paddingHorizontal: 12, flexDirection: "row", alignItems: "center", gap: 11, backgroundColor: colors.orange }, sideLink: { minHeight: 46, paddingHorizontal: 12, flexDirection: "row", alignItems: "center", gap: 11 }, sideText: { color: "#AEB7C8" }, main: { flex: 1, width: 0, minWidth: 0 }, topbar: { minHeight: 72, paddingHorizontal: 18, backgroundColor: colors.white, borderBottomWidth: 1, borderBottomColor: colors.border, flexDirection: "row", alignItems: "center", gap: 12 }, topButton: { width: 42, height: 42, flexShrink: 0, borderRadius: 13, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.border }, topbarTitle: { flexGrow: 1, flexShrink: 1, flexBasis: 0, minWidth: 0 }, language: { minHeight: 42, flexShrink: 0, marginLeft: "auto", paddingHorizontal: 12, borderRadius: 13, flexDirection: "row", alignItems: "center", gap: 7, borderWidth: 1, borderColor: colors.border }, page: { width: "100%", maxWidth: 1420, alignSelf: "center", padding: 28, paddingBottom: 60 }, pageCompact: { padding: 16 }, header: { flexDirection: "row", flexWrap: "wrap", alignItems: "flex-start", justifyContent: "space-between", gap: 14, marginBottom: 20 }, stateLabel: { color: colors.muted, fontSize: 10, letterSpacing: 1, marginBottom: 8 }, stateRow: { flexDirection: "row", flexWrap: "wrap", gap: 7, marginBottom: 18 }, primaryColumn: { flex: 1.35, minWidth: 0, gap: 14 }, currentCard: { gap: 9 }, rate: { fontSize: 34 }, rateIcon: { width: 48, height: 48, borderRadius: 16, alignItems: "center", justifyContent: "center", backgroundColor: colors.orangeSoft }, scheduledCard: { gap: 7, backgroundColor: colors.blueSoft, borderColor: "#D9E5FF" }, scheduledRate: { fontSize: 29, color: colors.blue }, formRow: { flexDirection: "row", gap: 12 }, formStack: { flexDirection: "column" }, actions: { flexDirection: "row", flexWrap: "wrap", justifyContent: "flex-end", gap: 9 }, actionsMobile: { justifyContent: "flex-start" }, historyCard: { flex: 0.8, minWidth: 320 }, historyRow: { flexDirection: "row", gap: 10 }, timeline: { width: 18, alignItems: "center" }, timelineDot: { width: 11, height: 11, borderRadius: 6, backgroundColor: colors.mutedSoft, marginTop: 6 }, timelineLine: { width: 2, flex: 1, backgroundColor: colors.border, marginVertical: 4 }, historyTop: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 8 }, inlineAlert: { flexDirection: "row", alignItems: "flex-start", gap: 9, padding: 13, borderRadius: radius.md, marginBottom: 14 }, confirmRates: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 14 }, rateChange: { minWidth: 120, padding: 14, borderRadius: radius.md, backgroundColor: colors.canvas, alignItems: "center", gap: 4 }, fullWidth: { width: "100%", minWidth: 0, flexGrow: 0, flexBasis: "auto" },
});
