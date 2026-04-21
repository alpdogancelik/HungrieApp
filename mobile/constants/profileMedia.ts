import DeliveryGuy from "@/assets/illustrations/Delivery Guy.svg";
import DeliveryLocation from "@/assets/illustrations/Delivery Location.svg";
import FoodDeliveryHero from "@/assets/illustrations/Food Delivery.svg";

import deliveryReviewImage from "@/assets/images/Delivery Review.png";

export const profileIllustrations = {
    courierHero: DeliveryGuy,
    tracking: DeliveryLocation,
    foodieCelebration: FoodDeliveryHero,
} as const;

export const profileImages = {
    deliveryReview: deliveryReviewImage,
} as const;
