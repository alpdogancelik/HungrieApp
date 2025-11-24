import i18n from "i18next";
import { initReactI18next } from "react-i18next";

const resources = {
    en: {
        translation: {
            profile: {
                header: {
                    edit: "Edit",
                    signOut: "Sign out",
                    signingOut: "Signing out...",
                },
                defaultAddress: "Default delivery address",
                manageAddresses: "Manage addresses",
                noAddress: "No address on file yet.",
                activeOrders: "Active orders",
                noActiveOrders: "No ongoing deliveries. Hungry?",
                accountActions: "Account actions",
                restaurantConsole: "Open Restaurant Console",
                courierConsole: "Courier Dispatch Center",
                modal: {
                    title: "Order details",
                    status: "Status",
                    eta: "ETA",
                    total: "Total",
                    close: "Close",
                },
            },
            status: {
                preparing: "Preparing",
                ready: "Ready",
                canceled: "Canceled",
            },
            misc: {
                manageSoon: "Address management will launch soon.",
                editSoon: "Profile editing will arrive soon.",
            },
            common: {
                cancel: "Cancel",
                delete: "Delete",
                goBack: "Go back",
                saving: "Saving...",
            },
            home: {
                hero: {
                    eyebrow: "Kalkanlı Hunger Club",
                    title: "Good food without leaving your spot.",
                    subtitle: "Order from around campus, couriers do the walking while you stay comfortable.",
                    cta: "Browse restaurants",
                },
                searchShortcut: {
                    title: "What are you craving?",
                    subtitle: "Search restaurants or dishes",
                    cta: "Search",
                },
                stats: {
                    restaurants: {
                        label: "Restaurants nearby",
                        helper: "Places that currently deliver to your area.",
                    },
                    menu: {
                        label: "Menu ideas ready",
                        helper: "Suggestions for when you are not sure what to eat.",
                    },
                },
                categoryHint: "Pick a category",
                quickActionsTitle: "Quick actions",
                featuredTitle: "Featured picks",
                restaurantsTitle: "Restaurants nearby",
                quickActions: {
                    orders: { label: "Order history", description: "See what you ordered before." },
                    favorites: { label: "Favourites", description: "Jump back to your go-to places." },
                    addresses: { label: "Addresses", description: "Manage where your orders should arrive." },
                    coupons: { label: "Coupons", description: "Check your available discounts." },
                },
            },
            deliverTo: {
                eyebrow: "Deliver to",
                addAddress: "Add delivery address",
                subtitle: "Tap to choose where we should deliver",
                modalTitle: "Choose delivery address",
                emptyTitle: "No saved addresses yet",
                emptySubtitle: "Add your dorm, residence hall, or pickup spot to speed up checkout.",
                manage: "Manage addresses",
                useThis: "Use this address",
            },
            address: {
                manage: {
                    title: "Manage addresses",
                    emptyTitle: "No addresses yet",
                    emptySubtitle: "Save a campus dorm or pickup location to speed up checkout.",
                    addNew: "Add new address",
                    confirmDeleteTitle: "Remove address",
                    confirmDeleteBody: 'Are you sure you want to delete "{{label}}"?',
                    deleteError: "Unable to delete address",
                    updateDefaultError: "Unable to update default address",
                },
                form: {
                    titleAdd: "Add new address",
                    titleEdit: "Edit address",
                    heroTitle: "Make it clear enough so your rider doesn’t get lost.",
                    heroSubtitle: "Short, clear directions help your food find you faster.",
                    sectionTitle: "Delivery details",
                    sectionSubtitle: "Keep it simple, but specific enough for your courier.",
                    fields: {
                        label: "Address Label",
                        labelPlaceholder: "Hungrie user's home?",
                        line1: "Address line",
                        line1Placeholder: "Gepaz, Uğur Apt., Darbaz, Sunset, Siesta etc.",
                        block: "Block / Building",
                        blockPlaceholder: "No:12, Apt:4 etc.",
                        room: "Room",
                        roomPlaceholder: "If you are living in dorm.",
                        city: "City",
                        cityPlaceholder: "(for example, Kalkanlı Guzelyurt)",
                    },
                    makeDefault: "Make default",
                    makeDefaultHint: "This address will appear first at checkout.",
                    save: "Save address",
                    saving: "Saving...",
                    saveError: "Unable to save address",
                    errors: {
                        label: "Enter a helpful label.",
                        line1: "Address line is required.",
                        city: "City is required.",
                        country: "Country is required.",
                    },
                },
            },
            cart: {
                empty: {
                    title: "Your cart is empty",
                    subtitle: "Add meals from Home and we will bring everything to your door when you are ready.",
                    cta: "Browse restaurants",
                },
            },
            search: {
                discovery: {
                    title: "Smart search, campus style.",
                    subtitle: "Type a dish, a place or an ingredient and we'll show you the best options around you.",
                },
                empty: {
                    title: "We couldn't find a match.",
                    body: "Try a simpler word, another dish, or clear the filters to see more places.",
                },
                offline: {
                    title: "Kitchens are offline right now.",
                    body: "We couldn't reach our restaurant list. Check your connection or permissions, then refresh the feed.",
                },
            },
            profileExtras: {
                weekly: {
                    eyebrow: "Weekly ritual",
                    title: "Save reviews as reminders.",
                    subtitle: "Tag what you loved so we ping you when it returns to campus.",
                    cta: "Open review log",
                },
                delivery: {
                    eyebrow: "Delivery preferences",
                    title: "Map pins & silent drop-offs",
                    subtitle: "Update your default address and we brief every courier automatically.",
                    cta: "Update default",
                },
                payment: {
                    cash: "Cash",
                    card: "Card",
                },
                editModal: {
                    title: "Refresh your contact.",
                    subtitle: "Restaurants see this info, please keep it sharp and clear.",
                    name: "Name",
                    email: "Email",
                    namePlaceholder: "Your name",
                    emailPlaceholder: "you@example.com",
                    save: "Save",
                    cancel: "Cancel",
                },
                actions: {
                    payment: { label: "Payment methods", description: "Add or remove saved cards" },
                    notifications: { label: "Notification preferences", description: "SMS, push, and email" },
                    help: { label: "Help center", description: "Chat with support" },
                    history: { label: "Order history", description: "Review your past orders" },
                    soonTitle: "Coming soon",
                },
            },
        },
    },
    tr: {
        translation: {
            profile: {
                header: {
                    edit: "Düzenle",
                    signOut: "Çıkış yap",
                    signingOut: "Çıkış yapılıyor...",
                },
                defaultAddress: "Varsayılan teslimat adresi",
                manageAddresses: "Adresleri yönet",
                noAddress: "Henüz kayıtlı adres yok.",
                activeOrders: "Aktif siparişler",
                noActiveOrders: "Devam eden sipariş yok. Acıktın mı?",
                accountActions: "Hesap işlemleri",
                restaurantConsole: "Restoran Panelini Aç",
                courierConsole: "Kurye Merkezi",
                modal: {
                    title: "Sipariş detayları",
                    status: "Durum",
                    eta: "Tahmini süre",
                    total: "Toplam",
                    close: "Kapat",
                },
            },
            status: {
                preparing: "Hazırlanıyor",
                ready: "Hazır",
                canceled: "İptal edildi",
            },
            misc: {
                manageSoon: "Adres yönetimi çok yakında.",
                editSoon: "Profil düzenleme yakında.",
            },
            common: {
                cancel: "İptal",
                delete: "Sil",
                goBack: "Geri dön",
                saving: "Kaydediliyor...",
            },
            home: {
                hero: {
                    eyebrow: "Kalkanlı Hunger Club",
                    title: "Yerinden kalkmadan iyi yemek.",
                    subtitle: "Kampüs çevresinden sipariş ver, kurye yürüsün sen rahat kal.",
                    cta: "Restoranlara göz at",
                },
                searchShortcut: {
                    title: "Ne yemek istersin?",
                    subtitle: "Restoran veya yemek ara",
                    cta: "Ara",
                },
                stats: {
                    restaurants: {
                        label: "Yakındaki restoranlar",
                        helper: "Şu anda bölgenize teslimat yapan yerler.",
                    },
                    menu: {
                        label: "Hazır menü fikirleri",
                        helper: "Ne yiyeceğine karar veremediğinde öneriler.",
                    },
                },
                categoryHint: "Kategori seç",
                quickActionsTitle: "Hızlı işlemler",
                featuredTitle: "Öne çıkanlar",
                restaurantsTitle: "Yakındaki restoranlar",
                quickActions: {
                    orders: { label: "Sipariş geçmişi", description: "Daha önce neler aldığını gör." },
                    favorites: { label: "Favoriler", description: "En sevdiklerine hemen dön." },
                    addresses: { label: "Adresler", description: "Siparişlerin nereye gelsin yönet." },
                    coupons: { label: "Kuponlar", description: "Kullanılabilir indirimlerini kontrol et." },
                },
            },
            deliverTo: {
                eyebrow: "Teslimat",
                addAddress: "Teslimat adresi ekle",
                subtitle: "Teslim etmemizi istediğin yeri seçmek için dokun",
                modalTitle: "Teslimat adresi seç",
                emptyTitle: "Henüz kayıtlı adres yok",
                emptySubtitle: "Yurt, ev ya da teslimat noktasını ekle, ödeme daha hızlı olsun.",
                manage: "Adresleri yönet",
                useThis: "Bu adresi kullan",
            },
            address: {
                manage: {
                    title: "Adresleri yönet",
                    emptyTitle: "Adres yok",
                    emptySubtitle: "Yurt ya da teslimat noktası ekle, ödemeyi hızlandır.",
                    addNew: "Yeni adres ekle",
                    confirmDeleteTitle: "Adresi sil",
                    confirmDeleteBody: '"{{label}}" adresini silmek istediğine emin misin?',
                    deleteError: "Adres silinemedi",
                    updateDefaultError: "Varsayılan adres güncellenemedi",
                },
                form: {
                    titleAdd: "Yeni adres ekle",
                    titleEdit: "Adresi düzenle",
                    heroTitle: "Kurye yolunu kaybetmesin diye net yaz.",
                    heroSubtitle: "Kısa ve açık tarifler yemeğinin sana daha hızlı ulaşmasını sağlar.",
                    sectionTitle: "Teslimat detayları",
                    sectionSubtitle: "Basit tut ama kurye için yeterince net olsun.",
                    fields: {
                        label: "Adres etiketi",
                        labelPlaceholder: "Hungrie kullanıcısının evi?",
                        line1: "Adres satırı",
                        line1Placeholder: "Gepaz, Uğur Apt., Darbaz, Sunset, Siesta vb.",
                        block: "Blok / Bina",
                        blockPlaceholder: "No:12, Apt:4 vb.",
                        room: "Oda",
                        roomPlaceholder: "Yurtta kalıyorsan oda numarası.",
                        city: "Şehir",
                        cityPlaceholder: "(örneğin, Kalkanlı Güzelyurt)",
                    },
                    makeDefault: "Varsayılan yap",
                    makeDefaultHint: "Bu adres ödeme ekranında ilk sırada görünür.",
                    save: "Adresi kaydet",
                    saving: "Kaydediliyor...",
                    saveError: "Adres kaydedilemedi",
                    errors: {
                        label: "Anlaşılır bir etiket yaz.",
                        line1: "Adres satırı gerekli.",
                        city: "Şehir gerekli.",
                        country: "Ülke gerekli.",
                    },
                },
            },
            cart: {
                empty: {
                    title: "Sepetin boş",
                    subtitle: "Eve sekmesinden yemek ekle, hazır olduğunda kapına getirelim.",
                    cta: "Restoranlara göz at",
                },
            },
            search: {
                discovery: {
                    title: "Akıllı arama, kampüs usulü.",
                    subtitle: "Bir yemek, mekan veya malzeme yaz; çevrendeki en iyi seçenekleri gösterelim.",
                },
                empty: {
                    title: "Eşleşme bulamadık.",
                    body: "Daha basit bir kelime dene, farklı bir yemek yaz ya da filtreleri temizle.",
                },
                offline: {
                    title: "Mutfaklar şu anda çevrimdışı.",
                    body: "Restoran listesine ulaşamadık. Bağlantını veya izinlerini kontrol edip akışı yenilemeyi dene.",
                },
            },
            profileExtras: {
                weekly: {
                    eyebrow: "Haftalık ritüel",
                    title: "Yorumlarını not olarak sakla.",
                    subtitle: "Sevdiklerini etiketle, kampüse dönünce haber verelim.",
                    cta: "Yorum kayıtlarını aç",
                },
                delivery: {
                    eyebrow: "Teslimat tercihleri",
                    title: "Harita pinleri ve sessiz bırakma",
                    subtitle: "Varsayılan adresini güncelle, her kurye için otomatik bilgi geçelim.",
                    cta: "Varsayılanı güncelle",
                },
                payment: {
                    cash: "Nakit",
                    card: "Kart",
                },
                editModal: {
                    title: "İletişim bilgini güncelle.",
                    subtitle: "Restoranlar bu bilgiyi görür, lütfen net tut.",
                    name: "İsim",
                    email: "E-posta",
                    namePlaceholder: "Adın",
                    emailPlaceholder: "ornek@eposta.com",
                    save: "Kaydet",
                    cancel: "İptal",
                },
                actions: {
                    payment: { label: "Ödeme yöntemleri", description: "Kayıtlı kart ekle veya kaldır" },
                    notifications: { label: "Bildirim tercihleri", description: "SMS, push ve e-posta" },
                    help: { label: "Destek merkezi", description: "Destek ile sohbet et" },
                    history: { label: "Sipariş geçmişi", description: "Geçmiş siparişlerini incele" },
                    soonTitle: "Çok yakında",
                },
            },
        },
    },
};

if (!i18n.isInitialized) {
    i18n.use(initReactI18next).init({
        resources,
        lng: "en",
        fallbackLng: "en",
        compatibilityJSON: "v3",
        interpolation: {
            escapeValue: false,
        },
    });
}

export default i18n;
