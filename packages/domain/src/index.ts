/** Shared identifiers only. They do not grant access to an application. */
export const PORTAL_IDS = ["customer", "restaurant", "admin"] as const;

export type PortalId = (typeof PORTAL_IDS)[number];
export type AccountType = PortalId;

export type AccountStatus = "pending" | "active" | "suspended" | "revoked";
export type AdminRole = "admin" | "super_admin";
export type RestaurantRole = "owner" | "manager";
export type RestaurantLifecycleStatus = "pending" | "active" | "suspended" | "closed";

export type AccessContext =
  | { state: "unmapped" }
  | { state: "configuration_error"; referenceId: string }
  | { state: "resolved"; profileId: string; accountType: "customer"; accountStatus: Exclude<AccountStatus,"pending">; onboardingStep: "none" }
  | { state: "resolved"; profileId: string; accountType: "restaurant"; accountStatus: AccountStatus; onboardingStep: "restaurant_approval_required"|"none"; restaurantId: string; restaurantRole: RestaurantRole; restaurantStatus: RestaurantLifecycleStatus; acceptingOrders: boolean }
  | { state: "resolved"; profileId: string; accountType: "admin"; accountStatus: AccountStatus; onboardingStep: "admin_mfa_enrollment_required"|"admin_mfa_sign_in_required"|"none"; adminRole: AdminRole; emailVerified: boolean; currentSessionMfaVerified: boolean };

export type AdminPage<T> = { items: T[]; total: number; limit: number; offset: number };

export type ReviewRating = 1 | 2 | 3 | 4 | 5;
export type MealReaction = "liked" | "disliked";
export type ReviewVisibility = "published" | "hidden";
export type ReviewReportReason = "spam" | "abusive_content" | "personal_information" | "not_related_to_order" | "suspected_fraud" | "other";
export type ReviewReportStatus = "open" | "resolved" | "dismissed";
export type ReviewContractVersion = 1 | 2;

export type ReviewItemSnapshot = {
  menuItemId: string;
  name: string;
  quantity: number;
};

export type CustomerReviewDraft = {
  orderId: string;
  restaurantId: string;
  tasteRating: ReviewRating;
  speedRating: ReviewRating;
  comment?: string;
  mealReactions: Array<{ menuItemId: string; reaction: MealReaction }>;
};

export type CustomerReviewSubmissionResult = { reviewId: string; replayed: boolean };

export type CustomerSubmittedReview = {
  reviewId: string;
  tasteRating: ReviewRating;
  speedRating: ReviewRating;
  overallRating: number;
  comment: string;
  items: ReviewItemSnapshot[];
  status: ReviewVisibility;
  createdAt: string;
};

export type CustomerOrderReviewState = {
  orderId: string;
  reviewed: boolean;
  eligible: boolean;
  expiresAt: string | null;
  review: CustomerSubmittedReview | null;
};

export type CustomerReviewPrompt = {
  orderId: string;
  restaurantId: string;
  restaurantName: string;
  deliveredAt: string;
  expiresAt: string;
  items: ReviewItemSnapshot[];
};

export type RestaurantReviewSummaryV2 = {
  restaurantId: string;
  overallRating: number | null;
  tasteRating: number | null;
  speedRating: number | null;
  reviewCount: number;
};

export type PublicRestaurantReview = {
  reviewId: string;
  overallRating: number;
  tasteRating: ReviewRating;
  speedRating: ReviewRating;
  comment: string;
  items: ReviewItemSnapshot[];
  date: string;
};

export type CursorPage<T> = { items: T[]; nextCursor: string | null; limit: number };

export type RestaurantReviewReportSummary = {
  reportId: string;
  reason: ReviewReportReason;
  status: ReviewReportStatus;
  createdAt: string;
};

export type RestaurantReviewQueueItem = Omit<PublicRestaurantReview, "date"> & {
  status: ReviewVisibility;
  createdAt: string;
  report: RestaurantReviewReportSummary | null;
};

export type MenuItemReactionAggregate = {
  menuItemId: string;
  menuItemName: string;
  likedCount: number;
  dislikedCount: number;
  positivePercentage: number;
};

export type RestaurantReportResult = { reportId: string; reviewId: string; status: "open" };

