import { Text, TextInput, TouchableOpacity, View } from "react-native";

type Props = {
    value: string;
    maxLength: number;
    suggestions: string[];
    onChange: (text: string) => void;
    title: string;
    placeholder: string;
};

const CourierNotes = ({ value, maxLength, suggestions, onChange, title, placeholder }: Props) => (
    <View className="gap-2">
        <Text className="section-title">{title}</Text>
        <View className="flex-row flex-wrap gap-3">
            {suggestions.map((suggestion) => (
                <TouchableOpacity
                    key={suggestion}
                    className="px-3 py-2 rounded-2xl border border-gray-200 bg-white"
                    onPress={() => onChange(suggestion)}
                >
                    <Text className="body-medium text-dark-80">{suggestion}</Text>
                </TouchableOpacity>
            ))}
        </View>
        <TextInput
            className="rounded-3xl bg-white border border-gray-100 px-4 py-3 text-dark-100"
            placeholder={placeholder}
            placeholderTextColor="#94A3B8"
            nativeID="courier-notes"
            value={value}
            onChangeText={onChange}
            multiline
            blurOnSubmit={false}
            textAlignVertical="top"
            autoCorrect
            autoCapitalize="sentences"
            returnKeyType="done"
            maxLength={maxLength}
        />
        <Text className="body-medium text-right text-dark-60">
            {value.length}/{maxLength}
        </Text>
    </View>
);

export default CourierNotes;
