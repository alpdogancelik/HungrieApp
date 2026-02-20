# Hungrie Mobile — Publish TODO (App Store + Google Play)

Bu dosya “store’a gönderime hazır mıyız?” sorusuna net cevap vermek için var. Her maddeyi tek tek işaretleyerek ilerleyin.

## 0) Şu anki durum (kısa not)

- Font standardı: Uygulama genelinde `ChairoSans` kullanımı var.
- Onboarding: `hungrie.onboarding.seen = "1"` ile tek seferlik akış.
- Splash route (`/splash`): logo + wordmark + iştah açıcı arka plan görselleri.
- Lint: `npm run lint` çalışıyor (bazı uyarılar kalabilir).

## 1) Hesaplar ve erişimler

### Apple
- [ ] Apple Developer Program üyeliği aktif
- [ ] App Store Connect erişimi (Admin / App Manager)
- [ ] App Store Connect’te “New App” oluşturuldu (Bundle ID: `com.hungrie.app`)
- [ ] TestFlight grupları oluşturuldu (Internal/External)

### Google
- [ ] Google Play Developer hesabı aktif
- [ ] Play Console’da “Create app” tamamlandı (Package: `com.hungrie.app`)
- [ ] Organizasyon bilgileri, geliştirici iletişim e-postası, web sitesi güncel

### Firebase / Backend
- [ ] Firebase projesi erişimleri (Auth + Firestore + Storage gerekliyse)
- [ ] Prod ve dev ortamları ayrıldı (en azından ayrı Firebase projesi veya ayrı collection/prefix)

## 2) Proje konfigürasyonu (Expo)

Dosya: `app.json`

- [ ] `expo.name` (Store’da görünen isim) doğru mu?
- [ ] `ios.bundleIdentifier` kesin mi? (yayın sonrası değiştirmek zor)
- [ ] `android.package` kesin mi? (yayın sonrası değiştirmek zor)
- [ ] `version`, `ios.buildNumber`, `android.versionCode` stratejisi net mi?
- [ ] `userInterfaceStyle` (tasarım light ise `light`) tutarlı mı?
- [ ] `scheme` (deep link) benzersiz mi ve ürünle uyumlu mu?

### Ortam değişkenleri (runtime)

Dosya: `app.json > expo.extra`

- [ ] Prod için `EXPO_PUBLIC_REQUIRE_AUTH` kararı net (true/false)
- [ ] Prod için `EXPO_PUBLIC_USE_MOCK_DATA` **false**
- [ ] Prod için `EXPO_PUBLIC_API_BASE_URL` gerekiyorsa dolduruldu
- [ ] Prod için `EXPO_PUBLIC_SENTRY_DSN` (opsiyonel ama önerilir)
- [ ] Firebase anahtarları prod projesine ait (veya planlanan projeye)
- [ ] `EXPO_PUBLIC_DISABLE_FIREBASE` sadece gerektiğinde `true`

Not: Public env değerler uygulama içine gömülür. Gizli anahtar/sırları **public env** olarak koymayın.

## 3) Branding & asset kontrolü

### App Icon
- [ ] iOS icon 1024×1024, okunaklı, güvenli alanı doğru
- [ ] Android adaptive icon foreground şeffaf + safe zone içinde
- [ ] Play Store 512×512 icon export hazır

### Splash (native)
- [ ] `expo-splash-screen` ayarları doğru (image + backgroundColor)
- [ ] iOS/Android gerçek cihazlarda scale/konum test edildi

### Onboarding / Welcome görselleri
- [ ] Görsellerin lisansı/üretim kaynağı (AI/stock) kayıt altında
- [ ] Büyük görseller optimize (boyut/format), gereksiz MB yok

## 4) Build sistemi (EAS)

Dosya: `eas.json`

- [ ] `production` profili store için doğru (autoIncrement vs.)
- [ ] `appVersionSource` seçimi net (remote/local)

### Komutlar (önerilen)

- TypeScript kontrolü: `npx tsc -p tsconfig.json --noEmit`
- Lint: `npm run lint`
- iOS prod build: `eas build -p ios --profile production`
- Android prod build: `eas build -p android --profile production`
- Submit (opsiyonel): `eas submit -p ios --profile production` / `eas submit -p android --profile production`

## 5) iOS (App Store) checklist

