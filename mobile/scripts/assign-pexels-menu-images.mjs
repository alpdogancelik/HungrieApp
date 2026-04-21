#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.resolve(__dirname, "../data");
const DEFAULT_REPORT = path.resolve(DATA_DIR, "image-assignment-report.json");
const THRESHOLD_HIGH = 25;
const THRESHOLD_MEDIUM = 15;
const DUP_LIMIT_CATEGORY = 2;
const OFFLINE_POOL_THRESHOLD_MEDIUM = 30;
const OFFLINE_POOL_THRESHOLD_STRONG = 40;

const CATEGORY_RULES = [
  ["burger", "burger", ["burgers", "burgerler", "hamburgerler"]],
  ["wrap", "wrap", ["wraps", "durum", "durumler", "duruemler", "doner", "donerler", "wraplar", "pizza wrap"]],
  ["pizza", "pizza", ["pizzas", "pizzalar"]],
  ["pide", "pide", ["pide", "pideler", "lahmacun"]],
  ["gozleme", "gozleme", ["gozleme"]],
  ["tantuni", "tantuni", ["tantuni"]],
  ["pasta", "pasta", ["pasta", "makarna", "makarnalar", "manti", "mantilar"]],
  ["salad", "salad", ["salad", "salata"]],
  ["coffee", "coffee", ["hot drinks", "sicak icecek", "sicak kahveler", "soguk kahveler", "kahve", "kahveler", "chai tea latte", "chai", "frappe", "frappeler", "sicak cikolata", "sicak cikolatalar", "hot_drinks", "hot-drinks"]],
  ["drink", "drink", ["cold drinks", "soguk icecek", "soguk icecekler", "cold-drinks", "mesrubat"]],
  ["dessert", "dessert", ["ice cream", "dondurma", "dessert", "tatli", "tatlilar"]],
  ["bowl", "bowl", ["bowls"]],
  ["sandwich", "sandwich", ["toast", "sandwich", "sandvic"]],
  ["tenders", "fried_chicken", ["tenders"]],
  ["snack", "unknown", ["snacks", "chips", "crispy", "appetizers", "atistirmalik"]],
  ["chicken_box", "snack_box", ["chicken boxes", "chicken-boxes"]],
  ["extras", "coffee", ["extras", "extralar", "sauces", "sos", "ilave", "ekstra"]],
  ["main", "unknown", ["mains", "ana yemek", "grill", "izgara", "pilic", "pili", "et yemekleri", "tavuk yemekleri", "kahvaltilar", "fast food", "diet", "combos", "pan", "tava"]],
  ["campaign", "unknown", ["campaigns", "kampanya"]],
];

const TYPE_TERMS = {
  burger: ["burger", "hamburger", "cheeseburger", "slider"],
  wrap: ["wrap", "durum", "shawarma", "tortilla", "burrito"],
  pizza: ["pizza", "margherita", "pepperoni", "slice"],
  pide: ["pide", "turkish flatbread"],
  lahmacun: ["lahmacun", "turkish flatbread"],
  gozleme: ["gozleme", "stuffed flatbread", "flatbread"],
  tantuni: ["tantuni", "turkish wrap"],
  fried_chicken: ["fried chicken", "tenders", "strips", "nuggets", "wings", "popcorn chicken", "schnitzel", "goujon"],
  grilled_chicken: ["grilled chicken", "chicken skewer", "chicken kebab"],
  chicken_plate: ["chicken plate", "chicken with rice", "creamy chicken"],
  meat_plate: ["kebab plate", "meat plate", "adana", "kofte"],
  pasta: ["pasta", "spaghetti", "penne", "tagliatelle", "fettuccine"],
  salad: ["salad", "caesar", "greens"],
  fries: ["fries", "chips", "wedges", "curly fries", "onion rings", "mozzarella sticks", "samosa", "falafel"],
  snack_box: ["snack box", "combo box", "poutine", "fried platter"],
  drink: ["drink", "beverage", "cola", "soda", "can", "bottle", "water", "ayran"],
  coffee: ["coffee", "tea", "espresso", "latte", "cappuccino", "turkish coffee"],
  dessert: ["dessert", "ice cream", "gelato", "cake", "sweet"],
  bowl: ["bowl", "acai bowl", "grain bowl"],
  sandwich: ["sandwich", "toast", "panini"],
};

const NEG = {
  burger: ["pizza", "pasta", "wrap", "salad", "plate"],
  wrap: ["burger", "pizza", "pasta", "salad", "plate"],
  pizza: ["burger", "wrap", "pasta", "fries"],
  pide: ["burger", "sandwich", "pasta", "american pizza"],
  lahmacun: ["burger", "sandwich", "pasta", "american pizza"],
  gozleme: ["burger", "pizza", "pasta"],
  tantuni: ["burger", "pizza", "pasta"],
  fried_chicken: ["burger", "pizza", "wrap", "pasta"],
  grilled_chicken: ["burger", "pizza", "wrap", "pasta"],
  chicken_plate: ["burger", "pizza", "wrap", "pasta"],
  meat_plate: ["burger", "pizza", "wrap", "pasta"],
  pasta: ["burger", "pizza", "wrap"],
  salad: ["burger", "pizza", "pasta"],
  fries: ["burger", "pizza", "pasta"],
  snack_box: ["burger", "pizza", "pasta"],
  drink: ["burger", "food", "plate", "pizza", "pasta"],
  coffee: ["burger", "food", "plate", "pizza", "pasta"],
  dessert: ["burger", "pizza", "pasta"],
  bowl: ["burger", "pizza", "wrap"],
  sandwich: ["burger", "pizza", "pasta"],
  unknown: ["person", "portrait", "city"],
};
const PLACEHOLDER = {
  burger: "https://placehold.co/600x600/F2E2CE/A87A46?text=Burger",
  wrap: "https://placehold.co/600x600/F2E2CE/A87A46?text=Wrap",
  pizza: "https://placehold.co/600x600/F5E8D6/B18350?text=Pizza",
  pide: "https://placehold.co/600x600/F2E2CE/A87A46?text=Pide",
  lahmacun: "https://placehold.co/600x600/F2E2CE/A87A46?text=Lahmacun",
  gozleme: "https://placehold.co/600x600/F2E2CE/A87A46?text=Gozleme",
  tantuni: "https://placehold.co/600x600/F2E2CE/A87A46?text=Tantuni",
  fried_chicken: "https://placehold.co/600x600/EEDCC6/9E6F3E?text=Fried+Chicken",
  grilled_chicken: "https://placehold.co/600x600/F2E2CE/A87A46?text=Grilled+Chicken",
  chicken_plate: "https://placehold.co/600x600/F1E0CB/A47643?text=Chicken+Plate",
  meat_plate: "https://placehold.co/600x600/F1E0CB/A47643?text=Meat+Plate",
  pasta: "https://placehold.co/600x600/F2E2CE/A87A46?text=Pasta",
  salad: "https://placehold.co/600x600/EEDFC9/7A8F54?text=Salad",
  fries: "https://placehold.co/600x600/F1E0CB/A47643?text=Snacks",
  snack_box: "https://placehold.co/600x600/F5E8D6/B18350?text=Snack+Box",
  drink: "https://placehold.co/600x600/F5E8D5/9A6B37?text=Cold+Drink",
  coffee: "https://placehold.co/600x600/F4E4CD/9C6737?text=Hot+Drink",
  dessert: "https://placehold.co/600x600/F3DFC9/AE7846?text=Dessert",
  bowl: "https://placehold.co/600x600/EEDFC9/7A8F54?text=Bowl",
  sandwich: "https://placehold.co/600x600/F2E2CE/A87A46?text=Sandwich",
  unknown: "https://placehold.co/600x600/F5E8D6/B18350?text=Menu",
};

