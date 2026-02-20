import { Keyboard, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";

const styles = StyleSheet.create({
    root: { rowGap: 8 },
    title: { fontFamily: "ChairoSans", fontSize: 18, color: "#0F172A" },
    chipsRow: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
    chip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 16, borderWidth: 1, borderColor: "#E2E8F0", backgroundColor: "#FFFFFF" },
    chipText: { fontFamily: "ChairoSans", fontSize: 14, color: "#1E293B" },
    input: { borderRadius: 24, borderWidth: 1, borderColor: "#E2E8F0", backgroundColor: "#FFFFFF", paddingHorizontal: 16, paddingVertical: 12, color: "#0F172A", minHeight: 72 },
    count: { fontFamily: "ChairoSans", fontSize: 13, color: "#475569", textAlign: "right" },
});

type Props = {
    value: string;
    maxLength: number;
    suggestions: string[];
    onChange: (text: string) => void;
    title: string;
    placeholder: string;
};

const CourierNotes = ({ value, maxLength, suggestions, onChange, title, placeholder }: Props) => (
    <View className="gap-2" style={styles.root}>
        <Text className="section-title" style={styles.title}>{title}</Text>
        <View className="flex-row flex-wrap gap-3" style={styles.chipsRow}>
            {suggestions.map((suggestion) => (
                <TouchableOpacity
                    key={suggestion}
                    className="px-3 py-2 rounded-2xl border border-gray-200 bg-white"
                    style={styles.chip}
                    onPress={() => onChange(suggestion)}
                >
                    <Text className="body-medium text-dark-80" style={styles.chipText}>{suggestion}</Text>
                </TouchableOpacity>
            ))}
        </View>
        <TextInput
            className="rounded-3xl bg-white border border-gray-100 px-4 py-3 text-dark-100"
            style={styles.input}
            placeholder={placeholder}
            placeholderTextColor="#94A3B8"
            nativeID="courier-notes"
            value={value}
            onChangeText={onChange}
            multiline
            blurOnSubmit
            onSubmitEditing={() => Keyboard.dismiss()}
            textAlignVertical="top"
            autoCorrect
            autoCapitalize="sentences"
            returnKeyType="done"
            maxLength={maxLength}
        />
        <Text className="body-medium text-right text-dark-60" style={styles.count}>
            {value.length}/{maxLength}
        </Text>
    </View>
);

export default CourierNotes;
