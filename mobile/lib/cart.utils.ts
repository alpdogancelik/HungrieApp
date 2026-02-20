import type { CartItemType } from "@/type";

export const formatCurrency = (value?: number | null) => {
    const amount = Number(value ?? 0);
    return `TRY ${amount.toFixed(2)}`;
};

export const getCustomizationsTotal = (customizations?: CartItemType["customizations"]) =>
    customizations?.reduce((sum, option) => sum + Number(option.price || 0), 0) ?? 0;
