import type { Locale, OrderStatus } from "./types";

const dictionary = {
  en: {
    dashboard: "Overview", orders: "Live orders", history: "History", menu: "Menu", restaurant: "Restaurant", reviews: "Reviews", alerts: "Alerts", security: "Security", more: "More",
    earnings: "Earnings", staff: "Staff", incidents: "Incidents", concepts: "Concepts", future: "Concept — approval and backend contract required",
    greeting: "Good service starts here", restaurantName: "Phase 5 Staging Pilot", accepting: "Restaurant open", paused: "Restaurant closed", acceptingHint: "Customers can place orders", pausedHint: "New orders are paused",
    connected: "Order screen connected", offline: "You are offline. Order actions are disabled until the connection returns.", reconnecting: "Reconnecting to the live order service…", stale: "This data changed elsewhere. Review the latest state before continuing.",
    search: "Search", filter: "Filter", refresh: "Refresh", retry: "Try again", save: "Save changes", cancel: "Cancel", confirm: "Confirm", edit: "Edit", add: "Add", close: "Close", reset: "Reset fixtures", language: "Language", signOut: "Sign out",
    noData: "There is nothing to show in this state.", unavailable: "Restaurant services are temporarily unavailable.", checking: "Checking Restaurant access…",
    order: "Order", customer: "Customer", items: "Items", total: "Total", customerNote: "Customer note", payment: "Payment", respond: "Respond", accept: "Accept order", cancelOrder: "Cancel order", nextStatus: "Move to next status",
    pending: "Waiting", preparing: "Preparing", ready: "Ready", out_for_delivery: "On the way", delivered: "Delivered", canceled: "Canceled",
  },
  tr: {
    dashboard: "Genel Bakış", orders: "Canlı siparişler", history: "Geçmiş", menu: "Menü", restaurant: "Restoran", reviews: "Değerlendirmeler", alerts: "Uyarılar", security: "Güvenlik", more: "Daha Fazla",
    earnings: "Kazanç", staff: "Ekip", incidents: "Olaylar", concepts: "Konseptler", future: "Konsept — ürün onayı ve sunucu sözleşmesi gerekli",
    greeting: "İyi hizmet burada başlar", restaurantName: "Phase 5 Staging Pilot", accepting: "Restoran açık", paused: "Restoran kapalı", acceptingHint: "Müşteriler sipariş verebilir", pausedHint: "Yeni siparişler duraklatıldı",
    connected: "Sipariş ekranı bağlı", offline: "İnternet bağlantısı yok. Bağlantı geri gelene kadar sipariş işlemleri devre dışı.", reconnecting: "Canlı sipariş hizmetine yeniden bağlanılıyor…", stale: "Bu veri başka bir yerde değişti. Devam etmeden önce güncel durumu inceleyin.",
    search: "Ara", filter: "Filtrele", refresh: "Yenile", retry: "Tekrar dene", save: "Değişiklikleri kaydet", cancel: "Vazgeç", confirm: "Onayla", edit: "Düzenle", add: "Ekle", close: "Kapat", reset: "Örnek verileri sıfırla", language: "Dil", signOut: "Çıkış yap",
    noData: "Bu durumda gösterilecek kayıt yok.", unavailable: "Restoran hizmetleri geçici olarak kullanılamıyor.", checking: "Restoran erişimi kontrol ediliyor…",
    order: "Sipariş", customer: "Müşteri", items: "Ürünler", total: "Toplam", customerNote: "Müşteri notu", payment: "Ödeme", respond: "Yanıtla", accept: "Siparişi kabul et", cancelOrder: "Siparişi iptal et", nextStatus: "Sonraki duruma geçir",
    pending: "Bekliyor", preparing: "Hazırlanıyor", ready: "Hazır", out_for_delivery: "Yolda", delivered: "Teslim edildi", canceled: "İptal edildi",
  },
} as const;

export function getCopy(locale: Locale) { return dictionary[locale]; }
export function statusLabel(status: OrderStatus, locale: Locale) { return dictionary[locale][status]; }
