export type SupportedLocale = "en" | "tr";

type LocalizedLabel = Record<SupportedLocale, string>;

type CategoryRule = {
    key: string;
    aliases: string[];
};

const TURKISH_CHAR_MAP: Record<string, string> = {
    ı: "i",
    İ: "i",
    ç: "c",
    Ç: "c",
    ğ: "g",
    Ğ: "g",
    ö: "o",
    Ö: "o",
    ş: "s",
    Ş: "s",
    ü: "u",
    Ü: "u",
};

export const canonicalize = (value: unknown): string => {
    return String(value ?? "")
        .trim()
        .replace(/[ıİçÇğĞöÖşŞüÜ]/g, (char) => TURKISH_CHAR_MAP[char] ?? char)
        .normalize("NFKD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/&/g, " and ")
        .replace(/[|/]+/g, " ")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/-+/g, "-")
        .replace(/^-+|-+$/g, "");
};

const normalizeLoose = (value: unknown): string => {
    return canonicalize(value)
        .replace(/-/g, "")
        // Broken Turkish spellings: "i ccekler", "iccek", etc.
        .replace(/ccek/g, "cecek");
};

const createRule = (key: string, aliases: string[]): CategoryRule => ({
    key,
    aliases: [key, ...aliases],
});

const CATEGORY_RULES: CategoryRule[] = [
    // Voy polished categories
    createRule("kahvaltilar", ["kahvalti", "breakfast"]),
    createRule("sandvic-tostlar", ["sandvic", "sandwich", "tost", "toast"]),
    createRule("wrap-doner", ["wrap-doner", "doner-wrap", "doner"]),
    createRule("makarnalar-mantilar", ["makarnalar-mantilar", "makarna-manti", "manti"]),
    createRule("sicak-kahveler", ["sicak-kahve", "hot-coffee", "hot-coffees"]),
    createRule("soguk-kahveler", ["soguk-kahve", "iced-coffee", "iced-coffees", "cold-coffee"]),
    createRule("voy-ozel-kahveler", ["voy-ozel-kahve", "voy-s-ozel-kahve", "signature-coffee"]),
    createRule("sicak-cikolatalar", ["sicak-cikolata", "hot-chocolate", "hot-chocolates"]),
    createRule("frappeler", ["frappe", "frappeler"]),
    createRule("chai-tea-latte", ["chai-tea", "chai-latte"]),
    createRule("campaign-menus", ["kampanya", "campaign-menu", "kampanya-menu"]),
    createRule("meal-menus", ["food-menuleri", "meal-menu", "yemek-menu"]),
    createRule("appetizers", ["aperatif", "appetizer", "starter"]),
    createRule("meat-dishes", ["et-yemek", "meat-dish", "meat-meal"]),
    createRule("pan-dishes", ["tava-yemek", "pan-dish", "skillet"]),

    // Generic food categories
    createRule("burger-extras", ["burger-l", "burger-level", "burger-extra", "burger-addon", "burger-topping"]),
    createRule("kids-menu", ["kids", "cocuk", "child"]),
    createRule("desserts", ["dessert", "tatli", "sweet", "ice-cream", "dondurma", "gelato"]),
    createRule("salads", ["salata", "salad"]),
    createRule("pasta", ["makarna", "pasta", "penne", "spaghetti", "tagliatelle"]),
    createRule("pizza-wraps", ["pizza-wrap"]),
    createRule("pizzas", ["pizza", "pizzalar", "pizzas"]),
    createRule("pide", ["pide"]),
    createRule("lahmacun", ["lahmacun"]),
    createRule("gozleme", ["gozleme"]),
    createRule("tantuni", ["tantuni"]),
    createRule("wraps", ["durum", "wrap"]),
    createRule("burgers", ["hamburger", "burgerler", "burgers", "burger"]),
    createRule("grills", ["izgara", "grill"]),
    createRule("chicken", ["pilic", "tavuk", "chicken"]),
    createRule("snacks", ["atistirmalik", "snack", "citir", "crispy"]),
    createRule("chips", ["fries", "chips", "patates"]),
    createRule("sauces", ["sos", "sauce"]),
    createRule("soups", ["corba", "soup"]),
    createRule("bowls", ["kase", "bowl"]),
    createRule("cold-drinks", [
        "mesrubat",
        "soft-drink",
        "cold-drink",
        "soguk-icecek",
        "cold-icecek",
        "drinks-cold",
        "drinks-cool",
    ]),
    createRule("hot-drinks", ["sicak-icecek", "hot-drink", "coffee", "tea", "drinks-hot"]),
    createRule("drinks", ["icecek", "drink", "beverage"]),
    createRule("extras", ["extra", "ekstra", "extralar", "addon", "add-on", "sides", "yan-urun"]),
    createRule("mains", ["ana-yemek", "mains", "main", "tabak", "plate"]),
    createRule("diet", ["diet", "diyet"]),
    createRule("fast-food", ["fast-food"]),
    createRule("seafood", ["deniz-urun", "seafood"]),
];

