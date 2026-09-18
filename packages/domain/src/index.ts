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