const MANUAL = {
  "burger-house": {
    "a01 sogan halkasi": { primaryType: "fries", queries: ["onion rings", "fried onion rings"], negative: ["burger", "pizza", "pasta"] },
    "a02 peynir cubuklari": { primaryType: "fries", queries: ["mozzarella sticks", "fried cheese sticks"], negative: ["burger", "pizza", "pasta"] },
    "b25 crispy chicken burger": { primaryType: "burger", protein: "chicken", modifiers: ["crispy"], queries: ["crispy chicken burger", "fried chicken burger"], negative: ["plate", "pizza", "pasta", "wrap"] },
  },
  lavish: {
    lahmacun: { primaryType: "lahmacun", queries: ["lahmacun", "turkish lahmacun"], negative: ["burger", "pasta", "american pizza"] },
    "tavuk tantuni durum": { primaryType: "tantuni", protein: "chicken", queries: ["chicken tantuni wrap", "turkish chicken wrap"], negative: ["burger", "pizza", "pasta"] },
  },
};

const AUDIT = {
  unrelatedAssignments: "Legacy script picks from static hash pools and broad canonical buckets, so specific item intent can map to unrelated food photos.",
  repeatedImages: "Legacy hashing over limited pools naturally repeats identical URLs across many different items.",
  weakCategoryDominance: "Category rules are mixed with global keyword fallbacks, so category is not always the strongest signal.",
  placeholderFallback: "Fallback placeholder mode exists but is not driven by candidate confidence from live search.",
  pexelsMetadataUsage: "Legacy script does not score live Pexels candidates with alt/query/duplicate pressure.",
};

const TUR = {};
const REPL = [
  [/(^|\s)(sinitzel|schnitzel|schinitzel)(\s|$)/g, " schnitzel "],
  [/(^|\s)(gujon|gujons|goujon|goujons)(\s|$)/g, " goujon "],
  [/(^|\s)(citir|citir|crispy)(\s|$)/g, " crispy "],
  [/(^|\s)(durum|durumler|drm)(\s|$)/g, " durum "],
  [/(^|\s)(kasar|kasar)(\s|$)/g, " cheese "],
  [/(^|\s)(kofte|kofta)(\s|$)/g, " kofte "],
  [/(^|\s)(hellim|halloumi)(\s|$)/g, " halloumi "],
  [/(^|\s)(patates|chips|cips)(\s|$)/g, " fries "],
  [/(^|\s)(makarna)(\s|$)/g, " pasta "],
  [/(^|\s)(salata)(\s|$)/g, " salad "],
  [/(^|\s)(icecek|iecek|mesrubat)(\s|$)/g, " drink "],
];

const TURKISH_ASCII_MAP = {
  ç: "c",
  Ç: "C",
  ğ: "g",
  Ğ: "G",
  ı: "i",
  İ: "I",
  ö: "o",
  Ö: "O",
  ş: "s",
  Ş: "S",
  ü: "u",
  Ü: "U",
};
const toAscii = (v) => String(v || "").replace(/[çÇğĞıİöÖşŞüÜ]/g, (ch) => TURKISH_ASCII_MAP[ch] || ch).normalize("NFKD").replace(/[\u0300-\u036f]/g, "");
const norm = (v) => { let t = toAscii(v).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim(); for (const [r, x] of REPL) t = t.replace(r, x); return t.replace(/\s+/g, " ").trim(); };
const uniq = (arr) => [...new Map((arr || []).map((x) => [String(x).toLowerCase(), String(x)])).values()].filter(Boolean);
const has = (text, terms) => {
  const src = ` ${String(text || "").trim()} `;
  for (const raw of terms || []) {
    const t = norm(raw);
    if (!t) continue;
    if (src.includes(` ${t} `)) return true;
  }
  return false;
};
const isHttp = (u) => /^https?:\/\//i.test(String(u || "").trim());
const isPlaceholder = (u) => { const s = String(u || "").trim().toLowerCase(); if (!s || !isHttp(s)) return true; return s.includes("placehold.co") || s.includes("placeholder") || s.includes("text=") || s.includes("dummyimage"); };
const TOKEN_STOPWORDS = new Set([
  "ve", "ile", "the", "and", "for", "voy", "menu", "menusu", "menüsünden", "menüsunden", "ozel", "özel",
  "iced", "ice", "sicak", "soguk", "small", "medium", "large", "double", "single", "kucuk", "buyuk", "orta",
  "m", "l", "xl", "xxl", "cm", "gr", "ml",
]);
const tokenize = (value) => norm(value).split(" ").filter((t) => t && t.length >= 2 && !TOKEN_STOPWORDS.has(t));

const parseArgs = () => {
  const a = process.argv.slice(2);
  const o = { dryRun: true, write: false, files: [], dataDir: DATA_DIR, reportPath: DEFAULT_REPORT, apiKey: "", verbose: false };
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] === "--write") { o.write = true; o.dryRun = false; continue; }
    if (a[i] === "--dry-run") { o.write = false; o.dryRun = true; continue; }
    if (a[i] === "--file" && a[i + 1]) { o.files.push(path.resolve(process.cwd(), a[i + 1])); i += 1; continue; }
    if (a[i] === "--data-dir" && a[i + 1]) { o.dataDir = path.resolve(process.cwd(), a[i + 1]); i += 1; continue; }
    if (a[i] === "--report" && a[i + 1]) { o.reportPath = path.resolve(process.cwd(), a[i + 1]); i += 1; continue; }
    if (a[i] === "--api-key" && a[i + 1]) { o.apiKey = a[i + 1]; i += 1; continue; }
    if (a[i] === "--verbose") { o.verbose = true; continue; }
  }
  return o;
};

