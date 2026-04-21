export type MenuItemImageKey =
    | "burger_beef"
    | "burger_double_beef"
    | "burger_chicken"
    | "burger_grilled_chicken"
    | "pizza_pepperoni"
    | "pizza_mushroom"
    | "pizza_meat"
    | "pizza_bbq"
    | "pizza_sausage"
    | "pizza_supreme"
    | "fries"
    | "onion_rings"
    | "crispy_chicken"
    | "sandwich"
    | "wrap"
    | "salad"
    | "soup"
    | "gozleme"
    | "chicken_plate"
    | "meatball_plate"
    | "falafel_plate"
    | "sauce"
    | "pasta"
    | "dessert"
    | "drink";

export type FoodImageCandidate = {
    reason: "explicit" | "pexels" | "item_map" | "category_map" | "default_map";
    url: string;
    key?: MenuItemImageKey | null;
    query?: string;
};

export type GetMenuItemImageInput = {
    name: string;
    category?: string;
    cuisine?: string;
    explicitImageUrl?: string | null;
};

export type MenuItemImageResolution = {
    normalizedName: string;
    itemKey: MenuItemImageKey | null;
    categoryKey: MenuItemImageKey | null;
    pexelsQueries: string[];
    candidates: FoodImageCandidate[];
    bestImageUrl: string | null;
    fallbackImageUrl: string | null;
};

const sanitizeRemoteUrl = (value: unknown) => {
    if (typeof value !== "string") return null;
    const trimmed = value.trim();
    if (!trimmed) return null;
    return /^https?:\/\//i.test(trimmed) ? trimmed : null;
};