const CATEGORY_LABELS: Record<string, LocalizedLabel> = {
    burgers: { en: "Burgers", tr: "Burgerler" },
    wraps: { en: "Wraps", tr: "Dürümler" },
    "pizza-wraps": { en: "Pizza Wraps", tr: "Pizza Wrap" },
    pizzas: { en: "Pizzas", tr: "Pizzalar" },
    pide: { en: "Pide", tr: "Pideler" },
    lahmacun: { en: "Lahmacun", tr: "Lahmacun" },
    gozleme: { en: "Gozleme", tr: "Gözlemeler" },
    tantuni: { en: "Tantuni", tr: "Tantuniler" },
    mains: { en: "Mains", tr: "Ana Yemekler" },
    grills: { en: "Grills", tr: "Izgaralar" },
    chicken: { en: "Chicken", tr: "Tavuk Yemekleri" },
    pasta: { en: "Pasta", tr: "Makarnalar" },
    tenders: { en: "Tenders", tr: "Tenders" },
    salads: { en: "Salads", tr: "Salatalar" },
    extras: { en: "Extras", tr: "Ekstralar" },
    snacks: { en: "Snacks", tr: "Atıştırmalıklar" },
    bowls: { en: "Bowls", tr: "Kaseler" },
    chips: { en: "Chips / Fries", tr: "Cips / Patates" },
    sauces: { en: "Sauces", tr: "Soslar" },
    drinks: { en: "Drinks", tr: "İçecekler" },
    "cold-drinks": { en: "Cold Drinks", tr: "Soğuk İçecekler" },
    "hot-drinks": { en: "Hot Drinks", tr: "Sıcak İçecekler" },
    toast: { en: "Toasts & Sandwiches", tr: "Tost / Sandviç" },
    soups: { en: "Soups", tr: "Çorbalar" },
    cigkofte: { en: "Cig Kofte", tr: "Çiğ Köfte" },
    "burger-extras": { en: "Burger Extras", tr: "Burger Ekstraları" },
    "fast-food": { en: "Fast Food", tr: "Fast Food Menüleri" },
    diet: { en: "Diet", tr: "Diyet Menüler" },
    seafood: { en: "Seafood", tr: "Deniz Ürünleri" },
    "campaign-menus": { en: "Campaign Menus", tr: "Kampanya Menüleri" },
    "meal-menus": { en: "Meal Menus", tr: "Yemek Menüleri" },
    appetizers: { en: "Appetizers", tr: "Aperatifler" },
    "meat-dishes": { en: "Meat Dishes", tr: "Et Yemekleri" },
    "pan-dishes": { en: "Pan Dishes", tr: "Tava Yemekleri" },
    "kids-menu": { en: "Kids Menu", tr: "Çocuk Menüsü" },
    desserts: { en: "Desserts", tr: "Tatlılar" },

    // Voy polished labels
    kahvaltilar: { en: "Breakfasts", tr: "Kahvaltılar" },
    "sandvic-tostlar": { en: "Sandwiches & Toasts", tr: "Sandviçler ve Tostlar" },
    "wrap-doner": { en: "Wraps & Doner", tr: "Wrap ve Dönerler" },
    "makarnalar-mantilar": { en: "Pasta & Dumplings", tr: "Makarnalar ve Mantılar" },
    "sicak-kahveler": { en: "Hot Coffees", tr: "Sıcak Kahveler" },
    "soguk-kahveler": { en: "Iced Coffees", tr: "Soğuk Kahveler" },
    "voy-ozel-kahveler": { en: "Voy Signature Coffees", tr: "Voy'un Özel Kahveleri" },
    "sicak-cikolatalar": { en: "Hot Chocolates", tr: "Sıcak Çikolatalar" },
    frappeler: { en: "Frappes", tr: "Frappeler" },
    "chai-tea-latte": { en: "Chai Tea Latte", tr: "Chai Tea Latte" },

    other: { en: "Other", tr: "Diğer" },
};

const aliasMatches = (rawKey: string, alias: string): boolean => {
    const strictAlias = canonicalize(alias);
    const looseKey = normalizeLoose(rawKey);
    const looseAlias = normalizeLoose(alias);

    return rawKey === strictAlias || rawKey.includes(strictAlias) || looseKey.includes(looseAlias);
};

export const normalizeCategoryKey = (raw: unknown): string => {
    const key = canonicalize(raw);
    if (!key) return "other";

    const matchedRule = CATEGORY_RULES.find((rule) =>
        rule.aliases.some((alias) => aliasMatches(key, alias)),
    );

    return matchedRule?.key ?? key;
};

const titleCase = (value: string): string => {
    return value
        .replace(/[_-]+/g, " ")
        .replace(/\b\w/g, (char) => char.toUpperCase());
};

export const getCategoryLabel = (
    key: unknown,
    locale: SupportedLocale = "en",
): string => {
    const normalizedKey = normalizeCategoryKey(key);
    const label = CATEGORY_LABELS[normalizedKey];

    return label?.[locale] ?? label?.en ?? titleCase(normalizedKey);
};

export const getCategoryLabels = (): Record<string, LocalizedLabel> => {
    return CATEGORY_LABELS;
};