const readJson = async (f, fb = null) => { try { return JSON.parse(await fs.readFile(f, "utf8")); } catch { return fb; } };
const writeJson = async (f, d) => fs.writeFile(f, `${JSON.stringify(d, null, 2)}\n`, "utf8");
const resolveApiKey = async (opt) => {
  if (opt.apiKey?.trim()) return opt.apiKey.trim();
  const env = process.env.PEXELS_API_KEY || process.env.EXPO_PUBLIC_PEXELS_API_KEY || "";
  if (env.trim()) return env.trim();
  const appA = await readJson(path.resolve(__dirname, "../app.json"), null);
  const appB = await readJson(path.resolve(__dirname, "../../app.json"), null);
  return String(appA?.expo?.extra?.EXPO_PUBLIC_PEXELS_API_KEY || appB?.expo?.extra?.EXPO_PUBLIC_PEXELS_API_KEY || "").trim();
};

const listFiles = async (opt) => {
  if (opt.files.length) return opt.files;
  const d = await fs.readdir(opt.dataDir, { withFileTypes: true });
  return d.filter((x) => x.isFile() && x.name.endsWith("-firestore.json")).map((x) => path.join(opt.dataDir, x.name)).sort();
};

const listAllDataFiles = async (dataDir) => {
  const d = await fs.readdir(dataDir, { withFileTypes: true });
  return d.filter((x) => x.isFile() && x.name.endsWith("-firestore.json")).map((x) => path.join(dataDir, x.name)).sort();
};

const categoryMap = (cats) => {
  const m = new Map();
  for (const c of cats || []) { const id = String(c?.id || "").trim(); if (id) m.set(id, String(c?.name || id)); }
  return m;
};

const categoryProfile = (ids, map) => {
  const arr = Array.isArray(ids) ? ids : ids ? [ids] : [];
  const id = String(arr[0] || "uncategorized");
  const label = String(map.get(id) || id || "Uncategorized");
  const n = norm(`${id} ${label}`);
  for (const [group, primaryType, words] of CATEGORY_RULES) if (has(n, words)) return { group, primaryType, id, label };
  return { group: "unknown", primaryType: "unknown", id, label };
};

const protein = (t, group) => {
  if (has(t, ["falafel"])) return "falafel";
  if (has(t, ["tuna"])) return "tuna";
  if (has(t, ["kofte", "kofta", "meatball"])) return "meatball";
  if (has(t, ["chicken", "tavuk"])) return "chicken";
  if (has(t, ["beef", "et", "dana", "pastirma", "meat"])) return "beef";
  if (has(t, ["vegetarian", "vegan", "vejetaryen", "vejeteryan"])) return "vegetarian";
  if (has(t, ["cheese", "halloumi", "hellim", "kasar"])) return "cheese";
  if (group === "burger") return "beef";
  if (group === "main") return "chicken";
  return null;
};

const modifiers = (t, group) => uniq([
  has(t, ["crispy"]) ? "crispy" : "",
  has(t, ["grilled", "izgara", "sis", "skewer"]) ? "grilled" : "",
  has(t, ["double", "duble"]) ? "double" : "",
  has(t, ["cheese", "halloumi", "hellim", "kasar"]) ? "cheese" : "",
  has(t, ["bbq", "barbeku"]) ? "bbq" : "",
  has(t, ["spicy", "acili", "mexican"]) ? "spicy" : "",
  has(t, ["mushroom", "mantar"]) ? "mushroom" : "",
  has(t, ["mustard", "hardal", "honey mustard"]) ? "honey_mustard" : "",
  has(t, ["curry"]) ? "curry" : "",
  has(t, ["cream", "creamy", "krema", "stroganoff", "cafe de paris"]) ? "cream" : "",
  has(t, ["kids", "cocuk", "ocuk"]) || group === "kids" ? "kids" : "",
]);

const inferSnack = (t) => {
  if (has(t, ["onion ring", "sogan halkasi", "mozzarella", "samosa", "falafel", "fries", "patates", "chips", "wedges", "curly"])) return "fries";
  if (has(t, ["tender", "strip", "nugget", "wing", "kanat", "popcorn", "schnitzel", "goujon", "kentucky"])) return "fried_chicken";
  return "snack_box";
};
const inferMain = (t, p) => {
  if (has(t, ["tender", "strip", "nugget", "wing", "kanat", "popcorn", "schnitzel", "goujon", "kentucky", "crispy"])) return "fried_chicken";
  if (p === "meatball" || p === "beef") return "meat_plate";
  if (has(t, ["grilled", "izgara", "sis", "skewer", "pirzola"])) return "grilled_chicken";
  return "chicken_plate";
};
const inferText = (t) => {
  if (has(t, ["lahmacun"])) return "lahmacun";
  if (has(t, ["gozleme"])) return "gozleme";
  if (has(t, ["tantuni"])) return "tantuni";
  if (has(t, ["pide"])) return "pide";
  if (has(t, ["pizza", "margherita", "pepperoni"])) return "pizza";
  if (has(t, ["burger", "hamburger", "cheeseburger"])) return "burger";
  if (has(t, ["wrap", "durum", "shawarma", "tortilla"])) return "wrap";
  if (has(t, ["pasta", "makarna", "spaghetti", "penne"])) return "pasta";
  if (has(t, ["salad", "salata", "caesar"])) return "salad";
  if (has(t, ["coffee", "kahve", "latte", "espresso", "tea", "cay"])) return "coffee";
  if (has(t, ["chai", "frappe", "hot chocolate", "sicak cikolata"])) return "coffee";
  if (has(t, ["drink", "cola", "fanta", "sprite", "ayran", "water"])) return "drink";
  if (has(t, ["ice cream", "dondurma", "dessert", "tatli", "tatlilar", "donut", "brownie", "browni", "cheesecake", "tiramisu", "cookie", "kek", "cup", "sufle", "san sebastian", "pasta"])) return "dessert";
  if (has(t, ["bowl", "acai"])) return "bowl";
  if (has(t, ["sandwich", "toast", "tost"])) return "sandwich";
  if (has(t, ["fries", "chips", "wedges", "onion rings"])) return "fries";
  if (has(t, ["tender", "nugget", "wing", "popcorn", "schnitzel", "goujon"])) return "fried_chicken";
  if (has(t, ["chicken", "tavuk"])) return "chicken_plate";
  return "unknown";
};

const familyKey = (name, primaryType) => {
  const drop = new Set(["s", "m", "l", "small", "medium", "large", "buyuk", "kucuk", "orta", "aile", "boy", "menu", "combo", "adet", "cm", "double", "duble"]);
  const toks = norm(name).split(" ").filter(Boolean).filter((x) => !/^([abwkpt]\d{1,3})$/i.test(x)).filter((x) => !/^\d+(cm|gr|ml)?$/i.test(x)).filter((x) => !drop.has(x));
  const v = (primaryType === "pizza" ? toks.filter((x) => x !== "pizza").slice(0, 4) : toks.slice(0, 5)).join(" ").trim();
  return v || norm(name).slice(0, 40) || "menu-item";
};

