export type SupportedLocale = "en" | "tr";

const CATEGORY_LABELS: Record<string, { en: string; tr: string }> = {
    burgers: { en: "Burgers", tr: "Burgerler" },
    burger: { en: "Burgers", tr: "Burgerler" },
    wraps: { en: "Wraps", tr: "Dürümler" },
    durumler: { en: "Wraps", tr: "Dürümler" },
    durum: { en: "Wraps", tr: "Dürümler" },
    "pizza-wraps": { en: "Pizza Wraps", tr: "Pizza Wrap" },
    pizza: { en: "Pizzas", tr: "Pizzalar" },
    pizzas: { en: "Pizzas", tr: "Pizzalar" },
    pide: { en: "Pide", tr: "Pideler" },
    mains: { en: "Mains", tr: "Ana Yemekler" },
    main: { en: "Mains", tr: "Ana Yemekler" },
    pan: { en: "Mains", tr: "Ana Yemekler" },
    grill: { en: "Grills", tr: "Izgaralar" },
    grills: { en: "Grills", tr: "Izgaralar" },
    chicken: { en: "Chicken", tr: "Tavuk Yemekleri" },
    pasta: { en: "Pasta", tr: "Makarnalar" },
    tenders: { en: "Tenders", tr: "Tenders" },
    salads: { en: "Salads", tr: "Salatalar" },
    salad: { en: "Salads", tr: "Salatalar" },
    sides: { en: "Sides", tr: "Yan Ürünler" },
    extras: { en: "Extras", tr: "Ekstralar" },
    snacks: { en: "Snacks", tr: "Atıştırmalıklar" },
    crispy: { en: "Crispy Bites", tr: "Çıtır Lezzetler" },
    bowls: { en: "Bowls", tr: "Bowls" },
    chips: { en: "Chips / Fries", tr: "Chips / Patates" },
    sauces: { en: "Sauces", tr: "Soslar" },
    drinks: { en: "Drinks", tr: "İçecekler" },
    "cold-drinks": { en: "Cold Drinks", tr: "Soğuk İçecekler" },
    "hot-drinks": { en: "Hot Drinks", tr: "Sıcak İçecekler" },
    drinks_cold: { en: "Cold Drinks", tr: "Soğuk İçecekler" },
    drinks_hot: { en: "Hot Drinks", tr: "Sıcak İçecekler" },
    toast: { en: "Toasts & Sandwiches", tr: "Tost / Sandviç" },
    gozleme: { en: "Gözleme", tr: "Gözlemeler" },
    soups: { en: "Starters", tr: "Aperatifler" },
    cigkofte: { en: "Çiğ Köfte", tr: "Çiğ Köfte" },
    "burger-extras": { en: "Burger Extras", tr: "Burger Ekstralar" },
    "fast-food": { en: "Fast Food", tr: "Fast Food Menüler" },
    diet: { en: "Diet", tr: "Diyet Menüler" },
    seafood: { en: "Seafood", tr: "Deniz Ürünleri" },
};

const titleCase = (value: string) =>
    value
        .replace(/[_-]+/g, " ")
        .replace(/\b\w/g, (c) => c.toUpperCase());

export const getCategoryLabel = (key: string, locale: SupportedLocale = "en") => {
    const normalized = key?.toLowerCase?.() ?? key;
    const mapping = CATEGORY_LABELS[normalized];
    if (mapping) {
        return mapping[locale] ?? mapping.en ?? mapping.tr;
    }
    return titleCase(key);
};
