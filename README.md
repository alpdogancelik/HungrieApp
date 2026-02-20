# Hungrie Mobile - Expo Router + Firebase

Production ready food ordering experience built with Expo Router, NativeWind, Zustand, and Firebase. Ships with mock data for offline development and is wired for App Store / Google Play via EAS.

## Ozellikler
- Expo Router tab/stack yapisi ile auth, restoran, siparis ve sepet ekranlari
- NativeWind temali tasarim; ikon/font/image pipeline hazir
- Firebase auth/firestore/storage entegrasyonu + offline mock seed opsiyonu
- Zustand durum yonetimi, i18next altyapisi, yeniden kullanilabilir UI bilesenleri
- EAS build/prod/publish profilleri (development, preview, production)

## Gereksinimler
- Node 18+ ve npm 10+
- npx expo CLI, npx eas CLI >= 16.26.0 (global kurulum gerekmez)
- iOS icin Xcode, Android icin Android Studio/SDK + emulator; hizli onizleme icin Expo Go
- Aktif Firebase projesi ve gerekirse API/Pexels/Sentry anahtarlari

## Kurulum ve gelistirme
```powershell
cd Hungrie
npm install
npm run start        # Metro + QR
npm run android      # Android emulator
npm run ios          # iOS simulator (macOS)
npm run web          # Web on Metro
npm run lint         # Kod kalitesi
```

## Ortam ve config
`mobile/app.json` icindeki `expo.extra` altinda gerekenler:
- `EXPO_PUBLIC_FIREBASE_*`: apiKey, authDomain, projectId, storageBucket, messagingSenderId, appId, measurementId, databaseURL, appCheckDebugToken
- `EXPO_PUBLIC_USE_MOCK_DATA`: "true" offline seedler, "false" Firebase canli verisi
- `EXPO_PUBLIC_API_BASE_URL`: opsiyonel backend
- `EXPO_PUBLIC_PEXELS_API_KEY`: opsiyonel gorsel arama
- `EXPO_PUBLIC_SENTRY_DSN`: opsiyonel crash toplama

Ornek (degerleri kendi production/prod-preview icin doldur):
```json
{
  "expo": {
    "extra": {
      "EXPO_PUBLIC_FIREBASE_API_KEY": "<api-key>",
      "EXPO_PUBLIC_FIREBASE_PROJECT_ID": "<project-id>",
      "EXPO_PUBLIC_USE_MOCK_DATA": "false",
      "EXPO_PUBLIC_API_BASE_URL": "<optional-backend>",
      "EXPO_PUBLIC_PEXELS_API_KEY": "<optional-pexels>",
      "EXPO_PUBLIC_SENTRY_DSN": "<optional-sentry>"
    }
  }
}
```
Not: Gizli anahtarlari VCS disinda tutun; paylasimli ortamda `app.config.js` veya CI degiskenleri kullanin.

## Assetler
- Fontlar: `mobile/assets/fonts/`
- Ikonlar: `mobile/assets/icons/`
- Gorseller: `mobile/assets/images/`
- Splash ve app ikonlari `app.json`da referansli (`assets/icons/bag.png`, `assets/adaptive-icon.png`, `assets/splash-icon.png`). Degistirdikten sonra `npx expo start --clear` ile cache temizleyin.

## Build ve yayin (App Store / Google Play)
```powershell
cd mobile
npx eas login                   # gerekirse
npx eas build -p ios --profile production
npx eas build -p android --profile production
npx eas submit -p ios --profile production --latest
npx eas submit -p android --profile production --latest
```
- `development` profili Expo Go/dev client icin, `preview` ic build icerir; `production` otomatik buildNumber icin `eas.json`da hazir.
- OTA guncelleme icin: `npx eas update --branch production --message "bug fixes"`

## Yayin kontrol listesi
- `app.json`: `expo.name`, `slug`, `ios.bundleIdentifier`, `android.package` store kayitlariyla eslesiyor mu?
- Versiyon: `expo.version` ve `eas.json` autoIncrement ayari dogru mu?
- `EXPO_PUBLIC_USE_MOCK_DATA` prod icin "false"; Firebase anahtarlari production degerleriyle dolu mu?
- Uygulama ikonlari/splash son tasarimla guncel mi? Store screenshot ve privacy/terms linkleri listinge eklendi mi?
- `npm run lint` temiz; soguk baslatma, login/cart/checkout gibi kritik akislarda smoke test yapildi mi?

## Sorun giderme
- Metro cache: `npx expo start --clear`
- Derleme sorunlari: `rm -r mobile/node_modules && npm install`
- Doktor: `npx expo-doctor` veya `npx eas doctor`
- Firebase baglantisi devrede degilse gecici olarak `EXPO_PUBLIC_USE_MOCK_DATA="true"` yapip offline modda ilerleyin.
