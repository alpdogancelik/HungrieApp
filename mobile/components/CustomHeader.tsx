import { useRouter } from "expo-router";
import { Text, TouchableOpacity, View } from "react-native";
import Icon from "./Icon";

const CustomHeader = ({ title }: { title?: string }) => {
    const router = useRouter();

    return (
        <View className="custom-header">
            <TouchableOpacity onPress={() => router.back()}>
                <Icon name="arrowBack" size={22} color="#0F172A" />
            </TouchableOpacity>

            {title && <Text className="base-semibold text-dark-100">{title}</Text>}

            <Icon name="search" size={22} color="#94A3B8" />
        </View>
    );
};

export default CustomHeader;
