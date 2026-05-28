// NOTE: This file expects local asset files under ./assets.

// Iconset (SVG)
import ArrowBackIcon from "@/assets/iconset/Left 1.svg";
import ArrowDownIcon from "@/assets/iconset/Down 1.svg";
import SearchIcon from "@/assets/iconset/search 1.svg";
import BagIcon from "@/assets/iconset/bag-04.svg";
import ShopIcon from "@/assets/iconset/shop.svg";
import HomeIcon from "@/assets/iconset/home 5.svg";
import ProfileIcon from "@/assets/iconset/profile.svg";
import LocationIcon from "@/assets/iconset/location 2.svg";
import MinusIcon from "@/assets/iconset/Minus 1.svg";
import PlusIcon from "@/assets/iconset/Plus 1.svg";
import TrashIcon from "@/assets/iconset/delete 1.svg";
import StarIcon from "@/assets/iconset/Star 1.svg";
import ClockIcon from "@/assets/iconset/Clock.svg";
import DollarIcon from "@/assets/iconset/currency-dollar-cricle.svg";
import CheckIcon from "@/assets/iconset/check.svg";
import MenuIcon from "@/assets/iconset/menu 2.svg";
import EditIcon from "@/assets/iconset/edit 2.svg";
import PhoneIcon from "@/assets/iconset/Phone.svg";
import MailIcon from "@/assets/iconset/Mail-.svg";
import LogoutIcon from "@/assets/iconset/Log Out 1.svg";
import CloseIcon from "@/assets/iconset/cancel.svg";

// Cooking SVG scenes
import studyFuel from "@/assets/cooking/studyfuel.svg";
import pizzaCook from "@/assets/cooking/pizzacook.svg";
import orderAccept from "@/assets/cooking/orderaccept3.svg";
import badOrder from "@/assets/cooking/BadOrder.svg";

// Illustration SVGs
import DeliveryGuy from "@/assets/illustrations/Delivery Guy.svg";
import DeliveryLocation from "@/assets/illustrations/Delivery Location.svg";
import FoodDeliveryHero from "@/assets/illustrations/Food Delivery.svg";
import MealOrder from "@/assets/illustrations/Meal Order.svg";
import DroneDelivery from "@/assets/illustrations/Drone Delivery.svg";
import EatingNoodles from "@/assets/illustrations/Eating Noodles.svg";
import MakingPizza from "@/assets/illustrations/Making Pizza.svg";
import MenuBoard from "@/assets/illustrations/Menu Board.svg";
import Rider from "@/assets/illustrations/Rider.svg";
import TastingFood from "@/assets/illustrations/Tasting Food.svg";

// Lifestyle imagery (all files currently available inside assets/images)
import burgerDeliveryImage from "@/assets/images/Burger Delivery.png";
import emptyStateImage from "@/assets/images/empty-state.png";
import foodDeliveryBagImage from "@/assets/images/Food Delivery Bag.png";
import foodDeliveryMessageImage from "@/assets/images/Food Delivery Message.png";
import foodOrderImage from "@/assets/images/Food Order.png";
import foodReviewImage from "@/assets/images/Food Review.png";
import deliveryBagImage from "@/assets/images/Delivery Bag.png";
import deliveryProcessImage from "@/assets/images/Delivery Process.png";
import deliveryReviewImage from "@/assets/images/Delivery Review.png";
import orderBillImage from "@/assets/images/Order Bill.png";
import view3dBurgerImage from "@/assets/images/view-3d-burger-meal-with-french-fries.jpg";
import flatLayBurgerImage from "@/assets/images/flat-lay-burger-with-fries-ketchup.jpg";
import lifestyleOneImage from "@/assets/images/1.jpeg";
import vecteezyFastFoodImage from "@/assets/images/vecteezy_fast-food-meal-with_25065315.png";
import successImage from "@/assets/images/success.png";
import deliveryLocationImage from "@/assets/images/Delivery Location.png";

// Category imagery
import categoryBurgerImage from "@/assets/Categories/Burger1.jpg";
import categoryDurumImage from "@/assets/Categories/Durum1.jpg";
import categoryDrinksImage from "@/assets/Categories/Icecekler1.jpg";
import categoryGrillsImage from "@/assets/Categories/Izgaralar1.jpg";
import categoryCoffeeImage from "@/assets/Categories/Kahveler1.jpg";
import categoryKebabImage from "@/assets/Categories/Kebap1.jpg";
import categoryLahmacunImage from "@/assets/Categories/Lahmacun1.jpg";
import categoryPastaImage from "@/assets/Categories/Makarna1.jpg";
import categoryPizzaImage from "@/assets/Categories/Pizza1.jpg";
import categorySaladImage from "@/assets/Categories/Salata1.jpg";
import categorySaucesImage from "@/assets/Categories/Soslar1.jpg";
import categoryDessertImage from "@/assets/Categories/Tatli1.jpg";
import categoryChickenImage from "@/assets/Categories/Tavuk1.png";

