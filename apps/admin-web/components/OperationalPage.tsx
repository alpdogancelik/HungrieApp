"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { Locale, PageResult } from "@/lib/contracts";
import { useLocale } from "./AdminProviders";
import { AdminControls } from "./AdminControls";

const rpc = {
    restaurants: "admin_list_restaurants_v1",
    accounts: "admin_list_accounts_v1",
    orders: "admin_list_orders_v1",
    incidents: "admin_list_incidents_v1",
    audit: "admin_list_audit_v1",
} as const;

const cancellationReasons: Record<Locale, Record<string, string>> = {
    en: {
        too_busy: "Restaurant too busy",
        item_unavailable: "Item unavailable",
        closing: "Restaurant closing",
        equipment_issue: "Equipment issue",
        delivery_unavailable: "Delivery unavailable",
        approval_deadline_expired: "Approval deadline expired",
        other: "Other",
    },
    tr: {
        too_busy: "Restoran çok yoğun",
        item_unavailable: "Ürün mevcut değil",
        closing: "Restoran kapanıyor",
        equipment_issue: "Ekipman sorunu",
        delivery_unavailable: "Teslimat kullanılamıyor",
        approval_deadline_expired: "Onay süresi doldu",
        other: "Diğer",
    },
};

const text = (value: unknown) => typeof value === "string" ? value.trim() : "";

const formatAuditDetails = (value: unknown, locale: Locale) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) return "—";
    const metadata = value as Record<string, unknown>;
    const from = text(metadata.from);
    const to = text(metadata.to);
    const reasonCode = text(metadata.reasonCode);
    const reason = text(metadata.reason);
    const parts: string[] = [];

    if (from || to) {
        const transition = [from, to].filter(Boolean).join(" → ");
        parts.push(`${locale === "tr" ? "Durum" : "Status"}: ${transition}`);
    }
    if (reasonCode) {
        const label = cancellationReasons[locale][reasonCode] || reasonCode.replaceAll("_", " ");
        parts.push(`${locale === "tr" ? "İptal nedeni" : "Cancellation reason"}: ${label}`);
    } else if (reason) {
        parts.push(`${locale === "tr" ? "Neden" : "Reason"}: ${reason}`);
    }

    return parts.length ? parts.join(" · ") : "—";
};

const renderValue = (row: Record<string, unknown>, column: string, locale: Locale) => {
    const value = row[column];
    if (column === "metadata") return formatAuditDetails(value, locale);
    if (value === null || value === undefined) return "—";
    return typeof value === "object" ? JSON.stringify(value) : String(value);
};

export function OperationalPage({ kind }: { kind: keyof typeof rpc }) {
    const { locale, t } = useLocale();
    const [page, setPage] = useState<PageResult>({ items: [], total: 0, limit: 25, offset: 0 });
    const [error, setError] = useState("");
    const [search, setSearch] = useState("");

    const load = useCallback(async (offset = 0) => {
        setError("");
        const args: Record<string, unknown> = { p_limit: 25, p_offset: offset };
        if ((kind === "restaurants" || kind === "accounts") && search) args.p_search = search;
        const result = await supabase.rpc(rpc[kind] as never, args as never);
        if (result.error) setError(`${t.unavailable} Reference: ${crypto.randomUUID().slice(0, 8)}`);
        else setPage(result.data as unknown as PageResult);
    }, [kind, search, t.unavailable]);

    useEffect(() => { void load(0); }, [load]);

    const columns = page.items[0]
        ? Object.keys(page.items[0])
            .filter((column) => !["threshold_snapshot", "delivery_address"].includes(column))
            .filter((column) => kind === "audit" || column !== "metadata")
            .slice(0, 8)
        : [];

    return <section>
        <header className="page-header">
            <div><p className="eyebrow">Hungrie</p><h2>{t[kind]}</h2></div>
            {(kind === "restaurants" || kind === "accounts") && <form onSubmit={(event) => { event.preventDefault(); void load(0); }}>
                <input aria-label={t.search} value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t.search} />
                <button>{t.search}</button>
            </form>}
        </header>
        {kind !== "audit" && <AdminControls kind={kind} onDone={() => void load(page.offset)} />}
        {error && <p className="error">{error}</p>}
        <div className="table-wrap">
            <table>
                <thead><tr>{columns.map((column) => <th key={column}>{column === "metadata" ? (locale === "tr" ? "Detaylar" : "Details") : column.replaceAll("_", " ")}</th>)}</tr></thead>
                <tbody>{page.items.map((row, index) => <tr key={String(row.id ?? row.profile_id ?? index)}>
                    {columns.map((column) => <td className={column === "metadata" ? "audit-details" : undefined} key={column}>{renderValue(row, column, locale)}</td>)}
                </tr>)}</tbody>
            </table>
            {!page.items.length && <p className="empty">{t.noRows}</p>}
        </div>
        <footer className="pagination">
            <button disabled={!page.offset} onClick={() => void load(Math.max(0, page.offset - page.limit))}>{t.previous}</button>
            <span>{page.total ? page.offset + 1 : 0}–{Math.min(page.total, page.offset + page.limit)} / {page.total}</span>
            <button disabled={page.offset + page.limit >= page.total} onClick={() => void load(page.offset + page.limit)}>{t.next}</button>
        </footer>
    </section>;
}
