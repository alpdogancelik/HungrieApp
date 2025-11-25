import { Text, TextInput, TouchableOpacity, View } from "react-native";

type Props = {
    value: string;
    maxLength: number;
    suggestions: string[];
    onChange: (text: string) => void;
};

const CourierNotes = ({ value, maxLength, suggestions, onChange }: Props) => (
    <View className="gap-2">
        <Text className="section-title">Notes for restaurant</Text>
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
            placeholder="Gate code, dorm details..."
            placeholderTextColor="#94A3B8"
            value={value}
            onChangeText={onChange}
            multiline
            maxLength={maxLength}
        />
        <Text className="body-medium text-right text-dark-60">
            {value.length}/{maxLength}
        </Text>
    </View>
);

export default CourierNotes;