const avatar = foodDeliveryBagImage;
const avocado = foodOrderImage;
const bacon = burgerDeliveryImage;
const burgerOne = burgerDeliveryImage;
const burgerTwo = burgerDeliveryImage;
const buritto = foodOrderImage;
const coleslaw = foodDeliveryMessageImage;
const cucumber = foodOrderImage;
const emptyState = emptyStateImage;
const fries = foodReviewImage;
const logo = deliveryLocationImage;
const mozarellaSticks = vecteezyFastFoodImage;
const mushrooms = flatLayBurgerImage;
const onionRings = lifestyleOneImage;
const onions = foodOrderImage;
const salad = foodReviewImage;
const success = successImage;
const tomatoes = orderBillImage;

const burgerPoster = burgerDeliveryImage;
const friesPoster = foodReviewImage;
const tacoPoster = foodOrderImage;
const burgerDelivery = burgerDeliveryImage;
const deliveryBag = deliveryBagImage;
const deliveryProcess = deliveryProcessImage;
const deliveryReview = deliveryReviewImage;
const foodReview = foodReviewImage;
const burgerFlatLay = flatLayBurgerImage;
const view3dBurger = view3dBurgerImage;

const categoryBurger = categoryBurgerImage;
const categoryDurum = categoryDurumImage;
const categoryDrinks = categoryDrinksImage;
const categoryGrills = categoryGrillsImage;
const categoryCoffee = categoryCoffeeImage;
const categoryKebab = categoryKebabImage;
const categoryLahmacun = categoryLahmacunImage;
const categoryPasta = categoryPastaImage;
const categoryPizza = categoryPizzaImage;
const categorySalad = categorySaladImage;
const categorySauces = categorySaucesImage;
const categoryDessert = categoryDessertImage;
const categoryChicken = categoryChickenImage;

export const iconset = {
    arrowBack: ArrowBackIcon,
    arrowDown: ArrowDownIcon,
    search: SearchIcon,
    searchTab: MenuIcon,
    bag: BagIcon,
    cart: ShopIcon,
    home: HomeIcon,
    profile: ProfileIcon,
    location: LocationIcon,
    minus: MinusIcon,
    plus: PlusIcon,
    trash: TrashIcon,
    star: StarIcon,
    clock: ClockIcon,
    dollar: DollarIcon,
    check: CheckIcon,
    pencil: EditIcon,
    phone: PhoneIcon,
    envelope: MailIcon,
    logout: LogoutIcon,
    close: CloseIcon,
} as const;

export const cookingScenes = {
    studyFuel,
    pizzaCook,
    orderAccepted: orderAccept,
    kitchenRush: badOrder,
} as const;

export const illustrations = {
    courierHero: DeliveryGuy,
    tracking: DeliveryLocation,
    foodieCelebration: FoodDeliveryHero,
    mealPrep: MealOrder,
    droneDelivery: DroneDelivery,
    eatingNoodles: EatingNoodles,
    makingPizza: MakingPizza,
    mealOrder: MealOrder,
    menuBoard: MenuBoard,
    rider: Rider,
    tastingFood: TastingFood,
} as const;

export const images = {
    avatar,
    avocado,
    bacon,
    burgerOne,
    burgerTwo,
    buritto,
    coleslaw,
    cucumber,
    emptyState,
    fries,
    logo,
    mozarellaSticks,
    mushrooms,
    onionRings,
    onions,
    salad,
    success,
    tomatoes,
    burgerPoster,
    friesPoster,
    tacoPoster,
    burgerDelivery,
    deliveryBag,
    deliveryProcess,
    deliveryReview,
    foodReview,
    burgerFlatLay,
    view3dBurger,
    categoryBurger,
    categoryDurum,
    categoryDrinks,
    categoryGrills,
    categoryCoffee,
    categoryKebab,
    categoryLahmacun,
    categoryPasta,
    categoryPizza,
    categorySalad,
    categorySauces,
    categoryDessert,
    categoryChicken,
} as const;

export const CATEGORIES = [
    { id: "all", name: "All", icon: logo },
    { id: "burger", name: "Burger", icon: burgerOne },
    { id: "pizza", name: "Pizza", icon: categoryPizza },
    { id: "wrap", name: "Wrap", icon: buritto },
    { id: "bowl", name: "Bowl", icon: salad },
] as const;
