# Yapı rehberi

Dosya adları özellikleri tarif ediyor; rastgele `index.*` kovalamadan ekranları bulabilirsin.

## Router girişleri

| Path | Dosya | Not |
| --- | --- | --- |
| `/` | `app/index.tsx` | `/(tabs)/home` sekmesine yönlendirir. |
| `/(auth)/sign-in` | `app/(auth)/sign-in.tsx` | Opsiyonel auth kilidi (EXPO_PUBLIC_REQUIRE_AUTH) için giriş. |
| `/(auth)/sign-up` | `app/(auth)/sign-up.tsx` | Kayıt ekranı; aynı toggle ile açılır. |
| `/home` | `app/(tabs)/home.tsx` | Müşteri açılış sekmesi (listeler, kategoriler, hızlı aksiyonlar). |
| `/search` | `app/(tabs)/search.tsx` | `useAsyncResource` ile arama ve filtreler. |
| `/cart` | `app/(tabs)/cart.tsx` | Sepet sekmesi; Zustand sepet store + varlık kataloğu. |
| `/profile` | `app/(tabs)/profile.tsx` | Adres/hesap yönetimi ve tercih ayarları. |
| `/orders` | `app/orders.tsx` | Sipariş geçmişi; `useServerResource` akışı. |
| `/order/pending` | `app/order/pending.tsx` | Teslimat bekleme durumu ekranı. |
| `/courier` | `app/courier.tsx` | Kurye atama ve durum paneli. |
| `/restaurant` | `app/restaurant/index.tsx` | Restoran işletmeci girişi. |
| `/restaurant/console` | `app/restaurant/console.tsx` | Menü ve görünürlük kontrolleri. |
| `/restaurant/couriers` | `app/restaurant/couriers.tsx` | İç kurye kuyruğu. |
| `/restaurants/[id]` | `app/restaurants/[id].tsx` | Restoran detay ve sipariş akışı. |
| `/admin/MenuEditor` | `app/admin/MenuEditor.tsx` | Admin menü düzenleyici. |
| `/admin/SuperAdminDashboard` | `app/admin/SuperAdminDashboard.tsx` | Üst seviye admin panel. |
| `/demo/components` | `app/demo/components.tsx` | UI bileşen playground’u. |

## Klasör notları

- `app/` – Expo Router grupları `(auth)`, `(tabs)`, `order/*`, `restaurant/*`, `admin/*`. `_layout.tsx` guard ve tipografi yüklemelerini içerir.
- `components/` – Yeniden kullanılabilir RN/NativeWind bileşenleri (kartlar, butonlar, dil anahtarı, sepet hücreleri vb.).
- `constants/mediaCatalog.ts` – İkon, emoji, kategori ve kampanya metadataları için tek kaynak; `@/constants/mediaCatalog` üzerinden içe aktar.
- `lib/` – Firebase/Expo yardımcıları (`firebase.ts`, `firebaseAuth.ts`, `runtimeEnv.ts`), pexels ve menü görünürlüğü helper’ları, `useAsyncResource` & `useServerResource`.
- `data/` – Firestore JSON seed’leri; mock modunda UI’yı besler.
- `src/` – Tema sağlayıcıları (`themeContext.tsx`, `tokens.ts`), domain makinesi (`domain/orderMachine.ts`), adres/review feature paketleri, hook’lar (`useHome`, `useSearch`, `useOrderRealtime`), ve bileşen barrel’ı `src/components/componentRegistry.ts`.
- `store/` – Zustand store’ları (`auth.store.ts`, `cart.store.ts`).
- `docs/` – Bu rehber ve ekip içi dokümantasyon.

## Adlandırma ve kullanım kuralları

1. Ekran dosyaları açıklayıcı olmalı (örn. `orders.tsx`, `courier.tsx`, `home.tsx`); `restaurant/*` gibi klasörlerde yalnızca `_layout.tsx` indeks rolü üstlenir.
2. İhracatlar özelliklerine yakın tutulur; birden çok yardımcıyı aynı anda almak gerektiğinde barrel dosyalarını (`componentRegistry`, `addressFeature`) kullan.
3. Gizli bağımlılık yok: eski Appwrite/Supabase temizlendi. Firebase veya mock veri toggle’ı (EXPO_PUBLIC_USE_MOCK_DATA/EXPO_PUBLIC_DISABLE_FIREBASE) tek çalışma zamanı altyapısıdır.
4. Medya ve asetler `lib/assets.ts` üzerinden adreslenir; yeni görselleri `assets/` altına ekleyip aynı haritalamaya işleyin.