export type AdminReviewReport = {
  reportId: string;
  reviewId: string;
  restaurantId: string;
  reason: ReviewReportReason;
  internalNote: string | null;
  reportStatus: ReviewReportStatus;
  resolutionNote: string | null;
  reportCreatedAt: string;
  review: Omit<RestaurantReviewQueueItem, "reviewId" | "report"> & { contractVersion: ReviewContractVersion };
};

export type AdminReviewAuditEntry = {
  auditId: string;
  actorProfileId: string | null;
  action: "order_review.reported_v2" | "order_review.report_status_changed_v2" | "order_review.visibility_changed_v2";
  targetType: "order_review" | "order_review_report";
  targetId: string;
  contractVersion: ReviewContractVersion;
  restaurantId: string;
  operationId: string | null;
  priorState: string | null;
  newState: string | null;
  reportReason: ReviewReportReason | null;
  moderationReason: string | null;
  createdAt: string;
};

export type ReviewReportTransitionResult = { reportId: string; status: ReviewReportStatus };
export type ReviewVisibilityResult = { reviewId: string; status: ReviewVisibility };

export type ReviewRepositoryErrorCode =
  | "session_expired"
  | "account_inactive"
  | "order_unavailable"
  | "review_expired"
  | "already_reviewed"
  | "invalid_reaction_item"
  | "operation_conflict"
  | "validation"
  | "service_unavailable"
  | "unknown";

export type ReviewManagementErrorCode =
  | "session_expired"
  | "account_inactive"
  | "recent_auth_required"
  | "duplicate_report"
  | "invalid_transition"
  | "operation_conflict"
  | "validation"
  | "service_unavailable"
  | "unknown";

/** Integer minor currency units returned by authoritative financial RPCs. */
export type Kurus = number;
/** Integer hundredths of one percent; 100 basis points equals 1.00%. */
export type BasisPoints = number;
export type CommissionContractVersion = 1;
export type EarningsPaymentMethod = "cash" | "pos";
export type EarningsSeriesBucket = "day" | "week" | "month";

export type RestaurantCommissionRuleV1 = {
  id: string;
  rateBps: BasisPoints;
  contractVersion: CommissionContractVersion;
  effectiveFrom: string;
  createdAt: string;
  reason: string;
};

export type RestaurantFinancialWarningV1 = {
  id: string;
  type:
    | "missing_applicable_rule"
    | "missing_order_terms"
    | "missing_delivered_snapshot"
    | "snapshot_mismatch";
  details: { orderReference?: string };
  firstDetectedAt: string;
  lastDetectedAt: string;
  occurrenceCount: number;
};

export type AdminRestaurantCommissionV1 = {
  restaurantId: string;
  reportingTimezone: string;
  capabilityEnabled: boolean;
  currentRule: RestaurantCommissionRuleV1 | null;
  nextScheduledRule: RestaurantCommissionRuleV1 | null;
  history: RestaurantCommissionRuleV1[];
  historyHasMore: boolean;
  warnings: RestaurantFinancialWarningV1[];
};

export type ScheduleRestaurantCommissionResultV1 = {
  ruleId: string;
  restaurantId: string;
  rateBps: BasisPoints;
  contractVersion: CommissionContractVersion;
  effectiveFrom: string;
  reason: string;
  operationId: string;
  replayed: boolean;
};

export type VirtualPosCommissionRuleV1 = {
  id: string;
  rateBps: BasisPoints;
  financialContractVersion: 1;
  providerContractVersion: string;
  effectiveFrom: string;
  createdAt: string;
  reason: string;
};

export type AdminVirtualPosFoundationV1 = {
  restaurantId: string;
  activationState: "unconfigured" | "sandbox_configured" | "sandbox_qualified" | "production_configured" | "production_qualified" | "active" | "suspended";
  customerAvailable: false;
  providerConfigured: false;
  currentRule: VirtualPosCommissionRuleV1 | null;
  nextScheduledRule: VirtualPosCommissionRuleV1 | null;
  history: VirtualPosCommissionRuleV1[];
  historyHasMore: boolean;
};

export type ScheduleVirtualPosCommissionResultV1 = {
  ruleId: string;
  restaurantId: string;
  rateBps: BasisPoints;
  financialContractVersion: 1;
  providerContractVersion: string;
  effectiveFrom: string;
  reason: string;
  operationId: string;
  replayed: boolean;
};

