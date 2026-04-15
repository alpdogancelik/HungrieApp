import DeliveryGuy from "@/assets/illustrations/Delivery Guy.svg";
import DeliveryLocation from "@/assets/illustrations/Delivery Location.svg";
import FoodDeliveryHero from "@/assets/illustrations/Food Delivery.svg";

import beamingEmoji from "@/assets/emoji/Beaming Face with Smiling Eyes.png";
import cryingEmoji from "@/assets/emoji/Crying Face.png";
import explodingEmoji from "@/assets/emoji/Exploding Head.png";
import kissEmoji from "@/assets/emoji/Face Blowing a Kiss.png";
import savoringEmoji from "@/assets/emoji/Face Savoring Food.png";
import screamingEmoji from "@/assets/emoji/Face Screaming in Fear.png";
import crossedEyesEmoji from "@/assets/emoji/Face with Crossed-Out Eyes.png";
import handOverMouthEmoji from "@/assets/emoji/Face with Hand Over Mouth.png";
import raisedEyebrowEmoji from "@/assets/emoji/Face with Raised Eyebrow.png";
import nerdEmoji from "@/assets/emoji/Nerd Face.png";
import pleadingEmoji from "@/assets/emoji/Pleading Face.png";
import shushingEmoji from "@/assets/emoji/Shushing Face.png";
import heartEyesEmoji from "@/assets/emoji/Smiling Face with Heart-Eyes.png";

import deliveryReviewImage from "@/assets/images/Delivery Review.png";

export const profileIllustrations = {
    courierHero: DeliveryGuy,
    tracking: DeliveryLocation,
    foodieCelebration: FoodDeliveryHero,
} as const;

export const profileEmojiSet = {
    beaming: beamingEmoji,
    crying: cryingEmoji,
    kiss: kissEmoji,
    savoring: savoringEmoji,
    heartEyes: heartEyesEmoji,
    nerd: nerdEmoji,
    exploding: explodingEmoji,
    screaming: screamingEmoji,
    crossedEyes: crossedEyesEmoji,
    handOverMouth: handOverMouthEmoji,
    raisedEyebrow: raisedEyebrowEmoji,
    pleading: pleadingEmoji,
    shushing: shushingEmoji,
} as const;

export const profileImages = {
    deliveryReview: deliveryReviewImage,
} as const;
