# Hungrie Mobile

## TR

Expo Router tab/stack akisi, NativeWind tabanli UI, Zustand store'lari ve Firebase/mock veri yardimcilari ile gelen Expo projesi. Cevrimdisi senaryolarda Firestore seed'leri ve mock path'ler devreye girer.

### Baslarken

1. **Projeye gidin ve bagimliliklari kurun**
   ```powershell
   cd "C:\\Users\\alpdo\\OneDrive\\Desktop\\Hungrie\\Hungrie\\mobile"
   npm install
   ```
2. **Calistirma ayarlarini doldurun** (`app.json > expo.extra`):
   - `EXPO_PUBLIC_FIREBASE_*`: Mevcut Firebase projesi icin anahtarlar.
   - `EXPO_PUBLIC_USE_MOCK_DATA`: `"true"` oldugunda tum ekranlar offline seed'lerle calisir.
   - `EXPO_PUBLIC_API_BASE_URL`: Opsiyonel backend icin kok URL.
   - `EXPO_PUBLIC_PEXELS_API_KEY`: Menu gorsel aramalari icin anahtar.
   - `EXPO_PUBLIC_SENTRY_DSN`: Uretim hatalarini izlemek icin.
3. **Uygulamayi baslatin**
   ```powershell
   npm run start
   ```
   Expo CLI acildiginda `a` ile Android emulatorune gonderebilir veya Expo Go ile QR kodu tarayabilirsiniz.

### Betikler

- `npm run start` - Expo gelistirme sunucusu
- `npm run android` / `npm run ios` / `npm run web` - ilgili platformda baslatma
- `npm run lint` - Expo ESLint yapilandirmasi ile lint kontrolu

### Klasor rehberi

`../STRUCTURE.md` daha detayli tablo icerir. Kisa ozet:

- `app/` - Expo Router gruplari (`(auth)`, `(tabs)`, `restaurant/*`, `order/*`).
- `components/` - Form elemanlari, kartlar, listeler, sepet hucreleri.
- `constants/mediaCatalog.ts` - Ikon, emoji, kategori, firsat ve gorsel katalogu.
- `lib/` - Firebase yardimcilari, asenkron/mock veri kancalari, API yardimcilari.
- `src/` - Tema saglayicisi, `features/*` modelleri, domain kancalari.
- `store/` - Auth/sepet Zustand store'lari.
- `data/` - Firestore JSON seed'leri (offline senaryolar icin).
- `assets/` - Fontlar, ikonlar, Godzilla illustrasyonlari ve yemek gorselleri.

### Gelistirme notlari

- NativeWind Tailwind siniflari `className` ile calisir; token'lar `tailwind.config.js` ve light tema `src/theme` altinda tanimlidir.
- Expo Router typed routes deneyi (`app.json > experiments.typedRoutes`) aciktir; dosya adlari yonlendirme icin kritiktir.
- Fontlar `app/_layout.tsx` icinde yuklenir. Eksik fontlarla gelistirme yaparken `useFonts` satirini gecici olarak yoruma alabilirsiniz.
- Appwrite/Supabase kalintilari temizlendi; Firebase + mock veri togglesi tek backend giris noktasi.

### Veriler ve ortam

- Varsayilan Firebase anahtarlari `expo.extra` icinde duruyor; kendi projenizi kullanacaksaniz bu degerleri degistirin.
- Offline mod icin `EXPO_PUBLIC_USE_MOCK_DATA="true"` yapin; online kullanimda `"false"` birakin.
- Opsiyonel servisler: `EXPO_PUBLIC_API_BASE_URL` (REST API), `EXPO_PUBLIC_PEXELS_API_KEY` (gorsel arama), `EXPO_PUBLIC_SENTRY_DSN` (kayit).
- `TODO.md` guncel is listesi; verileri/gorselleri dogrulamak ve cihaz/web testlerini calistirmak icin adimlari icerir.

## EN

Expo project with Expo Router tab/stack flow, NativeWind-styled UI, Zustand stores, and Firebase/mock data helpers. Firestore seeds and mock paths keep the app usable offline.

### Getting started

1. **Install dependencies**
   ```powershell
   cd "C:\\Users\\alpdo\\OneDrive\\Desktop\\Hungrie\\Hungrie\\mobile"
   npm install
   ```
2. **Fill runtime config** (`app.json > expo.extra`):
   - `EXPO_PUBLIC_FIREBASE_*`: Keys for your Firebase project.
   - `EXPO_PUBLIC_USE_MOCK_DATA`: `"true"` runs every screen on offline seeds.
   - `EXPO_PUBLIC_API_BASE_URL`: Optional backend base URL.
   - `EXPO_PUBLIC_PEXELS_API_KEY`: Menu image search key.
   - `EXPO_PUBLIC_SENTRY_DSN`: Capture production errors.
3. **Start the app**
   ```powershell
   npm run start
   ```
   When Expo CLI opens, press `a` to send to Android emulator or scan the QR code with Expo Go.

### Scripts

- `npm run start` - Expo dev server
- `npm run android` / `npm run ios` / `npm run web` - launch per platform
- `npm run lint` - Lint with the Expo ESLint config

### Folder guide

See `../STRUCTURE.md` for the detailed table. Quick tour:

- `app/` - Expo Router groups (`(auth)`, `(tabs)`, `restaurant/*`, `order/*`).
- `components/` - Form inputs, cards, lists, cart cells.
- `constants/mediaCatalog.ts` - Icons, emoji, categories, offers, and imagery catalog.
- `lib/` - Firebase helpers, async/mock data hooks, API helpers.
- `src/` - Theme provider, `features/*` modules, domain hooks.
- `store/` - Auth/cart Zustand stores.
- `data/` - Firestore JSON seeds for offline scenarios.
- `assets/` - Fonts, icons, Godzilla illustrations, and food imagery.

### Dev notes

- NativeWind Tailwind classes use `className`; tokens live in `tailwind.config.js` and the light theme under `src/theme`.
- Expo Router typed routes experiment (`app.json > experiments.typedRoutes`) is on; file names drive routing.
- Fonts load inside `app/_layout.tsx`. If fonts are missing during development, temporarily comment out `useFonts`.
- Appwrite/Supabase remnants were removed; Firebase + the mock-data toggle are the only backend switches.

### Data and environment

- Default Firebase keys live in `expo.extra`; replace them with your own project values.
- For offline mode set `EXPO_PUBLIC_USE_MOCK_DATA="true"`; leave `"false"` for online.
- Optional services: `EXPO_PUBLIC_API_BASE_URL` (REST API), `EXPO_PUBLIC_PEXELS_API_KEY` (image search), `EXPO_PUBLIC_SENTRY_DSN` (logging).
- `TODO.md` tracks current tasks; use it to verify data/assets and run device/web checks.
