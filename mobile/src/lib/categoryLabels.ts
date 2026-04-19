export type SupportedLocale = "en" | "tr";

const canonicalize = (value: string) =>
    value
        .trim()
        .toLowerCase()
        .normalize("NFKD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/ı/g, "i")
        .replace(/ç/g, "c")
        .replace(/ğ/g, "g")
        .replace(/ö/g, "o")
        .replace(/ş/g, "s")
        .replace(/ü/g, "u")
        .replace(/&/g, " and ")
        .replace(/[|/]+/g, " ")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/-+/g, "-")
        .replace(/^-+|-+$/g, "");

const hasAny = (source: string, needles: string[]) => needles.some((needle) => source.includes(needle));

export const normalizeCategoryKey = (raw: unknown): string => {
    const key = canonicalize(String(raw || ""));
    if (!key) return "other";

    if (hasAny(key, ["burger-l", "burger-level", "burger-extra", "burger-addon", "burger-topping"])) return "burger-extras";
    if (hasAny(key, ["kids", "cocuk", "child"])) return "kids-menu";
    if (hasAny(key, ["ice-cream", "dondurma", "gelato"])) return "desserts";
    if (hasAny(key, ["salata", "salad"])) return "salads";
    if (hasAny(key, ["makarna", "pasta", "penne", "spaghetti", "tagliatelle"])) return "pasta";
    if (hasAny(key, ["pizza-wrap"])) return "pizza-wraps";
    if (hasAny(key, ["pizza", "pizzalar", "pizzas"])) return "pizzas";
    if (hasAny(key, ["pide"])) return "pide";
    if (hasAny(key, ["lahmacun"])) return "lahmacun";
    if (hasAny(key, ["gozleme"])) return "gozleme";
    if (hasAny(key, ["tantuni"])) return "tantuni";
    if (hasAny(key, ["durum", "wrap"])) return "wraps";
    if (hasAny(key, ["hamburger", "burgerler", "burgers", "burger"])) return "burgers";
    if (hasAny(key, ["izgara", "grill"])) return "grills";
    if (hasAny(key, ["pilic", "tavuk", "chicken"])) return "chicken";
    if (hasAny(key, ["atistirmalik", "snack", "citir", "crispy"])) return "snacks";
    if (hasAny(key, ["fries", "chips", "patates"])) return "chips";
    if (hasAny(key, ["sos", "sauce"])) return "sauces";
    if (hasAny(key, ["corba", "soup"])) return "soups";
    if (hasAny(key, ["kase", "bowl"])) return "bowls";
    if (hasAny(key, ["mesrubat", "soft-drink", "cold-drink", "soguk-icecek", "cold-icecek", "drinks-cold", "drinks-cool"])) return "cold-drinks";
    if (hasAny(key, ["sicak-icecek", "hot-drink", "coffee", "tea", "drinks-hot"])) return "hot-drinks";
    if (hasAny(key, ["icecek", "i-cecek", "drink", "beverage"])) return "drinks";
    if (hasAny(key, ["ekstra", "extra", "addon", "add-on", "sides", "yan-urun"])) return "extras";
    if (hasAny(key, ["ana-yemek", "mains", "main", "tabak", "plate"])) return "mains";
    if (hasAny(key, ["diet", "diyet"])) return "diet";
    if (hasAny(key, ["fast-food"])) return "fast-food";
    if (hasAny(key, ["deniz-urun", "seafood"])) return "seafood";

    return key;
};

const CATEGORY_LABELS: Record<string, { en: string; tr: string }> = {
    burgers: { en: "Burgers", tr: "Burgerler" },
    wraps: { en: "Wraps", tr: "Dürümler" },
    "pizza-wraps": { en: "Pizza Wraps", tr: "Pizza Wrap" },
    pizzas: { en: "Pizzas", tr: "Pizzalar" },
    pide: { en: "Pide", tr: "Pideler" },
    lahmacun: { en: "Lahmacun", tr: "Lahmacun" },
    gozleme: { en: "Gözleme", tr: "Gözlemeler" },
    tantuni: { en: "Tantuni", tr: "Tantuniler" },
    mains: { en: "Mains", tr: "Ana Yemekler" },
    grills: { en: "Grills", tr: "Izgaralar" },
    chicken: { en: "Chicken", tr: "Tavuk Yemekleri" },
    pasta: { en: "Pasta", tr: "Makarnalar" },
    tenders: { en: "Tenders", tr: "Tenders" },
    salads: { en: "Salads", tr: "Salatalar" },
    extras: { en: "Extras", tr: "Ekstralar" },
    snacks: { en: "Snacks", tr: "Atıştırmalıklar" },
    bowls: { en: "Bowls", tr: "Bowls" },
    chips: { en: "Chips / Fries", tr: "Cips / Patates" },
    sauces: { en: "Sauces", tr: "Soslar" },
    drinks: { en: "Drinks", tr: "İçecekler" },
    "cold-drinks": { en: "Cold Drinks", tr: "Soğuk İçecekler" },
    "hot-drinks": { en: "Hot Drinks", tr: "Sıcak İçecekler" },
    toast: { en: "Toasts & Sandwiches", tr: "Tost / Sandviç" },
    soups: { en: "Starters", tr: "Aperatifler" },
    cigkofte: { en: "Çiğ Köfte", tr: "Çiğ Köfte" },
    "burger-extras": { en: "Burger Extras", tr: "Burger Ekstraları" },
    "fast-food": { en: "Fast Food", tr: "Fast Food Menüleri" },
    diet: { en: "Diet", tr: "Diyet Menüler" },
    seafood: { en: "Seafood", tr: "Deniz Ürünleri" },
    "kids-menu": { en: "Kids Menu", tr: "Çocuk Menüsü" },
    desserts: { en: "Desserts", tr: "Tatlılar" },
    other: { en: "Other", tr: "Diğer" },
};

const titleCase = (value: string) =>
    value
        .replace(/[_-]+/g, " ")
        .replace(/\b\w/g, (char) => char.toUpperCase());

export const getCategoryLabel = (key: string, locale: SupportedLocale = "en") => {
    const normalized = normalizeCategoryKey(key);
    const mapping = CATEGORY_LABELS[normalized];
    if (mapping) return mapping[locale] ?? mapping.en;
    return titleCase(normalized);
};