const manualOverride = (restaurantId, itemName) => {
  const r = String(restaurantId || "").toLowerCase();
  const n = norm(itemName);
  const sec = MANUAL[r]; if (!sec) return null;
  if (sec[n]) return sec[n];
  for (const [k, v] of Object.entries(sec)) if (n.startsWith(norm(k))) return v;
  return null;
};
const queriesFor = (intent) => {
  const { primaryType, protein: p, modifiers: m, text: t } = intent; const q = [];
  if (primaryType === "burger") {
    const pp = p === "chicken" ? "chicken" : p === "falafel" ? "falafel" : p === "vegetarian" ? "vegetarian" : p === "cheese" ? "cheese" : "beef";
    q.push(`${m.includes("double") ? "double " : ""}${m.includes("spicy") ? "spicy " : ""}${m.includes("crispy") ? "crispy " : ""}${m.includes("mushroom") ? "mushroom " : ""}${m.includes("bbq") ? "bbq " : ""}${pp} burger`.trim(), `${pp} burger`, "cheeseburger", "classic beef burger");
  } else if (primaryType === "wrap") {
    const pp = p === "chicken" ? "chicken" : p === "beef" || p === "meatball" ? "beef" : p === "falafel" || p === "vegetarian" ? "falafel" : "chicken";
    q.push(`${m.includes("crispy") ? "crispy " : ""}${m.includes("spicy") ? "spicy " : ""}${pp} wrap`.trim(), `${pp} durum wrap`, "turkish durum wrap");
  } else if (primaryType === "tantuni") {
    q.push(`${p === "chicken" ? "chicken" : "meat"} tantuni wrap`, "tantuni wrap", "turkish meat wrap");
  } else if (primaryType === "pizza") {
    if (has(t, ["margherita", "margarita"])) q.push("margherita pizza");
    if (has(t, ["pepperoni"])) q.push("pepperoni pizza");
    if (has(t, ["bbq", "barbeku"])) q.push("bbq chicken pizza");
    if (has(t, ["mushroom", "mantar"])) q.push("mushroom pizza");
    if (has(t, ["tuna"])) q.push("tuna pizza");
    if (has(t, ["vegetarian", "vejetaryen", "vegan"])) q.push("vegetarian pizza");
    if (has(t, ["sucuk", "sausage"])) q.push("sausage pizza");
    q.push("mixed pizza", "pizza");
  } else if (primaryType === "pide") {
    if (has(t, ["kiymali", "minced", "kofte", "beef"])) q.push("minced meat pide");
    if (has(t, ["cheese", "kasar"])) q.push("cheese pide");
    if (has(t, ["chicken", "tavuk"])) q.push("chicken pide");
    q.push("turkish pide", "turkish flatbread pide");
  } else if (primaryType === "lahmacun") {
    if (has(t, ["cheese", "kasar"])) q.push("cheese lahmacun");
    q.push("lahmacun", "turkish lahmacun");
  } else if (primaryType === "gozleme") {
    q.push("gozleme", "turkish flatbread", "stuffed flatbread");
  } else if (primaryType === "fried_chicken") {
    if (has(t, ["schnitzel"])) q.push("chicken schnitzel");
    if (has(t, ["goujon", "gujon"])) q.push("chicken goujons");
    if (has(t, ["nugget"])) q.push("fried chicken nuggets");
    if (has(t, ["popcorn"])) q.push("popcorn chicken");
    if (has(t, ["wing", "kanat"])) q.push("fried chicken wings");
    if (has(t, ["tender", "strip", "crispy"])) q.push("chicken tenders");
    q.push("crispy chicken strips", "fried chicken");
  } else if (primaryType === "grilled_chicken") {
    if (has(t, ["sis", "skewer"])) q.push("chicken skewer plate");
    if (has(t, ["wing", "kanat"])) q.push("grilled chicken wings");
    q.push("grilled chicken plate", "chicken with rice and salad");
  } else if (primaryType === "chicken_plate") {
    if (m.includes("mushroom")) q.push("creamy mushroom chicken");
    if (m.includes("curry")) q.push("creamy curry chicken");
    if (m.includes("honey_mustard")) q.push("honey mustard chicken plate");
    if (m.includes("cream")) q.push("creamy chicken plate");
    q.push("chicken plate with rice", "chicken dish plate");
  } else if (primaryType === "meat_plate") {
    if (has(t, ["adana"])) q.push("adana kebab plate");
    if (has(t, ["kofte", "kofta"])) q.push("kofte plate");
    q.push("grilled meat plate", "kebab plate");
  } else if (primaryType === "pasta") {
    if (has(t, ["alfredo", "cream", "creamy"])) q.push("fettuccine alfredo");
    if (has(t, ["bolognese"])) q.push("spaghetti bolognese");
    if (has(t, ["pesto"])) q.push("pesto pasta");
    if (has(t, ["penne"])) q.push("penne pasta");
    if (has(t, ["tagliatelle"])) q.push("tagliatelle pasta");
    q.push("creamy chicken pasta", "pasta");
  } else if (primaryType === "salad") {
    if (has(t, ["caesar"])) q.push("caesar salad");
    if (p === "chicken") q.push("chicken salad");
    if (p === "tuna") q.push("tuna salad");
    if (p === "falafel") q.push("falafel salad");
    if (p === "cheese" || has(t, ["halloumi", "hellim"])) q.push("halloumi salad");
    q.push("fresh salad");
  } else if (primaryType === "fries") {
    if (has(t, ["onion ring", "sogan halkasi"])) q.push("onion rings");
    if (has(t, ["mozzarella", "peynir cubuk"])) q.push("mozzarella sticks");
    if (has(t, ["wedges", "elma dilim"])) q.push("potato wedges");
    if (has(t, ["curly", "kivircik"])) q.push("curly fries");
    if (has(t, ["bacon"])) q.push("bacon cheese fries");
    if (has(t, ["cheese", "peynir"])) q.push("loaded cheese fries");
    if (has(t, ["samosa"])) q.push("samosa");
    if (has(t, ["falafel"])) q.push("falafel balls");
    q.push("french fries");
  } else if (primaryType === "snack_box") {
    if (has(t, ["poutine"])) q.push("chicken poutine");
    q.push("snack box", "fried chicken box with fries", "mixed fried platter");
  } else if (primaryType === "drink") {
    if (has(t, ["cola", "coca cola"])) q.push("cola can");
    if (has(t, ["sprite"])) q.push("sprite can");
    if (has(t, ["fanta"])) q.push("fanta can");
    if (has(t, ["ayran"])) q.push("ayran drink");
    if (has(t, ["water", "su"])) q.push("bottled water");
    if (has(t, ["iced tea", "ice tea", "fuse tea"])) q.push("iced tea bottle");
    q.push("soft drink can");
  } else if (primaryType === "coffee") {
    if (has(t, ["turkish", "turk", "turk kahvesi"])) q.push("turkish coffee");
    if (has(t, ["tea", "cay"])) q.push("tea glass");
    if (has(t, ["cappuccino"])) q.push("cappuccino");
    if (has(t, ["latte"])) q.push("latte coffee");
    if (has(t, ["espresso"])) q.push("espresso");
    q.push("coffee cup");
  } else if (primaryType === "dessert") {
    if (has(t, ["donut"])) q.push("donut dessert");
    if (has(t, ["brownie", "browni", "islak kek"])) q.push("brownie dessert");
    if (has(t, ["cheesecake", "san sebastian"])) q.push("cheesecake");
    if (has(t, ["tiramisu"])) q.push("tiramisu");
    if (has(t, ["cookie"])) q.push("cookie dessert");
    if (has(t, ["cake", "kek", "pasta", "mozaik"])) q.push("cake dessert");
    if (has(t, ["ice cream", "dondurma"])) q.push("ice cream scoop");
    q.push("dessert");
  } else if (primaryType === "bowl") {
    if (has(t, ["acai"])) q.push("acai bowl");
    if (p === "chicken") q.push("chicken bowl");
    if (p === "vegetarian") q.push("vegetarian bowl");
    q.push("healthy bowl meal");
  } else if (primaryType === "sandwich") {
    if (p === "chicken") q.push("chicken sandwich toast");
    if (p === "beef") q.push("beef sandwich toast");
    q.push("toast sandwich", "grilled sandwich");
  }
  if (primaryType === "coffee") {
    if (has(t, ["frappe"])) q.unshift("iced frappe");
    if (has(t, ["chai"])) q.unshift("chai latte");
    if (has(t, ["hot chocolate", "sicak cikolata"])) q.unshift("hot chocolate drink");
  }
  if (primaryType === "drink") {
    if (has(t, ["lemonade", "limonata"])) q.unshift("lemonade drink");
    if (has(t, ["milkshake"])) q.unshift("milkshake");
    if (has(t, ["smoothie"])) q.unshift("smoothie drink");
  }
  return uniq(q.map(norm)).filter(Boolean).slice(0, 6);
};

