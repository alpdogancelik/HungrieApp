# Son Degisiklik Ozeti (18.12.2025)

## Ozet
- Yeni onboarding akisi: `/welcome` ekraninda markali slider, QR/onboarding akislari ve misafirleri buraya yonlendiren router guncellemesi.
- Kullanici iletisim bilgisi iyilestirildi: kayit formu WhatsApp aliyor, profil/store tipleri genisledi, siparis olusturma/yonetme ekranlari WhatsApp ve e-posta gosteriyor.
- Build/config guncellemeleri: yeni app ikonlari/splash varliklari, `app.json` referanslari yenilendi, .gitignore kapsami genisledi.
- Paket guncellemeleri: Expo/React/React Native versiyonlari yukseltilip `expo-dev-client` eklendi; `mobile/package-lock.json` ve kok `package-lock.json` buna gore yenilendi.
- Varlik bakimi: eski/fluffy ikonlar kaldirildi, coklu PNG/JPEG varliklari yeniden sikistirildi, arama sekmesi icin yeni menu ikonu eklendi.
- Dokumantasyon: README tamamen guncellendi (kurulum, ortam, build/yayin adimlari, kontrol listesi), eski `1612 changes.md` temizlendi.

## Detaylar
- Onboarding ve yonlendirme:
  - `mobile/app/welcome.tsx` ile yeni markali karsilama/slide deneyimi eklendi.
  - `mobile/app/index.tsx` artik oturumsuz kullanicilari `/welcome` ekranina, giris yapmis olanlari `/home`'a yonlendiriyor.
  - Tab bar arama ikonlari `iconset/menu 2.svg` uzerinden guncellendi.
- Iletisim bilgisi toplanmasi ve akisi:
  - `sign-up` ekranina WhatsApp numarasi alani eklendi ve zorunlu kilindi; profil/store tipleri (`firebaseAuth.ts`, `auth.store.ts`, `types.ts`) buna gore genisledi.
  - Siparis olusturma (`cart.tsx`, `firebaseOrders.ts`) artik musteri ad/e-posta/WhatsApp bilgisini siparise yazarak restoran, kurye ve admin panellerinde (`OrderCard`, `courier.tsx`, `SuperAdminDashboard.tsx`) gosteriyor.
  - Firebase profil senkronizasyonu WhatsApp numarasini kaydedip guncelliyor; order dokumanlari musteri iletisim alanlariyla olusuyor.
- Build/konfig ve paketler:
  - `mobile/app.json` yeni app ikonlarini (`mobile/assets/app-icon/*`) kullaniyor; web favicon da yenilendi.
  - `mobile/package.json` ve kilit dosyalarinda Expo 54.0.29, React 19.1.0, RN 0.81.5, `expo-dev-client` ve guncel betikler (`expo run:android/ios`) yer aliyor.
  - `.gitignore` tum alt dizinlerdeki `.expo/` klasorlerini de kapsiyor; Metro/Babel config yorumlari sade.
- Varlik ve ekran bakimi:
  - Birden cok buyuk PNG/JPEG dosyasi yeniden sikistirildi; kullanilmayan fluffy/iconly varliklari kaldirildi.
  - Marka gorselleri (`hungrie-mark.png`, `hungrie-wordmark.png`, slogan gorselleri) ve yeni splash ikonlari eklendi.
  - Arama ekraninda metin/yerlesim duzenlemeleri yapildi, eski `useSearchScreen.ts` kaldirildi (V2 hook kullaniliyor).

## Yapilacaklar
- Yeni paket versiyonlariyla ilgili native/OTA build alin ve en kritik akislari (giris, sepet, siparis ilerletme) elle dogrulayin.
- Firebase uretim anahtarlari ve app ikon/splash guncellemelerinin EAS buildlerinde dogru okundugunu test edin.
