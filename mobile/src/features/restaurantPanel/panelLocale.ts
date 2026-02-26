import { useCallback, useEffect, useMemo, useState } from "react";
import { doc, getDoc, setDoc } from "firebase/firestore";

import tr from "@/locales/tr.json";
import en from "@/locales/en.json";
import { firestore } from "@/lib/firebase";
import { storage } from "@/src/lib/storage";

export type PanelLocale = "tr" | "en";
type Dictionary = Record<string, string>;

const DEFAULT_LOCALE: PanelLocale = "tr";
const GLOBAL_LOCALE_KEY = "panel_locale_global";
const restaurantLocaleKey = (restaurantId: string) => `panel_locale_restaurant_${restaurantId}`;

const dictionaries: Record<PanelLocale, Dictionary> = {
    tr: tr as Dictionary,
    en: en as Dictionary,
};
const criticalFallbackTr: Dictionary = {
    "common.restaurantHub": "Restoran Merkezi",
    "button.enableSound": "Sesi A\u00e7",
    "menu.itemCardSubtitle": "Alanlar\u0131 d\u00fczenleyip \u00fcr\u00fcn\u00fc kaydedin.",
    "menu.fieldName": "Ad",
    "menu.fieldPrice": "Fiyat",
    "menu.fieldCategories": "Kategoriler",
    "menu.assigned": "Atanan: {{value}}",
    "menu.visible": "M\u00fc\u015fterilere g\u00f6r\u00fcn\u00fcr",
    "menu.visibleHint": "Kapat\u0131rsan\u0131z bu \u00fcr\u00fcn m\u00fc\u015fterilere g\u00f6r\u00fcnmez.",
    "menu.categoriesTitle": "Kategoriler",
    "menu.categoriesSubtitle": "Men\u00fc gruplar\u0131n\u0131 ekleyin, d\u00fczenleyin, silin.",
    "menu.newCategoryPlaceholder": "Yeni kategori ad\u0131",
    "menu.addCategory": "Ekle",
    "menu.deleteCategory": "Sil",
    "orders.handoverCourier": "Kuryeye teslim et",
    "orders.status.out_for_delivery": "Kuryede",
    "orders.action.handover": "kuryeye teslim etmek",
    "orders.updateFailedTitle": "Sipari\u015f g\u00fcncellenemedi",
    "section.remindedOrders": "Hat\u0131rlat\u0131lan sipari\u015fler",
    "section.remindedOrdersSubtitle": "M\u00fc\u015fteri hat\u0131rlatmalar\u0131 ana sayfada sessiz g\u00f6sterilir.",
    "reminders.justNow": "az \u00f6nce",
    "reminders.minutesAgo": "{{count}} dk \u00f6nce",
    "reminders.openOrder": "A\u00e7",
    "loading.menuTitle": "Men\u00fc verisi y\u00fckleniyor",
    "loading.menuDescription": "\u00dcr\u00fcn ve kategoriler haz\u0131rlan\u0131yor.",
    "loading.historyTitle": "Ge\u00e7mi\u015f sipari\u015fler y\u00fckleniyor",
    "loading.historyDescription": "Sipari\u015f ge\u00e7mi\u015fi haz\u0131rlan\u0131yor.",
    "loading.panelTitle": "Panel y\u00fckleniyor",
    "loading.panelDescription": "Panel haz\u0131rlan\u0131yor.",
    "language.soundOn": "A\u00e7\u0131k",
    "language.soundOff": "Kapal\u0131",
};
const interpolate = (template: string, vars?: Record<string, string | number>) => {
    if (!vars) return template;
    return Object.entries(vars).reduce(
        (acc, [key, value]) => acc.replace(new RegExp(`{{${key}}}`, "g"), String(value)),
        template,
    );
};

const parseLocale = (value: string | null | undefined): PanelLocale | null => {
    if (value === "tr" || value === "en") return value;
    return null;
};

export const formatPanelCurrency = (value: number, locale: PanelLocale) =>
    `${new Intl.NumberFormat(locale === "tr" ? "tr-TR" : "en-US", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    }).format(Number(value || 0))}${locale === "tr" ? " TL" : " TRY"}`;

export const formatPanelDate = (value: number | Date | string, locale: PanelLocale) => {
    const date = value instanceof Date ? value : new Date(value);
    return new Intl.DateTimeFormat(locale === "tr" ? "tr-TR" : "en-US", {
        dateStyle: "short",
        timeStyle: "short",
    }).format(date);
};

export const formatPanelPhone = (raw?: string) => (raw || "").replace(/\s+/g, " ").trim();
export const formatPanelAddress = (raw?: string) => (raw || "").replace(/\s+/g, " ").trim();

export const useRestaurantPanelLocale = (restaurantId?: string | null) => {
    const [locale, setLocaleState] = useState<PanelLocale>(DEFAULT_LOCALE);
    const [ready, setReady] = useState(false);

    useEffect(() => {
        let mounted = true;

        const hydrate = async () => {
            let nextLocale: PanelLocale = DEFAULT_LOCALE;

            const globalRaw = await storage.getItem(GLOBAL_LOCALE_KEY);
            const globalLocale = parseLocale(globalRaw);
            if (globalLocale) {
                nextLocale = globalLocale;
            }

            if (restaurantId) {
                const localRaw = await storage.getItem(restaurantLocaleKey(restaurantId));
                const restaurantLocalLocale = parseLocale(localRaw);
                if (restaurantLocalLocale) {
                    nextLocale = restaurantLocalLocale;
                }

                if (firestore) {
                    const snap = await getDoc(doc(firestore, "restaurants", restaurantId)).catch(() => null);
                    const data = snap?.data() as Record<string, unknown> | undefined;
                    const firestoreLocale = parseLocale(
                        typeof data?.preferredLanguage === "string"
                            ? data.preferredLanguage
                            : typeof data?.panelLocale === "string"
                              ? data.panelLocale
                              : undefined,
                    );
                    if (firestoreLocale) {
                        nextLocale = firestoreLocale;
                    }
                }
            }

            if (!mounted) return;
            setLocaleState(nextLocale);
            setReady(true);
        };

        hydrate().catch(() => {
            if (mounted) {
                setLocaleState(DEFAULT_LOCALE);
                setReady(true);
            }
        });

        return () => {
            mounted = false;
        };
    }, [restaurantId]);

    const setLocale = useCallback(
        async (nextLocale: PanelLocale) => {
            setLocaleState(nextLocale);

            void storage.setItem(GLOBAL_LOCALE_KEY, nextLocale);
            if (restaurantId) {
                void storage.setItem(restaurantLocaleKey(restaurantId), nextLocale);
                if (firestore) {
                    void setDoc(
                        doc(firestore, "restaurants", restaurantId),
                        { preferredLanguage: nextLocale, updatedAt: Date.now() },
                        { merge: true },
                    ).catch(() => null);
                }
            }
        },
        [restaurantId],
    );

    const t = useCallback(
        (key: string, vars?: Record<string, string | number>) => {
            const localizedValue = dictionaries[locale]?.[key];
            const turkishValue = dictionaries.tr?.[key];
            const template = localizedValue ?? turkishValue ?? criticalFallbackTr[key] ?? key;
            return interpolate(template, vars);
        },
        [locale],
    );

    return useMemo(
        () => ({
            locale,
            ready,
            setLocale,
            t,
            formatCurrency: (value: number) => formatPanelCurrency(value, locale),
            formatDate: (value: number | Date | string) => formatPanelDate(value, locale),
            formatPhone: formatPanelPhone,
            formatAddress: formatPanelAddress,
        }),
        [locale, ready, setLocale, t],
    );
};