const intentFor = ({ item, category, override }) => {
  const nameText = norm(String(item?.name || ""));
  const fullText = norm(`${String(item?.name || "")} ${String(item?.description || "")}`);
  let primaryType = category.primaryType || "unknown";
  const p = protein(nameText, category.group);
  const m = modifiers(nameText, category.group);

  if (override?.primaryType) primaryType = override.primaryType;
  else if (category.group === "snack" || category.group === "chicken_box") primaryType = inferSnack(nameText);
  else if (category.group === "main") primaryType = inferMain(nameText, p);
  else if (category.group === "tenders") primaryType = "fried_chicken";
  else if (category.group === "campaign") primaryType = inferText(nameText) === "unknown" ? "pizza" : inferText(nameText);
  else if (category.group === "extras") {
    if (has(nameText, ["fries", "patates", "chips", "onion ring", "sogan halkasi", "mozzarella", "samosa", "falafel"])) primaryType = "fries";
    else if (has(nameText, ["tender", "strip", "nugget", "wing", "kanat", "schnitzel", "goujon"])) primaryType = "fried_chicken";
    else if (has(nameText, ["cola", "sprite", "fanta", "water", "su", "drink", "icecek"])) primaryType = "drink";
    else primaryType = "unknown";
  } else if (primaryType === "pide" && has(nameText, ["lahmacun"])) primaryType = "lahmacun";
  else if (primaryType === "wrap" && has(nameText, ["tantuni"])) primaryType = "tantuni";
  else if (primaryType === "unknown") primaryType = inferText(nameText);

  const confBase = Math.min(20, 6 + (category.group !== "unknown" ? 4 : 0) + (has(nameText, TYPE_TERMS[primaryType] || []) ? 6 : 0) + (p ? 2 : 0));
  const pp = override?.protein || p;
  const mm = uniq([...(m || []), ...((override?.modifiers || []).map(String))]);
  const searchQueries = uniq([...(override?.queries || []), ...queriesFor({ primaryType, protein: pp, modifiers: mm, text: nameText })]);
  const negativeKeywords = uniq([...(NEG[primaryType] || NEG.unknown), ...((override?.negative || []).map(norm))]);

  return { primaryType, protein: pp, modifiers: mm, searchQueries, negativeKeywords, confidenceBase: confBase, text: fullText };
};

const visualType = (alt) => {
  const t = norm(alt || ""); let best = null; let score = 0;
  for (const [type, words] of Object.entries(TYPE_TERMS)) {
    let s = 0; for (const w of words) if (t.includes(norm(w))) s += w.includes(" ") ? 2 : 1;
    if (s > score) { score = s; best = type; }
  }
  return score > 0 ? best : null;
};
const hardMismatch = (expected, visual) => {
  if (!expected || !visual) return false;
  if (expected === "burger" && ["wrap", "pizza", "pasta", "chicken_plate", "meat_plate"].includes(visual)) return true;
  if (expected === "wrap" && ["burger", "pizza", "pasta", "chicken_plate", "meat_plate"].includes(visual)) return true;
  if (expected === "pizza" && ["burger", "wrap", "pasta", "chicken_plate", "meat_plate"].includes(visual)) return true;
  return false;
};

const compat = (expected, visual) => {
  if (!expected || !visual || expected === visual) return true;
  const m = {
    burger: ["burger"], wrap: ["wrap", "tantuni"], pizza: ["pizza"],
    pide: ["pide", "lahmacun", "gozleme"], lahmacun: ["lahmacun", "pide"], gozleme: ["gozleme", "pide"], tantuni: ["tantuni", "wrap"],
    fried_chicken: ["fried_chicken", "snack_box"], grilled_chicken: ["grilled_chicken", "chicken_plate"], chicken_plate: ["chicken_plate", "grilled_chicken"], meat_plate: ["meat_plate", "grilled_chicken"],
    pasta: ["pasta"], salad: ["salad", "bowl"], fries: ["fries", "snack_box", "fried_chicken"], snack_box: ["snack_box", "fried_chicken", "fries"],
    drink: ["drink"], coffee: ["coffee", "drink"], dessert: ["dessert"], bowl: ["bowl", "salad"], sandwich: ["sandwich", "wrap"], unknown: [visual],
  };
  return (m[expected] || [expected]).includes(visual);
};

const proteinTerms = (p) => ({ chicken: ["chicken"], beef: ["beef", "meat"], meatball: ["meatball", "kofte", "kofta"], tuna: ["tuna"], falafel: ["falafel"], vegetarian: ["vegetarian", "vegan"], cheese: ["cheese", "halloumi"] }[p] || []);
const modTerms = (m) => ({ crispy: ["crispy", "fried"], grilled: ["grilled", "barbecue"], double: ["double"], cheese: ["cheese", "cheesy"], bbq: ["bbq", "barbecue"], spicy: ["spicy", "hot"], mushroom: ["mushroom"], honey_mustard: ["honey mustard", "mustard"], curry: ["curry"], cream: ["cream", "creamy"], kids: ["kids", "small"] }[m] || []);