const normalizeText = (value: unknown) =>
    String(value || "")
        .toLowerCase()
        .normalize("NFKD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[\u00e7]/g, "c")
        .replace(/[\u011f]/g, "g")
        .replace(/[\u0131]/g, "i")
        .replace(/[\u00f6]/g, "o")
        .replace(/[\u015f]/g, "s")
        .replace(/[\u00fc]/g, "u")
        .replace(/[^a-z0-9]+/g, " ")
        .replace(/\s+/g, " ")
        .trim();

const includesAny = (value: string, patterns: RegExp[]) => patterns.some((pattern) => pattern.test(value));

export const MENU_ITEM_REMOTE_IMAGE_MAP: Record<MenuItemImageKey, string> = {
    burger_beef: "https://images.pexels.com/photos/36850042/pexels-photo-36850042.jpeg?auto=compress&cs=tinysrgb&h=350",
    burger_double_beef: "https://images.pexels.com/photos/20722044/pexels-photo-20722044.jpeg?auto=compress&cs=tinysrgb&h=350",
    burger_chicken: "https://images.pexels.com/photos/20722066/pexels-photo-20722066.jpeg?auto=compress&cs=tinysrgb&h=350",
    burger_grilled_chicken: "https://images.pexels.com/photos/27758748/pexels-photo-27758748.jpeg?auto=compress&cs=tinysrgb&h=350",
    pizza_pepperoni: "https://images.pexels.com/photos/2762938/pexels-photo-2762938.jpeg?auto=compress&cs=tinysrgb&h=350",
    pizza_mushroom: "https://images.pexels.com/photos/29699537/pexels-photo-29699537.jpeg?auto=compress&cs=tinysrgb&h=350",
    pizza_meat: "https://images.pexels.com/photos/16014994/pexels-photo-16014994.jpeg?auto=compress&cs=tinysrgb&h=350",
    pizza_bbq: "https://images.pexels.com/photos/30343607/pexels-photo-30343607.jpeg?auto=compress&cs=tinysrgb&h=350",
    pizza_sausage: "https://images.pexels.com/photos/9552566/pexels-photo-9552566.jpeg?auto=compress&cs=tinysrgb&h=350",
    pizza_supreme: "https://images.pexels.com/photos/8609973/pexels-photo-8609973.jpeg?auto=compress&cs=tinysrgb&h=350",
    fries: "https://images.pexels.com/photos/5041473/pexels-photo-5041473.jpeg?auto=compress&cs=tinysrgb&h=350",
    onion_rings: "https://images.pexels.com/photos/29392059/pexels-photo-29392059.jpeg?auto=compress&cs=tinysrgb&h=350",
    crispy_chicken: "https://images.pexels.com/photos/27352273/pexels-photo-27352273.jpeg?auto=compress&cs=tinysrgb&h=350",
    sandwich: "https://images.pexels.com/photos/29699515/pexels-photo-29699515.jpeg?auto=compress&cs=tinysrgb&h=350",
    wrap: "https://images.pexels.com/photos/33682598/pexels-photo-33682598.jpeg?auto=compress&cs=tinysrgb&h=350",
    salad: "https://images.pexels.com/photos/5272096/pexels-photo-5272096.jpeg?auto=compress&cs=tinysrgb&h=350",
    soup: "https://images.pexels.com/photos/6509214/pexels-photo-6509214.jpeg?auto=compress&cs=tinysrgb&h=350",
    gozleme: "https://images.pexels.com/photos/35386138/pexels-photo-35386138.jpeg?auto=compress&cs=tinysrgb&h=350",
    chicken_plate: "https://images.pexels.com/photos/5695611/pexels-photo-5695611.jpeg?auto=compress&cs=tinysrgb&h=350",
    meatball_plate: "https://images.pexels.com/photos/17894245/pexels-photo-17894245.jpeg?auto=compress&cs=tinysrgb&h=350",
    falafel_plate: "https://images.pexels.com/photos/6546031/pexels-photo-6546031.jpeg?auto=compress&cs=tinysrgb&h=350",
    sauce: "https://images.pexels.com/photos/9304931/pexels-photo-9304931.jpeg?auto=compress&cs=tinysrgb&h=350",
    pasta: "https://images.pexels.com/photos/29039084/pexels-photo-29039084.jpeg?auto=compress&cs=tinysrgb&h=350",
    dessert: "https://images.pexels.com/photos/29039083/pexels-photo-29039083.jpeg?auto=compress&cs=tinysrgb&h=350",
    drink: "https://images.pexels.com/photos/16716138/pexels-photo-16716138.jpeg?auto=compress&cs=tinysrgb&h=350",
};

const DEFAULT_STATIC_MENU_IMAGE = MENU_ITEM_REMOTE_IMAGE_MAP.chicken_plate;

export const MENU_ITEM_PEXELS_QUERY_MAP: Record<MenuItemImageKey, string> = {
    burger_beef: "beef burger close up",
    burger_double_beef: "double beef burger close up",
    burger_chicken: "chicken burger close up",
    burger_grilled_chicken: "grilled chicken burger close up",
    pizza_pepperoni: "pepperoni pizza close up",
    pizza_mushroom: "mushroom pizza close up",
    pizza_meat: "meat pizza close up",
    pizza_bbq: "bbq pizza close up",
    pizza_sausage: "turkish sausage pizza close up",
    pizza_supreme: "supreme pizza close up",
    fries: "french fries close up",
    onion_rings: "onion rings close up",
    crispy_chicken: "crispy chicken tenders close up",
    sandwich: "grilled sandwich close up",
    wrap: "chicken wrap on plate close up",
    salad: "fresh salad bowl close up",
    soup: "soup in bowl close up",
    gozleme: "turkish flatbread close up",
    chicken_plate: "grilled chicken on plate close up",
    meatball_plate: "meatballs on plate close up",
    falafel_plate: "falafel on plate close up",
    sauce: "dipping sauce in bowl close up",
    pasta: "creamy pasta close up",
    dessert: "dessert close up",
    drink: "cold drink close up",
};

const classifyCategoryKey = (normalized: string): MenuItemImageKey | null => {
    if (!normalized) return null;

    if (includesAny(normalized, [/\bdrinks?\b/, /\bicecek(?:ler)?\b/, /\bcold drinks?\b/, /\bhot drinks?\b/])) return "drink";
    if (includesAny(normalized, [/\bsauces?\b/, /\bsos(?:lar)?\b/, /\bextras?\b/, /\bekstra(?:lar)?\b/])) return "sauce";
    if (includesAny(normalized, [/\bsoups?\b/, /\bcorba(?:lar)?\b/])) return "soup";
    if (includesAny(normalized, [/\bsalads?\b/, /\bsalata(?:lar)?\b/])) return "salad";
    if (includesAny(normalized, [/\bpastas?\b/, /\bmakarna(?:lar)?\b/])) return "pasta";
    if (includesAny(normalized, [/\bchips?\b/, /\bfries\b/, /\bpatates\b/, /\bsides?\b/])) return "fries";
    if (includesAny(normalized, [/\bonion\b/, /\bsogan\b/])) return "onion_rings";
    if (includesAny(normalized, [/\bwraps?\b/, /\bdurum(?:ler)?\b/, /\blavas\b/])) return "wrap";
    if (includesAny(normalized, [/\bgozleme\b/])) return "gozleme";
    if (includesAny(normalized, [/\btost\b/, /\bsandvic\b/, /\bsandwich\b/])) return "sandwich";
    if (includesAny(normalized, [/\bburgers?\b/])) return "burger_beef";
    if (includesAny(normalized, [/\bpizzas?\b/, /\bpizza\b/])) return "pizza_supreme";
    if (includesAny(normalized, [/\bfalafel\b/])) return "falafel_plate";
    if (includesAny(normalized, [/\bmeatball\b/, /\bkofte\b/])) return "meatball_plate";
    if (includesAny(normalized, [/\bgrills?\b/, /\bizgara(?:lar)?\b/, /\bmains?\b/, /\bana yemek(?:ler)?\b/, /\bfast food\b/, /\bchicken\b/, /\btavuk\b/])) {
        return "chicken_plate";
    }
    if (includesAny(normalized, [/\btatli\b/, /\bdessert\b/])) return "dessert";
    return null;
};

export const normalizeMenuItemName = (name: string): MenuItemImageKey | null => {
    const normalized = normalizeText(name);
    if (!normalized) return null;

    if (includesAny(normalized, [/\bcorba\b/, /\bsoup\b/])) return "soup";
    if (includesAny(normalized, [/\bgozleme\b/])) return "gozleme";
    if (includesAny(normalized, [/\bsalata\b/, /\bsalad\b/])) return "salad";
    if (includesAny(normalized, [/\bfalafel\b/])) return "falafel_plate";
    if (includesAny(normalized, [/\bet kofte\b/, /\bmeatball\b/])) return "meatball_plate";
    if (includesAny(normalized, [/\bdurum\b/, /\bwrap\b/, /\blavas\b/, /\bquesadilla\b/])) return "wrap";

    if (includesAny(normalized, [/\bgou?j?on\b/, /\bgijon\b/, /\bgujon\b/])) return "crispy_chicken";
    if (includesAny(normalized, [/\btenders?\b/, /\bkentucky\b/, /\bschnitzel\b/, /\bsinitzel\b/, /\bsnitzel\b/])) return "crispy_chicken";
    if (includesAny(normalized, [/\bkarisik tavuk\b/, /\btavuk dolma\b/, /\bmixed chicken\b/])) return "crispy_chicken";
    if (includesAny(normalized, [/\btavuklu krep\b/, /\bchicken crepe\b/, /\bprenses\b/])) return "chicken_plate";
    if (includesAny(normalized, [/\btavuk sis\b/, /\btavuk pirzola\b/, /\bkanat\b/, /\btavuk sote\b/, /\bstragonof\b/, /\bcafe de paris\b/])) {
        return "chicken_plate";
    }

    if (includesAny(normalized, [/\bpatates\b/, /\bcipsi\b/, /\bfries\b/, /\bchips\b/])) return "fries";
    if (includesAny(normalized, [/\bsogan halkasi\b/, /\bonion rings?\b/])) return "onion_rings";
    if (includesAny(normalized, [/\bcitir tavuk\b/, /\bcrispy chicken\b/, /\bchicken tenders?\b/])) return "crispy_chicken";
    if (includesAny(normalized, [/\btavuk\b/, /\bchicken\b/])) return "chicken_plate";

    if (includesAny(normalized, [/\bsos\b/, /\bsauce\b/])) return "sauce";

    if (includesAny(normalized, [/\bbalik etli pizza\b/, /\bbalikli pizza\b/, /\bseafood pizza\b/])) return "pizza_supreme";
    if (includesAny(normalized, [/\bpepperoni\b/])) return "pizza_pepperoni";
    if (includesAny(normalized, [/\bmantar keyfi\b/, /\bmantar\b/, /\bmushroom\b/])) return "pizza_mushroom";
    if (includesAny(normalized, [/\bsucuk keyfi\b/, /\bsucuk\b/, /\bsausage\b/])) return "pizza_sausage";
    if (includesAny(normalized, [/\bbarbeku\b/, /\bbbq\b/])) return "pizza_bbq";
    if (includesAny(normalized, [/\betli pizza\b/, /\betli\b/, /\bmeat\b/])) return "pizza_meat";
    if (includesAny(normalized, [/\bsuper supreme\b/, /\bsupreme\b/])) return "pizza_supreme";

    if (includesAny(normalized, [/\bburger\b/])) {
        const isChicken = includesAny(normalized, [/\btavuk\b/, /\bchicken\b/]);
        const isGrilled = includesAny(normalized, [/\bizgara\b/, /\bgrilled\b/]);
        const isDouble = includesAny(normalized, [/\bduble\b/, /\bdouble\b/]);
        const isBeef = includesAny(normalized, [/\bet\b/, /\bdana\b/, /\bbeef\b/]);

        if (isChicken && isGrilled) return "burger_grilled_chicken";
        if (isChicken) return "burger_chicken";
        if (isDouble && isBeef) return "burger_double_beef";
        if (isDouble) return "burger_double_beef";
        return "burger_beef";
    }

    if (includesAny(normalized, [/\bkarisik tost\b/, /\btost\b/, /\bsandvic\b/, /\bsandwich\b/])) return "sandwich";
    if (includesAny(normalized, [/\bmakarna\b/, /\bpasta\b/])) return "pasta";
    if (includesAny(normalized, [/\btatli\b/, /\bdessert\b/, /\bcake\b/, /\bbrownie\b/, /\bcheesecake\b/])) return "dessert";
    if (includesAny(normalized, [/\bicecek\b/, /\bdrink\b/, /\bsoda\b/, /\bcola\b/, /\bkahve\b/, /\bcoffee\b/, /\bwater\b/])) {
        return "drink";
    }

    return null;
};

const deriveCategoryKey = (category?: string, cuisine?: string): MenuItemImageKey | null => {
    const normalizedCategory = normalizeText(category);
    const fromCategory = classifyCategoryKey(normalizedCategory);
    if (fromCategory) return fromCategory;

    const normalizedCuisine = normalizeText(cuisine);
    return classifyCategoryKey(`${normalizedCategory} ${normalizedCuisine}`.trim());
};

const dedupeCandidates = (candidates: FoodImageCandidate[]) => {
    const seen = new Set<string>();
    const ordered: FoodImageCandidate[] = [];
    for (const candidate of candidates) {
        if (!candidate?.url || seen.has(candidate.url)) continue;
        seen.add(candidate.url);
        ordered.push(candidate);
    }
    return ordered;
};

export const getMenuItemImage = (input: GetMenuItemImageInput): MenuItemImageResolution => {
    const normalizedName = normalizeText(input.name);
    const itemKey = normalizeMenuItemName(input.name);
    const categoryKey = deriveCategoryKey(input.category, input.cuisine);
    const explicitImageUrl = sanitizeRemoteUrl(input.explicitImageUrl);

    const itemQuery = itemKey ? MENU_ITEM_PEXELS_QUERY_MAP[itemKey] : "";
    const categoryQuery = categoryKey ? MENU_ITEM_PEXELS_QUERY_MAP[categoryKey] : "";
    const fallbackQuery = `${normalizedName || normalizeText(input.category) || normalizeText(input.cuisine) || "food"} close up`;
    const pexelsQueries = [itemQuery, categoryQuery, fallbackQuery].filter(Boolean);

    const itemMapImage = itemKey ? sanitizeRemoteUrl(MENU_ITEM_REMOTE_IMAGE_MAP[itemKey]) : null;
    const categoryMapImage = categoryKey ? sanitizeRemoteUrl(MENU_ITEM_REMOTE_IMAGE_MAP[categoryKey]) : null;
    const candidates = dedupeCandidates(
        [
            explicitImageUrl
                ? {
                      reason: "explicit" as const,
                      url: explicitImageUrl,
                      key: itemKey,
                  }
                : null,
            itemMapImage
                ? {
                      reason: "item_map" as const,
                      url: itemMapImage,
                      key: itemKey,
                  }
                : null,
            categoryMapImage
                ? {
                      reason: "category_map" as const,
                      url: categoryMapImage,
                      key: categoryKey,
                  }
                : null,
            {
                reason: "default_map" as const,
                url: DEFAULT_STATIC_MENU_IMAGE,
                key: categoryKey ?? itemKey,
            },
        ].filter(Boolean) as FoodImageCandidate[],
    );

    return {
        normalizedName,
        itemKey,
        categoryKey,
        pexelsQueries,
        candidates,
        bestImageUrl: candidates[0]?.url ?? null,
        fallbackImageUrl: candidates[1]?.url ?? null,
    };
};