### App Store Connect metadata
- [ ] App adı, alt başlık, açıklama, anahtar kelimeler
- [ ] Destek URL, Privacy Policy URL
- [ ] Ekran görüntüleri: iPhone 6.7", 6.5", 5.5" (minimum set)
- [ ] (Varsa) iPad ekran görüntüleri
- [ ] Age rating, kategori, fiyatlandırma

### Privacy (Apple “App Privacy”)
- [ ] Toplanan veriler listesi doğru (ör: email, device id, crash logs vs.)
- [ ] Tracking var mı? Yoksa “No” doğru işaretlendi
- [ ] Kullanıcı hesabı silme akışı gerekiyorsa planlandı/eklendi

### Teknik
- [ ] `ITSAppUsesNonExemptEncryption` doğru (çoğu uygulama için `false`)
- [ ] Gerçek cihazda push/notification davranışı doğrulandı (kullanıyorsanız)
- [ ] Review için demo hesap (varsa) hazır

## 6) Android (Google Play) checklist

### Store Listing
- [ ] App adı, kısa açıklama, tam açıklama
- [ ] Feature graphic (1024×500)
- [ ] Screenshot seti (telefon + opsiyonel tablet)
- [ ] Privacy Policy URL
- [ ] İletişim bilgileri

### Data safety (Google)
- [ ] Data Safety formu gerçek kullanım ile uyumlu
- [ ] Reklam/analitik/3rd-party SDK’lar (Firebase/Sentry) beyanı yapıldı

### Release tracks
- [ ] Internal testing track kurulumu
- [ ] Closed testing (opsiyonel)
- [ ] Production rollout stratejisi (%10 → %100)

## 7) Firebase / veri güvenliği

- [ ] Firestore rules prod için kilitli (public write yok)
- [ ] Indexes deploy edildi (Firestore index uyarısı kalmıyor)
- [ ] Firestore rules deploy edildi (firebase deploy --only firestore:rules --project hungrie-b5458)
- [ ] Auth provider’lar net (email/password, OTP, vs.)
- [ ] Test kullanıcıları + demo restoran verisi hazır
- [ ] Offline/mock mod sadece dev amaçlı ve prod’da kapalı

## 8) Push bildirimleri (kullanılıyorsa)

- [ ] iOS için APNs key/cert işlemleri tamamlandı
- [ ] Android için gerekli konfigürasyon tamamlandı
- [ ] Expo push token akışı server tarafında karşılanıyor (`registerTokenWithBackend`)
- [ ] Uygulama kapalıyken/açıkkken bildirim testi yapıldı

## 9) QA (release öncesi minimum test)

### Akışlar
- [ ] İlk açılış: `/splash` → onboarding → home
- [ ] Onboarding görüldüyse tekrar göstermiyor
- [ ] Auth required senaryosu: `/splash` → `/sign-in`
- [ ] Dil değişimi (TR/EN) ana ekran + kritik ekranlarda doğru
- [ ] Restoran listeleme → restoran detay → menü → sepete ekle
- [ ] Sepet: artır/azalt/sil
- [ ] Sipariş oluşturma / takip ekranları (mock + gerçek)
- [ ] Restaurant panel login route akışı doğru (`/restaurantpanel`)

### Cihaz matrisi
- [ ] iPhone (en az 1 küçük, 1 büyük ekran)
- [ ] Android (en az 1 orta, 1 büyük ekran)
- [ ] Karanlık mod zorunlu değilse kapalı/uyumlu
- [ ] Ağ yokken: anlamlı hata/empty state

### Store rejection riskleri
- [ ] Crash yok (Sentry/console ile kontrol)
- [ ] Placeholder metin/boş sayfa yok
- [ ] Test kullanıcı bilgileri doğru
- [ ] “Spammy”/kopya store metadata yok

## 10) Release günü (operasyon)

- [ ] “Release branch” donduruldu
- [ ] Versiyon + changelog hazır
- [ ] EAS build alındı, smoke test yapıldı
- [ ] TestFlight / Internal testing dağıtıldı
- [ ] Store submit edildi
- [ ] Review notları + demo hesap iletildi
- [ ] Yayın sonrası izleme: crash, yorumlar, performans

## 11) Sonraki iyileştirmeler (nice-to-have)

- [ ] Lint uyarılarını temizleme (BOM, unused vars, hook deps)
- [ ] Ekran görüntüsü otomasyonu / snapshot test
- [ ] Sentry release/tag entegrasyonu
- [ ] Uygulama içi “Hesabı sil” (gerekiyorsa)
- [ ] Daha güçlü offline cache stratejisi