const countMap = (map, key, value) => Number(map.get(key)?.get(value) || 0);
const incMap = (map, key, value) => { if (!map.has(key)) map.set(key, new Map()); const m = map.get(key); m.set(value, Number(m.get(value) || 0) + 1); };
const getSet = (map, key) => { if (!map.has(key)) map.set(key, new Set()); return map.get(key); };

const registerUsage = (reg, restaurantId, categoryKey, imageUrl, family) => {
  if (!isHttp(imageUrl) || isPlaceholder(imageUrl)) return;
  incMap(reg.byR, restaurantId, imageUrl);
  incMap(reg.byRC, `${restaurantId}|${categoryKey}`, imageUrl);
  reg.global.set(imageUrl, Number(reg.global.get(imageUrl) || 0) + 1);
  getSet(reg.fams, `${restaurantId}|${categoryKey}|${imageUrl}`).add(family || "");
};

const canReuseFamily = (reg, restaurantId, categoryKey, imageUrl, family) => {
  const s = reg.fams.get(`${restaurantId}|${categoryKey}|${imageUrl}`);
  if (!s || s.size === 0) return true;
  return s.has(family || "");
};

const overlapCount = (left, rightSet) => {
  let c = 0;
  for (const t of left || []) if (rightSet.has(t)) c += 1;
  return c;
};

const buildOfflinePool = async ({ allFiles, targetFiles }) => {
  const entries = [];
  const byType = new Map();
  const targetSet = new Set((targetFiles || []).map((x) => path.resolve(x)));

  for (const filePath of allFiles || []) {
    const abs = path.resolve(filePath);
    if (targetSet.has(abs)) continue;

    const data = await readJson(abs, null);
    if (!data || typeof data !== "object") continue;

    const menus = Array.isArray(data.menus) ? data.menus : [];
    const cats = categoryMap(Array.isArray(data.categories) ? data.categories : []);
    const restaurantId = String(data?.restaurants?.[0]?.id || path.basename(abs, path.extname(abs)));

    for (const item of menus) {
      const imageUrl = String(item?.imageUrl || item?.image_url || "").trim();
      if (!isHttp(imageUrl) || isPlaceholder(imageUrl)) continue;

      const cids = Array.isArray(item?.categories) ? item.categories : item?.categories ? [item.categories] : [];
      const category = categoryProfile(cids, cats);
      const over = manualOverride(restaurantId, String(item?.name || ""));
      const intent = intentFor({ item, category, override: over });
      const text = norm(`${String(item?.name || "")} ${String(item?.description || "")} ${category.label} ${category.id}`);
      const tokens = tokenize(text);

      const candidate = {
        imageUrl,
        restaurantId,
        sourceItemId: String(item?.id || item?.$id || ""),
        sourceName: String(item?.name || "").trim(),
        primaryType: intent.primaryType || category.primaryType || "unknown",
        protein: intent.protein || null,
        modifiers: Array.isArray(intent.modifiers) ? intent.modifiers : [],
        text,
        tokenSet: new Set(tokens),
      };
      entries.push(candidate);
      if (!byType.has(candidate.primaryType)) byType.set(candidate.primaryType, []);
      byType.get(candidate.primaryType).push(candidate);
    }
  }

  return { entries, byType };
};

const scoreOfflineCandidate = ({ candidate, intent, context, reg, meta, targetTokens, queryTokens }) => {
  let s = intent.confidenceBase;

  if (intent.primaryType !== "unknown" && candidate.primaryType !== "unknown" && !compat(intent.primaryType, candidate.primaryType)) {
    return { blocked: true, score: s - 30 };
  }

  if (candidate.primaryType === intent.primaryType) s += 20;
  else if (compat(intent.primaryType, candidate.primaryType)) s += 9;
  else s -= 26;

  if (hardMismatch(intent.primaryType, candidate.primaryType)) s -= 35;
  if (candidate.protein && intent.protein) s += candidate.protein === intent.protein ? 8 : -8;

  const modShared = (intent.modifiers || []).filter((m) => (candidate.modifiers || []).includes(m)).length;
  s += Math.min(12, modShared * 3);

  const directOverlap = overlapCount(targetTokens, candidate.tokenSet);
  s += Math.min(18, directOverlap * 2);

  let queryBonus = 0;
  for (const qt of queryTokens || []) {
    if (!qt.length) continue;
    const hit = overlapCount(qt, candidate.tokenSet);
    const ratio = hit / qt.length;
    if (ratio >= 1 && qt.length >= 2) queryBonus = Math.max(queryBonus, 8);
    else if (ratio >= 0.66 && qt.length >= 3) queryBonus = Math.max(queryBonus, 6);
    else if (ratio >= 0.5) queryBonus = Math.max(queryBonus, 3);
  }
  s += queryBonus;

  if (intent.negativeKeywords.length && has(candidate.text, intent.negativeKeywords)) s -= 12;

  const rCount = countMap(reg.byR, context.restaurantId, candidate.imageUrl);
  const cCount = countMap(reg.byRC, `${context.restaurantId}|${context.categoryKey}`, candidate.imageUrl);
  const gCount = Number(reg.global.get(candidate.imageUrl) || 0);
  if (cCount > 0) s -= 15;
  if (rCount >= 2) s -= 10;
  if (gCount >= 8) s -= 5;

  if (cCount >= DUP_LIMIT_CATEGORY && !canReuseFamily(reg, context.restaurantId, context.categoryKey, candidate.imageUrl, context.family)) {
    meta.duplicatesAvoided += 1;
    return { blocked: true, score: s };
  }
  return { blocked: false, score: s };
};

