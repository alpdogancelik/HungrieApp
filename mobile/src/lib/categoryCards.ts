import { images } from "@/constants/mediaCatalog";

export const CATEGORY_CARDS = [
    { id: "doner", searchKey: "doner", tr: "Döner", en: "Doner", image: images.categoryKebab },
    { id: "burger", searchKey: "burger", tr: "Burger", en: "Burger", image: images.categoryBurger },
    { id: "pizza", searchKey: "pizza", tr: "Pizza", en: "Pizza", image: images.categoryPizza },
    { id: "kebap", searchKey: "kebap", tr: "Kebap", en: "Kebab", image: images.categoryKebab },
    { id: "durum", searchKey: "durum", tr: "Dürüm", en: "Wraps", image: images.categoryDurum },
    { id: "izgara", searchKey: "izgara", tr: "Izgaralar", en: "Grills", image: images.categoryGrills },
    { id: "kahve", searchKey: "kahve", tr: "Kahve", en: "Coffee", image: images.categoryCoffee },
    { id: "lahmacun", searchKey: "lahmacun", tr: "Lahmacun", en: "Lahmacun", image: images.categoryLahmacun },
    { id: "tatli", searchKey: "tatli", tr: "Tatlı", en: "Desserts", image: images.categoryDessert },
    { id: "salata", searchKey: "salata", tr: "Salatalar", en: "Salads", image: images.categorySalad },
    { id: "makarna", searchKey: "makarna", tr: "Makarnalar", en: "Pasta", image: images.categoryPasta },
    { id: "icecek", searchKey: "icecek", tr: "İçecekler", en: "Drinks", image: images.categoryDrinks },
    { id: "tavuk", searchKey: "tavuk", tr: "Tavuk", en: "Chicken", image: images.categoryChicken },
    { id: "sos", searchKey: "sos", tr: "Soslar", en: "Sauces", image: images.categorySauces },
] as const;