Bu sayfayı onboarding sırasında veya kod incelemesinde hızlı referans olarak kullanın.

---

# Structure guide (EN)

File names describe features so you can jump to screens without chasing anonymous `index.*` files.

## Router entries

| Path | File | Notes |
| --- | --- | --- |
| `/` | `app/index.tsx` | Redirects into `/(tabs)/home`. |
| `/(auth)/sign-in` | `app/(auth)/sign-in.tsx` | Sign-in screen when `EXPO_PUBLIC_REQUIRE_AUTH` guards tabs. |
| `/(auth)/sign-up` | `app/(auth)/sign-up.tsx` | Sign-up; enabled by the same toggle. |
| `/home` | `app/(tabs)/home.tsx` | Customer landing tab (listings, categories, quick actions). |
| `/search` | `app/(tabs)/search.tsx` | Search with `useAsyncResource`. |
| `/cart` | `app/(tabs)/cart.tsx` | Cart tab; Zustand cart store + asset catalog. |
| `/profile` | `app/(tabs)/profile.tsx` | Address/account management and preferences. |
| `/orders` | `app/orders.tsx` | Order history via `useServerResource`. |
| `/order/pending` | `app/order/pending.tsx` | Delivery pending state screen. |
| `/courier` | `app/courier.tsx` | Courier assignment and status panel. |
| `/restaurant` | `app/restaurant/index.tsx` | Restaurant operator entry. |
| `/restaurant/console` | `app/restaurant/console.tsx` | Menu and visibility controls. |
| `/restaurant/couriers` | `app/restaurant/couriers.tsx` | Internal courier queue. |
| `/restaurants/[id]` | `app/restaurants/[id].tsx` | Restaurant detail and ordering flow. |
| `/admin/MenuEditor` | `app/admin/MenuEditor.tsx` | Admin menu editor. |
| `/admin/SuperAdminDashboard` | `app/admin/SuperAdminDashboard.tsx` | Top-level admin panel. |
| `/demo/components` | `app/demo/components.tsx` | UI component playground. |

## Folder notes

- `app/` – Expo Router groups `(auth)`, `(tabs)`, `order/*`, `restaurant/*`, `admin/*`. `_layout.tsx` handles guards and typography loading.
- `components/` – Reusable RN/NativeWind components (cards, buttons, language toggle, cart cells, etc.).
- `constants/mediaCatalog.ts` – Single source for icons, emoji, categories, and offer metadata; import via `@/constants/mediaCatalog`.
- `lib/` – Firebase/Expo helpers (`firebase.ts`, `firebaseAuth.ts`, `runtimeEnv.ts`), pexels + menu visibility helpers, `useAsyncResource` and `useServerResource`.
- `data/` – Firestore JSON seeds that drive the UI in mock mode.
- `src/` – Theme providers (`themeContext.tsx`, `tokens.ts`), domain machine (`domain/orderMachine.ts`), address/review feature bundles, hooks (`useHome`, `useSearch`, `useOrderRealtime`), and the component barrel `src/components/componentRegistry.ts`.
- `store/` – Zustand stores (`auth.store.ts`, `cart.store.ts`).
- `docs/` – This guide and internal docs.

## Naming and usage rules

1. Screen files stay descriptive (e.g., `orders.tsx`, `courier.tsx`, `home.tsx`); folders like `restaurant/*` only keep `_layout.tsx` as an index.
2. Keep exports colocated with their feature; use barrel files (`componentRegistry`, `addressFeature`) when importing multiple helpers.
3. No hidden dependencies: legacy Appwrite/Supabase is removed. Firebase or the mock-data toggles (EXPO_PUBLIC_USE_MOCK_DATA/EXPO_PUBLIC_DISABLE_FIREBASE) are the only runtimes.
4. Media and assets are addressed through `lib/assets.ts`; add new visuals under `assets/` and extend the same mappings.

Use this page as a quick reference during onboarding or code review.