const pickBestFromOfflinePool = ({ pool, intent, context, reg, meta }) => {
  if (!pool?.entries?.length) return { best: null, low: null };

  const typeBucket = pool.byType.get(intent.primaryType) || [];
  const compatBucket = [];
  for (const [type, arr] of pool.byType.entries()) {
    if (type === intent.primaryType) continue;
    if (compat(intent.primaryType, type)) compatBucket.push(...arr);
  }

  const candidates = [...typeBucket, ...compatBucket];
  if (!candidates.length) return { best: null, low: null };

  const targetTokens = tokenize(`${context.itemName || ""} ${intent.text} ${context.category.label || ""} ${context.category.id || ""}`);
  const queryTokens = (intent.searchQueries || []).map((q) => tokenize(q)).filter((x) => x.length);

  let best = null;
  let low = null;
  const seen = new Set();
  for (const cand of candidates) {
    const key = `${cand.imageUrl}|${cand.primaryType}|${cand.sourceName}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const scored = scoreOfflineCandidate({ candidate: cand, intent, context, reg, meta, targetTokens, queryTokens });
    if (scored.blocked) continue;

    const row = {
      imageUrl: cand.imageUrl,
      query: `offline:${cand.sourceName}`,
      qIdx: 0,
      score: scored.score,
      sourceRestaurantId: cand.restaurantId,
      sourceType: cand.primaryType,
    };
    if (!low || row.score > low.score) low = row;
    if (row.score < OFFLINE_POOL_THRESHOLD_MEDIUM) continue;
    if (!best || row.score > best.score) best = row;
  }

  if (best && best.score >= OFFLINE_POOL_THRESHOLD_STRONG) return { best, low };
  return { best, low };
};

const cacheSearch = async (apiKey, query, cache) => {
  const k = norm(query);
  if (!k) return [];
  if (cache.has(k)) return cache.get(k);
  const p = (async () => {
    const res = await fetch(`https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=40`, { headers: { Authorization: apiKey } });
    if (!res.ok) throw new Error(`Pexels ${res.status}`);
    const js = await res.json();
    return (Array.isArray(js?.photos) ? js.photos : []).map((x) => ({ id: String(x?.id || ""), alt: String(x?.alt || ""), width: Number(x?.width || 0), height: Number(x?.height || 0), url: String(x?.src?.medium || x?.src?.large || x?.src?.original || "") })).filter((x) => isHttp(x.url));
  })();
  cache.set(k, p);
  return p;
};

const scorePhoto = ({ photo, query, qIdx, context, intent, reg, meta }) => {
  const alt = norm(photo.alt || "");
  const vType = visualType(alt);
  let s = intent.confidenceBase;

  if (has(alt, TYPE_TERMS[intent.primaryType] || [])) s += 20;
  if (context.category.primaryType && has(alt, TYPE_TERMS[context.category.primaryType] || [])) s += 12;
  if (proteinTerms(intent.protein).length && has(alt, proteinTerms(intent.protein))) s += 8;
  for (const md of intent.modifiers) if (modTerms(md).length && has(alt, modTerms(md))) s += 4;

  if (qIdx === 0 || norm(query).split(" ").filter(Boolean).length >= 2) s += 5;
  const w = Number(photo.width || 0), h = Number(photo.height || 0);
  if (w > 0 && h > 0) { const r = w / h; if (r >= 0.8 && r <= 1.4) s += 5; else if (r >= 0.65 && r <= 1.8) s += 2; }

  if (intent.negativeKeywords.length && has(alt, intent.negativeKeywords)) s -= 20;
  if (vType && !compat(intent.primaryType, vType)) s -= 25;
  if (hardMismatch(intent.primaryType, vType)) s -= 30;

  const rCount = countMap(reg.byR, context.restaurantId, photo.url);
  const cCount = countMap(reg.byRC, `${context.restaurantId}|${context.categoryKey}`, photo.url);
  const gCount = Number(reg.global.get(photo.url) || 0);
  if (cCount > 0) s -= 15;
  if (rCount >= 2) s -= 10;
  if (gCount >= 8) s -= 5;

  if (cCount >= DUP_LIMIT_CATEGORY && !canReuseFamily(reg, context.restaurantId, context.categoryKey, photo.url, context.family)) {
    meta.duplicatesAvoided += 1;
    return { blocked: true, score: s };
  }
  return { blocked: false, score: s };
};

const pickBest = async ({ apiKey, intent, context, reg, cache, errors, meta, writeMode }) => {
  if (!intent.searchQueries.length || !apiKey) return { best: null, low: null };
  let best = null, low = null;
  const seen = new Set();
  for (let qi = 0; qi < intent.searchQueries.length; qi += 1) {
    const q = intent.searchQueries[qi];
    let photos = [];
    try { photos = await cacheSearch(apiKey, q, cache); } catch (e) { errors.push({ restaurantId: context.restaurantId, itemId: context.itemId, query: q, error: e?.message || String(e) }); continue; }
    for (const p of photos) {
      const id = String(p.id || p.url || "");
      if (!id || seen.has(id)) continue;
      seen.add(id);
      const sc = scorePhoto({ photo: p, query: q, qIdx: qi, context, intent, reg, meta });
      if (sc.blocked) continue;
      const c = { imageUrl: p.url, query: q, qIdx: qi, score: sc.score };
      if (!low || c.score > low.score) low = c;
      if (c.score < THRESHOLD_MEDIUM) continue;
      if (!best || c.score > best.score || (c.score === best.score && c.qIdx < best.qIdx)) best = c;
    }
    if (best && best.score >= 38) break;
    if (!writeMode) await new Promise((r) => setTimeout(r, 20));
  }
  return { best, low };
};

const confidence = (score) => (score >= THRESHOLD_HIGH ? "high" : score >= THRESHOLD_MEDIUM ? "medium" : "low");
const run = async () => {
  const opt = parseArgs();
  const apiKey = await resolveApiKey(opt);
  const files = await listFiles(opt);
  if (!files.length) throw new Error("No target files found.");
  const allDataFiles = await listAllDataFiles(opt.dataDir);
  const offlinePool = !apiKey ? await buildOfflinePool({ allFiles: allDataFiles, targetFiles: files }) : { entries: [], byType: new Map() };

  const cache = new Map();
  const queryErrors = [];
  const reg = { byR: new Map(), byRC: new Map(), global: new Map(), fams: new Map() };
  const meta = { duplicatesAvoided: 0 };

  const rows = [];
  const restaurants = new Set();
  let total = 0, existingRemote = 0, updated = 0, keptPlaceholders = 0, lowMatches = 0, manualReview = 0;
  const fileErrors = [];

  for (const filePath of files) {
    const data = await readJson(filePath, null);
    if (!data || typeof data !== "object") { fileErrors.push({ filePath, error: "Could not parse JSON" }); continue; }

    const menus = Array.isArray(data.menus) ? data.menus : [];
    const cats = categoryMap(Array.isArray(data.categories) ? data.categories : []);
    const restaurantId = String(data?.restaurants?.[0]?.id || path.basename(filePath, path.extname(filePath)));
    restaurants.add(restaurantId);

    const ordered = [...menus].sort((a, b) => `${restaurantId}|${String(a?.id || a?.$id || "")}|${norm(a?.name || "")}`.localeCompare(`${restaurantId}|${String(b?.id || b?.$id || "")}|${norm(b?.name || "")}`));

    let changedInFile = 0;

    for (const item of ordered) {
      total += 1;
      const itemId = String(item?.id || item?.$id || `${restaurantId}-menu-${total}`);
      const name = String(item?.name || "").trim();
      const oldUrl = String(item?.imageUrl || item?.image_url || "").trim();
      if (isHttp(oldUrl) && !isPlaceholder(oldUrl)) existingRemote += 1;

      const cids = Array.isArray(item?.categories) ? item.categories : item?.categories ? [item.categories] : [];
      const category = categoryProfile(cids, cats);
      const categoryKey = norm(category.id || category.label || category.group || "uncategorized").replace(/\s+/g, "-") || "uncategorized";
      const family = familyKey(name, category.primaryType || "unknown");

      const over = manualOverride(restaurantId, name);
      const intent = intentFor({ item, category, override: over });
      const context = { restaurantId, itemId, itemName: name, category, categoryKey, family };

      let selected = null;
      let low = null;
      const warnings = [];

      if (apiKey && intent.searchQueries.length) {
        const r = await pickBest({ apiKey, intent, context, reg, cache, errors: queryErrors, meta, writeMode: opt.write });
        selected = r.best;
        low = r.low;
      } else if (!apiKey && offlinePool.entries.length) {
        const r = pickBestFromOfflinePool({ pool: offlinePool, intent, context, reg, meta });
        selected = r.best;
        low = r.low;
        if (!selected) warnings.push("Pexels API key missing; offline pool could not find a high-confidence match.");
      } else if (!apiKey) {
        warnings.push("Pexels API key missing; no live search executed.");
      }

      let newUrl = oldUrl;
      let status = "unchanged";
      let score = selected?.score ?? low?.score ?? null;
      let selectedQuery = selected?.query || low?.query || "";
      let conf = score === null ? "low" : confidence(score);

      if (selected) {
        newUrl = selected.imageUrl;
        status = selected?.query?.startsWith("offline:") ? "assigned-offline-pool" : "assigned";
        conf = confidence(selected.score);
      } else {
        if (low) {
          lowMatches += 1;
          const minScore = apiKey ? THRESHOLD_MEDIUM : OFFLINE_POOL_THRESHOLD_MEDIUM;
          warnings.push(`Best score ${low.score} below ${minScore}.`);
        }
        if (!apiKey && oldUrl) {
          newUrl = oldUrl;
          status = "kept-existing-no-api";
          warnings.push("Needs manual review until API-backed run.");
          manualReview += 1;
        } else {
          newUrl = isPlaceholder(oldUrl) && oldUrl ? oldUrl : (PLACEHOLDER[intent.primaryType] || PLACEHOLDER.unknown);
          if (isPlaceholder(oldUrl) && oldUrl) { status = "placeholder-kept"; keptPlaceholders += 1; }
          else status = "placeholder-assigned";
          warnings.push("Needs manual review.");
          manualReview += 1;
        }
      }

      if (!newUrl) {
        newUrl = PLACEHOLDER[intent.primaryType] || PLACEHOLDER.unknown;
        status = "placeholder-assigned";
        warnings.push("Resolved empty image to category placeholder.");
        manualReview += 1;
      }

      if (over) warnings.push("Manual override applied.");

      const changed = String(oldUrl || "") !== String(newUrl || "");
      if (changed) {
        updated += 1;
        changedInFile += 1;
        if (opt.write) {
          item.imageUrl = newUrl;
          if (Object.prototype.hasOwnProperty.call(item, "image_url")) item.image_url = newUrl;
        }
      }

      if (status.startsWith("assigned")) registerUsage(reg, restaurantId, categoryKey, newUrl, family);

      rows.push({
        restaurantId,
        file: path.basename(filePath),
        itemId,
        name,
        category: category.id,
        categoryLabel: category.label,
        selectedQuery,
        imageUrl: newUrl,
        previousImageUrl: oldUrl,
        score,
        confidence: conf,
        status,
        changed,
        primaryType: intent.primaryType,
        protein: intent.protein,
        modifiers: intent.modifiers,
        searchQueries: intent.searchQueries,
        negativeKeywords: intent.negativeKeywords,
        warnings,
      });

      if (opt.verbose) console.log(`[${status}] ${restaurantId} ${itemId} ${name} query="${selectedQuery}" score=${score ?? "n/a"}`);
    }

    if (opt.write && changedInFile > 0) await writeJson(filePath, data);
  }

  rows.sort((a, b) => `${a.restaurantId}|${a.file}|${a.itemId}`.localeCompare(`${b.restaurantId}|${b.file}|${b.itemId}`));

  const summary = {
    filesScanned: files.length,
    restaurantsScanned: restaurants.size,
    offlinePoolCandidates: offlinePool.entries.length,
    totalMenuItems: total,
    itemsWithExistingRemoteImages: existingRemote,
    itemsUpdated: updated,
    placeholdersKept: keptPlaceholders,
    lowConfidenceMatches: lowMatches,
    duplicatesAvoided: meta.duplicatesAvoided,
    itemsNeedingManualReview: manualReview,
    queryErrors: queryErrors.length,
    fileErrors: fileErrors.length,
  };

  await writeJson(opt.reportPath, {
    generatedAt: new Date().toISOString(),
    mode: opt.write ? "write" : "dry-run",
    options: { dryRun: opt.dryRun, write: opt.write, files, reportPath: opt.reportPath },
    audit: AUDIT,
    summary,
    fileErrors,
    queryErrors,
    items: rows,
  });

  console.log("\n=== Menu Image Assignment Report ===");
  console.log(`Files scanned: ${summary.filesScanned}`);
  console.log(`Restaurants scanned: ${summary.restaurantsScanned}`);
  console.log(`Offline pool candidates: ${summary.offlinePoolCandidates}`);
  console.log(`Total menu items: ${summary.totalMenuItems}`);
  console.log(`Items with existing remote images: ${summary.itemsWithExistingRemoteImages}`);
  console.log(`Items updated: ${summary.itemsUpdated}`);
  console.log(`Placeholders kept: ${summary.placeholdersKept}`);
  console.log(`Low-confidence matches: ${summary.lowConfidenceMatches}`);
  console.log(`Duplicates avoided: ${summary.duplicatesAvoided}`);
  console.log(`Items needing manual review: ${summary.itemsNeedingManualReview}`);
  console.log(`Query errors: ${summary.queryErrors}`);
  console.log(`File errors: ${summary.fileErrors}`);

  const assigned = rows.filter((r) => r.status.startsWith("assigned"));
  console.log(`Assigned rows: ${assigned.length}`);
  for (const r of assigned) {
    console.log(`ASSIGNED | ${r.restaurantId} | ${r.itemId} | ${r.name} | category=${r.category} | query="${r.selectedQuery}" | score=${r.score} | confidence=${r.confidence}`);
  }

  console.log(`\nMachine report: ${opt.reportPath}`);
  if (!apiKey) console.log("Warning: Pexels API key not resolved. Set PEXELS_API_KEY/EXPO_PUBLIC_PEXELS_API_KEY or use --api-key.");
};

run().catch((e) => {
  console.error("[assign-pexels-menu-images] Failed:", e?.stack || e?.message || e);
  process.exit(1);
});


