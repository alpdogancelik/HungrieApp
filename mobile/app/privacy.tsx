import { Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { router } from "expo-router";
import Icon from "@/components/Icon";

type PolicySection = {
    title: string;
    body?: string[];
    bullets?: string[];
};

type PolicyContent = {
    title: string;
    header: string;
    meta: string[];
    sections: PolicySection[];
};

const POLICY_TR: PolicyContent = {
    title: "Gizlilik Politikası",
    header: "GİZLİLİK POLİTİKASI  Hungrie",
    meta: [
        "Yürürlük Tarihi: [01.01.2026]",
        "Veri Sorumlusu: [şirket/şahıs ünvanı: HungrieApp]  [Adres- Metu Ncc]",
        "İletişim: [ahungrie@gmail.com]  Veri Talepleri/Silme: [ahungrie@gmail.com]",
    ],
    sections: [
        {
            title: "1. Hangi verileri topluyoruz?",
            bullets: [
                "Hesap Bilgileri: ad-soyad, e-posta, telefon/WhatsApp, kullanıcı kimliği (Firebase UID)",
                "Teslimat Bilgileri: teslimat adres(ler)i (Firestore'da saklanır)",
                "Sipariş Bilgileri: sepet içeriği, tutar, ödeme yöntemi (kapıda nakit/POS), sipariş durumu ve sipariş geçmişi",
                "Bildirim Bilgileri: push token (backend'de saklanır) ve bildirim gönderim kayıtları",
                "Teknik Tanımlama: crash/hata kayıtları, performans/diagnostics verileri (Sentry)",
                "Toplamadıklarımız: hassas konum, rehber, fotoğraf/mikrofon, kart/banka bilgisi.",
            ],
        },
        {
            title: "2. Hangi amaçlarla kullanıyoruz?",
            bullets: [
                "Siparişin oluşturulması, restorana iletilmesi ve teslimat koordinasyonu",
                "Hesap ve oturum yönetimi",
                "Müşteri destek süreleri",
                "Güvenlik ve suistimal önleme",
                "Uygulama stabilitesi: hata ayıklama ve performans iyileştirme (Sentry)",
            ],
        },
        {
            title: "3. Verileri kiminle paylaşıyoruz?",
            bullets: [
                "Restoranlar: sipariş içeriği + teslimat için gerekli iletişim/adres bilgileri",
                "Kuryeler/teslimat görevlileri: teslimat adresi + iletişim için gerekli bilgiler",
                "Hizmet sağlayıcıları: altyapı sağlayıcıları (Auth/DB/push) ve hata izleme (Sentry)",
            ],
        },
        {
            title: "4. Saklama süresi",
            body: [
                "Veriler; hizmetin yürütülmesi, güvenlik ve mevzuat yükümlülükleri için gerekli süre boyunca saklanır; süre sonunda silinir/anonimleştirilir veya erişimi kısıtlanır.",
            ],
        },
        {
            title: "5. Güvenlik",
            body: [
                "Verilerin aktarımı sırasında şifreli iletişim (TLS/HTTPS) ve erişim kontrolü gibi makul teknik/idari tedbirler uygulanır.",
            ],
        },
        {
            title: "6. Haklar ve silme talebi",
            body: [
                "Kullanıcı; verilerine erişim, düzeltme, silme ve işlemeye itiraz taleplerini iletebilir.",
                "Silme talebi kanalı: [privacy@hungrie.app] ve/veya [https://hungrie.app/privacy-choices]",
            ],
        },
        {
            title: "7. Değişiklikler",
            body: ["Gizlilik politikası güncellenebilir; güncel sürüm ilgili URL'de yayımlanır."],
        },
    ],
};

const POLICY_EN: PolicyContent = {
    title: "Privacy Policy",
    header: "PRIVACY POLICY  - Hungrie",
    meta: [
        "Effective Date: [01.01.2026]",
        "Data Controller: [Company/Person Name: HungrieApp]  [Address- Metu Ncc]",
        "Contact: [ahungrie@gmail.com]  Data Requests/Deletion: [ahungrie@gmail.com                                                ]",
    ],
    sections: [
        {
            title: "1. What data do we collect?",
            bullets: [
                "Account Info: full name, email, phone/WhatsApp, user ID (Firebase UID)",
                "Delivery Info: delivery address(es) (stored in Firestore)",
                "Order Info: cart contents, total, payment method (cash/POS on delivery), order status and history",
                "Notification Info: push token (stored in backend) and notification logs",
                "Technical Diagnostics: crash/error logs, performance/diagnostics data (Sentry)",
                "Not collected: precise location, contacts, photo/microphone, card/bank details.",
            ],
        },
        {
            title: "2. What do we use it for?",
            bullets: [
                "Creating orders, sending to restaurants, and coordinating delivery",
                "Account and session management",
                "Customer support processes",
                "Security and abuse prevention",
                "App stability: debugging and performance improvements (Sentry)",
            ],
        },
        {
            title: "3. Who do we share data with?",
            bullets: [
                "Restaurants: order contents + necessary contact/address details for delivery",
                "Couriers/delivery staff: delivery address + necessary contact details",
                "Service providers: infrastructure (Auth/DB/push) and error monitoring (Sentry)",
            ],
        },
        {
            title: "4. Retention period",
            body: [
                "Data is stored as long as required for service delivery, security, and legal obligations; after that it is deleted/anonymized or access is restricted.",
            ],
        },
        {
            title: "5. Security",
            body: [
                "We apply reasonable technical/administrative measures such as encrypted transfer (TLS/HTTPS) and access control.",
            ],
        },
        {
            title: "6. Rights and deletion request",
            body: [
                "Users can request access, correction, deletion, and object to processing.",
                "Deletion channel: [privacy@hungrie.app] and/or [https://hungrie.app/privacy-choices]",
            ],
        },
        {
            title: "7. Changes",
            body: ["The privacy policy may be updated; the latest version is published at the relevant URL."],
        },
    ],
};

const SectionBlock = ({ section }: { section: PolicySection }) => (
    <View className="gap-2">
        <Text className="text-lg font-ezra-bold text-dark-100">{section.title}</Text>
        {section.body?.map((line, index) => (
            <Text key={`${section.title}-body-${index}`} className="body-medium text-dark-60">
                {line}
            </Text>
        ))}
        {section.bullets?.map((line, index) => (
            <Text key={`${section.title}-bullet-${index}`} className="body-medium text-dark-60">
                {`- ${line}`}
            </Text>
        ))}
    </View>
);

const PrivacyScreen = () => {
    const { i18n } = useTranslation();
    const content = i18n.language.startsWith("tr") ? POLICY_TR : POLICY_EN;

    return (
        <SafeAreaView className="flex-1 bg-gray-50">
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 20, paddingBottom: 120 }}>
                <View className="flex-row items-center gap-3 mb-4">
                    <Pressable
                        onPress={() => router.back()}
                        className="h-10 w-10 rounded-full bg-white border border-gray-200 items-center justify-center"
                    >
                        <Icon name="arrowBack" size={20} color="#0F172A" />
                    </Pressable>
                    <Text className="text-2xl font-ezra-bold text-dark-100">{content.title}</Text>
                </View>

                <View className="gap-2 mb-6">
                    <Text className="text-xs uppercase tracking-[3px] text-dark-60">{content.header}</Text>
                    {content.meta.map((line, index) => (
                        <Text key={`meta-${index}`} className="body-medium text-dark-60">
                            {line}
                        </Text>
                    ))}
                </View>

                <View className="gap-6">
                    {content.sections.map((section) => (
                        <SectionBlock key={section.title} section={section} />
                    ))}
                </View>
            </ScrollView>
        </SafeAreaView>
    );
};

export default PrivacyScreen;
