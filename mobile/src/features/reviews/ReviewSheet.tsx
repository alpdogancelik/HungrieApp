import { useEffect, useMemo, useState } from "react";
import { Modal, Pressable, Text, TextInput, TouchableOpacity, View } from "react-native";
import cn from "clsx";
import Icon from "@/components/Icon";

type ReviewSheetProps = {
    visible: boolean;
    submitting?: boolean;
    initialRating?: number;
    initialComment?: string;
    onClose: () => void;
    onSubmit: (payload: { rating: 1 | 2 | 3 | 4 | 5; comment?: string }) => void | Promise<void>;
    placeholder?: string;
};

const STAR_VALUES: Array<1 | 2 | 3 | 4 | 5> = [1, 2, 3, 4, 5];

const ReviewSheet = ({
    visible,
    submitting = false,
    initialRating = 0,
    initialComment = "",
    onClose,
    onSubmit,
    placeholder = "Tell other students about the meal…",
}: ReviewSheetProps) => {
    const [rating, setRating] = useState<number>(initialRating);
    const [comment, setComment] = useState(initialComment);

    useEffect(() => {
        if (visible) {
            setRating(initialRating);
            setComment(initialComment || "");
        }
    }, [initialComment, initialRating, visible]);

    const disabled = rating === 0 || submitting;

    const handleSubmit = () => {
        if (rating === 0) return;
        onSubmit({ rating: rating as 1 | 2 | 3 | 4 | 5, comment });
    };

    const stars = useMemo(
        () =>
            STAR_VALUES.map((value) => {
                const filled = value <= rating;
                return (
                    <Pressable key={value} onPress={() => setRating(value)}>
                        <Icon name="star" size={24} color={filled ? "#FE8C00" : "#CBD5F5"} />
                    </Pressable>
                );
            }),
        [rating],
    );

    return (
        <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
            <Pressable className="flex-1 bg-black/40" onPress={onClose} />
            <View className="bg-white rounded-t-[32px] p-6 gap-4">
                <Text className="h4-bold text-dark-100">Share your experience</Text>
                <View className="flex-row items-center justify-center gap-2">{stars}</View>
                <TextInput
                    multiline
                    placeholder={placeholder}
                    placeholderTextColor="#94A3B8"
                    value={comment}
                    onChangeText={(text) => setComment(text.slice(0, 500))}
                    className="min-h-[100px] rounded-3xl border border-gray-100 px-4 py-3 text-dark-100 bg-white"
                    textAlignVertical="top"
                />
                <View className="flex-row gap-3">
                    <TouchableOpacity
                        className="flex-1 rounded-full border border-gray-200 py-3 items-center"
                        onPress={onClose}
                        disabled={submitting}
                    >
                        <Text className="paragraph-semibold text-dark-80">Cancel</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        className={cn(
                            "flex-1 rounded-full py-3 items-center",
                            disabled ? "bg-gray-200" : "bg-primary",
                        )}
                        disabled={disabled}
                        onPress={handleSubmit}
                    >
                        <Text className="paragraph-semibold text-white">
                            {submitting ? "Submitting..." : "Submit"}
                        </Text>
                    </TouchableOpacity>
                </View>
            </View>
        </Modal>
    );
};

export default ReviewSheet;

