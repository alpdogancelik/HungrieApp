import * as firebaseMenuItemReviews from "@/src/services/menuItemReviews";
import * as firebaseOrderReviews from "@/src/services/orderReviews";
import { selectRepository } from "./backendFlags";
import type { ReviewRepository } from "./contracts";
import { supabaseReviewRepository } from "./supabase/reviewRepository";

const firebaseReviewRepository: ReviewRepository = {
    ...firebaseMenuItemReviews,
    ...firebaseOrderReviews,
    moderateMenuItemReview: async (input) => {
        await firebaseMenuItemReviews.moderateMenuItemReview(input);
    },
    saveMenuItemReviewReply: async (reviewId, reply) => {
        await firebaseMenuItemReviews.saveMenuItemReviewReply(reviewId, reply);
    },
};

export const reviewRepository = selectRepository<ReviewRepository>("review", {
    firebase: firebaseReviewRepository,
    supabase: supabaseReviewRepository,
});

export const fetchMenuItemReviews = reviewRepository.fetchMenuItemReviews;
export const fetchRestaurantReviews = reviewRepository.fetchRestaurantReviews;
export const fetchRestaurantReviewSummary = reviewRepository.fetchRestaurantReviewSummary;
export const fetchUserReviews = reviewRepository.fetchUserReviews;
export const fetchReviewedMenuItemIdsForOrder = reviewRepository.fetchReviewedMenuItemIdsForOrder;
export const subscribeUserReviews = reviewRepository.subscribeUserReviews;
export const submitMenuItemReview = reviewRepository.submitMenuItemReview;
export const moderateMenuItemReview = reviewRepository.moderateMenuItemReview;
export const saveMenuItemReviewReply = reviewRepository.saveMenuItemReviewReply;
export const submitOrderReview = reviewRepository.submitOrderReview;
export const fetchOrderReviewByOrder = reviewRepository.fetchOrderReviewByOrder;
export const fetchUserOrderReviews = reviewRepository.fetchUserOrderReviews;
export const fetchRestaurantOrderReviews = reviewRepository.fetchRestaurantOrderReviews;
export const calculateRestaurantOrderReviewSummary = reviewRepository.calculateRestaurantOrderReviewSummary;
export const fetchRestaurantOrderReviewSummary = reviewRepository.fetchRestaurantOrderReviewSummary;
export const moderateOrderReview = reviewRepository.moderateOrderReview;