export type EarningsPaymentBreakdownV1 = {
  eligibleGrossKurus: Kurus;
  commissionKurus: Kurus;
  estimatedNetKurus: Kurus;
  deliveredOrderCount: number;
};

export type RestaurantEarningsSummaryV1 = {
  restaurantId: string;
  from: string;
  to: string;
  reportingTimezone: string;
  currencyCode: "TRY";
  eligibleGrossKurus: Kurus;
  commissionKurus: Kurus;
  estimatedNetKurus: Kurus;
  deliveredOrderCount: number;
  paymentBreakdown: Record<EarningsPaymentMethod, EarningsPaymentBreakdownV1>;
};

export type RestaurantEarningsSeriesPointV1 = {
  bucketStart: string;
  eligibleGrossKurus: Kurus;
  commissionKurus: Kurus;
  estimatedNetKurus: Kurus;
  deliveredOrderCount: number;
  paymentBreakdown: Record<EarningsPaymentMethod, EarningsPaymentBreakdownV1>;
};

export type RestaurantEarningsSeriesV1 = {
  restaurantId: string;
  from: string;
  to: string;
  bucket: EarningsSeriesBucket;
  reportingTimezone: string;
  currencyCode: "TRY";
  points: RestaurantEarningsSeriesPointV1[];
};

export type RestaurantEarningsOrderRowV1 = {
  orderReference: string;
  deliveredAt: string;
  paymentMethod: EarningsPaymentMethod;
  currencyCode: "TRY";
  eligibleGrossKurus: Kurus;
  commissionRateBps: BasisPoints;
  commissionKurus: Kurus;
  estimatedNetKurus: Kurus;
};

export type RestaurantEarningsOrdersPageV1 = {
  restaurantId: string;
  from: string;
  to: string;
  reportingTimezone: string;
  currencyCode: "TRY";
  limit: number;
  items: RestaurantEarningsOrderRowV1[];
  nextCursor: string | null;
};

export type EarningsPaymentMethodV2 = "cash" | "pos" | "virtual_pos";
export type EarningsPaymentBreakdownV2 = {
  eligibleGrossKurus: Kurus;
  hungrieCommissionKurus: Kurus;
  virtualPosCommissionKurus: Kurus;
  totalDeductionsKurus: Kurus;
  estimatedNetKurus: Kurus;
  deliveredOrderCount: number;
};
export type RestaurantEarningsSummaryV2 = {
  restaurantId: string; from: string; to: string; reportingTimezone: string; currencyCode: "TRY";
  eligibleGrossKurus: Kurus; hungrieCommissionKurus: Kurus; virtualPosCommissionKurus: Kurus;
  totalDeductionsKurus: Kurus; estimatedNetKurus: Kurus; deliveredOrderCount: number;
  providerFeesReconciled: false;
  paymentBreakdown: Record<EarningsPaymentMethodV2, EarningsPaymentBreakdownV2>;
};
export type RestaurantEarningsSeriesPointV2 = Omit<EarningsPaymentBreakdownV2, "deliveredOrderCount"> & { bucketStart: string; deliveredOrderCount: number };
export type RestaurantEarningsSeriesV2 = {
  restaurantId: string; from: string; to: string; bucket: EarningsSeriesBucket; reportingTimezone: string; currencyCode: "TRY";
  points: RestaurantEarningsSeriesPointV2[];
};
export type RestaurantEarningsOrderRowV2 = {
  orderReference: string; deliveredAt: string; paymentMethod: EarningsPaymentMethodV2; currencyCode: "TRY";
  eligibleGrossKurus: Kurus; hungrieRateBps: BasisPoints; hungrieCommissionKurus: Kurus;
  virtualPosRateBps: BasisPoints; virtualPosCommissionKurus: Kurus; totalDeductionsKurus: Kurus;
  estimatedNetKurus: Kurus; providerFeesReconciled: false;
};
export type RestaurantEarningsOrdersPageV2 = {
  restaurantId: string; from: string; to: string; reportingTimezone: string; currencyCode: "TRY";
  limit: number; items: RestaurantEarningsOrderRowV2[]; nextCursor: string | null;
};

export * from "./virtualPos";
