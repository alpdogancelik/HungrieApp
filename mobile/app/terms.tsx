import { Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { router } from "expo-router";
import Icon from "@/components/Icon";

type TermsSection = {
    title: string;
    body?: string[];
    bullets?: string[];
};

type TermsContent = {
    title: string;
    header: string;
    meta: string[];
    sections: TermsSection[];
};

const TERMS_TR: TermsContent = {
    title: "Şartlar ve Koşullar",
    header: "ŞARTLAR VE KOŞULLAR - Hungrie",
    meta: ["Yürürlük Tarihi: [GG.AA.YYYY]", "Sahibi: [Şirket/Şahıs Adı]"],
    sections: [
        {
            title: "1. Sözleşmenin Onaylanması",
            body: ["Uygulamayı kullanarak bu sözleşmeyi kabul etmiş olursun."],
        },
        {
            title: "2. Hizmetler",
            body: [
                "Hungrie; restoran menüleri listeleyen, siparişini restorana ileten ve teslimat akışını kolaylaştıran bir platformdur. Ürün içerikleri/alerjen/hijyen ve benzeri konularda restoranın beyanları esastır.",
            ],
        },
        {
            title: "3. Kullanıcı Sistemi",
            body: [
                "Hesabını doğru bilgilerle oluşturmak ve güvenliğini sağlamak senin sorumluluğundur. Hesabın üzerinden yapılan işlemler aksi ispatlanana kadar sana ait kabul edilir.",
            ],
        },
        {
            title: "4. Kullanıcının Yüklümlülükleri",
            body: [
                "Hizmeti hukuka uygun kullanmayı, suistimal etmemeyi, üçüncü kişilerin haklarını ihlal etmemeyi kabul edersin.",
            ],
        },
        {
            title: "5. İçerik ve Değişiklikler",
            body: [
                "Menü/fiyat/stok bilgileri restoranlar tarafından sağlanır ve değiştirilebilir. Hungrie, hizmeti geliştirmek için uygulamada değişiklik yapabilir.",
            ],
        },
        {
            title: "6. Kullanım Amacı",
            body: ["Siparişlerin kişisel kullanım amacı olduğunu kabul edersin."],
        },
        {
            title: "7. Ödeme",
            body: [
                "Ödeme, restoranın sunduğu seçenekler kapsamında kapalı nakit/POS olarak yapılır. Hungrie kart/banka bilgisi toplamaz (mevcut model).",
            ],
        },
        {
            title: "8. Kişisel Veri",
            body: [
                "Kişisel verilerin işlenmesi Gizlilik Politikasına tabidir. Teslimat için gerekli bilgiler restoran ve/veya kurye ile paylaşılabilir.",
            ],
        },
        {
            title: "9. Kanuni Zorunluluklar",
            body: ["Mevzuat veya resmi makam talepleri nedeniyle şifrelerde güncelleme yapabilir."],
        },
        {
            title: "10. Ürün Teslimatı",
            body: [
                "Teslimat, kullanıcının seçtiği adrese yapılır. Kullanıcının adreste bulunamaması veya yanlış adres bildirmesi halinde doğabilecek sonuçlardan kullanıcı sorumlu olabilir.",
            ],
        },
        {
            title: "11.Ücret iadesi",
            body: [
                "İade süreleri, siparişi hazırlayan restoranın politikası ve mevzuat çerçevesinde yürür. Hungrie, iletişimi kolaylaştırabilir; ancak ürün/teslimat kaynaklı ihtilaflarda nihai sorumluluk ilgili tarafa ait olabilir.",
            ],
        },
        {
            title: "12. Bilgilerin Saklanması ve ispat",
            body: [
                "Sipariş kayıtları ve sistem logları, uyuşmazlık halinde doğrulanabilir delil niteliğinde kullanılabilecek; veriler gerekli süre boyunca saklanır.",
            ],
        },
    ],
};

const TERMS_EN: TermsContent = {
    title: "Terms and Conditions",
    header: "TERMS AND CONDITIONS  Hungrie",
    meta: ["Effective Date: [01.01.2026]", "Provider: [Company/Hungrie]"],
    sections: [
        {
            title: "1. Acceptance of the Agreement",
            body: ["By using the app, you accept this agreement."],
        },
        {
            title: "2. Services",
            body: [
                "Hungrie is a platform that lists restaurant menus, forwards your order to the restaurant, and facilitates the delivery flow. For product contents/allergens/hygiene and similar matters, restaurant statements prevail.",
            ],
        },
        {
            title: "3. User Account",
            body: [
                "You are responsible for creating your account with accurate information and keeping it secure. Transactions made through your account are considered yours unless proven otherwise.",
            ],
        },
        {
            title: "4. User Obligations",
            body: [
                "You agree to use the service lawfully, not abuse it, and not violate third-party rights.",
            ],
        },
        {
            title: "5. Content and Changes",
            body: [
                "Menu/price/stock information is provided by restaurants and may change. Hungrie may make changes in the app to improve the service.",
            ],
        },
        {
            title: "6. Purpose of Use",
            body: ["You agree that orders are for personal use."],
        },
        {
            title: "7. Payment",
            body: [
                "Payment is made in cash/POS on delivery based on restaurant options. Hungrie does not collect card/bank information (current model).",
            ],
        },
        {
            title: "8. Personal Data",
            body: [
                "Processing of personal data is subject to the Privacy Policy. Delivery-related information may be shared with the restaurant and/or courier.",
            ],
        },
        {
            title: "9. Legal Requirements",
            body: ["Processes may be updated due to legislation or official authority requests."],
        },
        {
            title: "10. Delivery",
            body: [
                "Delivery is made to the address selected by the user. The user may be responsible for consequences if they are not available or provide an incorrect address.",
            ],
        },
        {
            title: "11. Refunds",
            body: [
                "Refunds follow the policy of the restaurant preparing the order and applicable laws. Hungrie may facilitate communication; however, final responsibility for product/delivery disputes may belong to the relevant party.",
            ],
        },
        {
            title: "12. Record Retention and Evidence",
            body: [
                "Order records and system logs may be used as verifiable evidence in case of disputes; data is kept for the required period.",
            ],
        },
    ],
};

const SectionBlock = ({ section }: { section: TermsSection }) => (
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

const TermsScreen = () => {
    const { i18n } = useTranslation();
    const content = i18n.language.startsWith("tr") ? TERMS_TR : TERMS_EN;

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

export default TermsScreen;
