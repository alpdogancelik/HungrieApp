import { View, Text, TouchableOpacity } from "react-native";
import React from "react";
import { useRouter } from "expo-router";
import { useCartStore } from "@/store/cart.store";
import Icon from "./Icon";

const CartButton = () => {
    const { getTotalItems } = useCartStore();
    const totalItems = getTotalItems();
    const router = useRouter();

    return (
        <TouchableOpacity className="cart-btn" onPress={() => router.push("/cart")}>
            <Icon name="cart" size={20} color="#fff" />

            {totalItems > 0 && (
                <View className="cart-badge">
                    <Text className="small-bold text-white">{totalItems}</Text>
                </View>
            )}
        </TouchableOpacity>
    )
}
export default CartButton
