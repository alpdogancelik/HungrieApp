export type EarningsRange = "day" | "week" | "month" | "custom";

export interface EarningsSummaryFixture {
  range: EarningsRange;
  fromUtc: string;
  toUtc: string;
  timezone: "Asia/Famagusta";
  eligibleGrossKurus: number;
  commissionKurus: number;
  estimatedNetKurus: number;
  deliveredOrderCount: number;
  cashKurus: number;
  posKurus: number;
}

export interface EarningsSeriesFixture {
  labelEn: string;
  labelTr: string;
  eligibleGrossKurus: number;
  commissionKurus: number;
  estimatedNetKurus: number;
}

export interface EarningsOrderFixture {
  orderReference: string;
  deliveredAtUtc: string;
  deliveredLabelEn: string;
  deliveredLabelTr: string;
  paymentMethod: "cash" | "pos";
  eligibleGrossKurus: number;
  commissionRateBps: number;
  commissionKurus: number;
  estimatedNetKurus: number;
}

export interface CommissionRuleFixture {
  id: string;
  rateBps: number;
  effectiveFromUtc: string;
  createdAtUtc: string;
  reasonEn: string;
  reasonTr: string;
  status: "current" | "scheduled" | "superseded";
}

// These are explicit stand-ins for guarded database responses. The UI never derives
// authoritative financial values from menu or Restaurant configuration data.
export const earningsSummaries: Record<EarningsRange, EarningsSummaryFixture> = {
  day: { range: "day", fromUtc: "2026-09-22T00:00:00Z", toUtc: "2026-09-23T00:00:00Z", timezone: "Asia/Famagusta", eligibleGrossKurus: 124000, commissionKurus: 9920, estimatedNetKurus: 114080, deliveredOrderCount: 8, cashKurus: 46500, posKurus: 77500 },
  week: { range: "week", fromUtc: "2026-09-16T00:00:00Z", toUtc: "2026-09-23T00:00:00Z", timezone: "Asia/Famagusta", eligibleGrossKurus: 743500, commissionKurus: 59480, estimatedNetKurus: 684020, deliveredOrderCount: 47, cashKurus: 286000, posKurus: 457500 },
  month: { range: "month", fromUtc: "2026-09-01T00:00:00Z", toUtc: "2026-10-01T00:00:00Z", timezone: "Asia/Famagusta", eligibleGrossKurus: 2948000, commissionKurus: 235840, estimatedNetKurus: 2712160, deliveredOrderCount: 182, cashKurus: 1116500, posKurus: 1831500 },
  custom: { range: "custom", fromUtc: "2026-09-08T00:00:00Z", toUtc: "2026-09-22T00:00:00Z", timezone: "Asia/Famagusta", eligibleGrossKurus: 1423400, commissionKurus: 113872, estimatedNetKurus: 1309528, deliveredOrderCount: 91, cashKurus: 528400, posKurus: 895000 },
};

export const monthlyEarningsSeries: EarningsSeriesFixture[] = [
  { labelEn: "1–6 Sep", labelTr: "1–6 Eyl", eligibleGrossKurus: 450000, commissionKurus: 36000, estimatedNetKurus: 414000 },
  { labelEn: "7–12 Sep", labelTr: "7–12 Eyl", eligibleGrossKurus: 520000, commissionKurus: 41600, estimatedNetKurus: 478400 },
  { labelEn: "13–18 Sep", labelTr: "13–18 Eyl", eligibleGrossKurus: 600000, commissionKurus: 48000, estimatedNetKurus: 552000 },
  { labelEn: "19–24 Sep", labelTr: "19–24 Eyl", eligibleGrossKurus: 700000, commissionKurus: 56000, estimatedNetKurus: 644000 },
  { labelEn: "25–30 Sep", labelTr: "25–30 Eyl", eligibleGrossKurus: 678000, commissionKurus: 54240, estimatedNetKurus: 623760 },
];

export const earningsOrderPages: EarningsOrderFixture[][] = [
  [
    { orderReference: "#7F31A2C9", deliveredAtUtc: "2026-09-22T15:42:00Z", deliveredLabelEn: "22 Sep · 18:42", deliveredLabelTr: "22 Eyl · 18:42", paymentMethod: "pos", eligibleGrossKurus: 68500, commissionRateBps: 800, commissionKurus: 5480, estimatedNetKurus: 63020 },
    { orderReference: "#D2B9E410", deliveredAtUtc: "2026-09-22T13:18:00Z", deliveredLabelEn: "22 Sep · 16:18", deliveredLabelTr: "22 Eyl · 16:18", paymentMethod: "cash", eligibleGrossKurus: 42000, commissionRateBps: 800, commissionKurus: 3360, estimatedNetKurus: 38640 },
    { orderReference: "#91C44B08", deliveredAtUtc: "2026-09-22T10:06:00Z", deliveredLabelEn: "22 Sep · 13:06", deliveredLabelTr: "22 Eyl · 13:06", paymentMethod: "pos", eligibleGrossKurus: 13500, commissionRateBps: 800, commissionKurus: 1080, estimatedNetKurus: 12420 },
  ],
  [
    { orderReference: "#A48D019E", deliveredAtUtc: "2026-09-21T17:33:00Z", deliveredLabelEn: "21 Sep · 20:33", deliveredLabelTr: "21 Eyl · 20:33", paymentMethod: "cash", eligibleGrossKurus: 89000, commissionRateBps: 800, commissionKurus: 7120, estimatedNetKurus: 81880 },
    { orderReference: "#3C74F126", deliveredAtUtc: "2026-09-21T14:11:00Z", deliveredLabelEn: "21 Sep · 17:11", deliveredLabelTr: "21 Eyl · 17:11", paymentMethod: "pos", eligibleGrossKurus: 56000, commissionRateBps: 800, commissionKurus: 4480, estimatedNetKurus: 51520 },
    { orderReference: "#E8A211D0", deliveredAtUtc: "2026-09-21T09:47:00Z", deliveredLabelEn: "21 Sep · 12:47", deliveredLabelTr: "21 Eyl · 12:47", paymentMethod: "pos", eligibleGrossKurus: 104000, commissionRateBps: 800, commissionKurus: 8320, estimatedNetKurus: 95680 },
  ],
];

export const commissionRules: CommissionRuleFixture[] = [
  { id: "rule-scheduled", rateBps: 950, effectiveFromUtc: "2026-10-01T06:00:00Z", createdAtUtc: "2026-09-22T08:15:00Z", reasonEn: "Autumn commercial agreement", reasonTr: "Sonbahar ticari anlaşması", status: "scheduled" },
  { id: "rule-current", rateBps: 800, effectiveFromUtc: "2026-08-01T00:00:00Z", createdAtUtc: "2026-07-28T11:30:00Z", reasonEn: "Pilot launch rate", reasonTr: "Pilot başlangıç oranı", status: "current" },
  { id: "rule-previous", rateBps: 500, effectiveFromUtc: "2026-06-01T00:00:00Z", createdAtUtc: "2026-05-25T09:05:00Z", reasonEn: "Initial test agreement", reasonTr: "İlk test anlaşması", status: "superseded" },
];
