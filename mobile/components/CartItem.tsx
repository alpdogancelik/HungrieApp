import { useCartStore } from "@/store/cart.store";
import { CartItemType } from "@/type";
import { Text, TouchableOpacity, View } from "react-native";
import { Image } from "expo-image";
import { images } from "@/constants/mediaCatalog";
import Icon from "./Icon";

const CartItem = ({ item }: { item: CartItemType }) => {
    const { increaseQty, decreaseQty, removeItem } = useCartStore();

    return (
        <View className="cart-item">
            <View className="flex flex-row items-center gap-x-3">
                <View className="cart-item__image">
                    <Image
                        source={item.image_url ? { uri: item.image_url } : images.burgerOne}
                        className="size-4/5 rounded-lg"
                        contentFit="cover"
                        transition={200}
                    />
                </View>

                <View>
                    <Text className="base-bold text-dark-100">{item.name}</Text>
                    <Text className="paragraph-bold text-primary mt-1">
                        TRY {Number(item.price || 0).toFixed(2)}
                    </Text>

                    <View className="flex flex-row items-center gap-x-4 mt-2">
                        <TouchableOpacity
                            onPress={() => decreaseQty(item.id, item.customizations!)}
                            className="cart-item__actions"
                        >
                            <Icon name="minus" size={16} color="#FF9C01" />
                        </TouchableOpacity>

                        <Text className="base-bold text-dark-100">{item.quantity}</Text>

                        <TouchableOpacity
                            onPress={() => increaseQty(item.id, item.customizations!)}
                            className="cart-item__actions"
                        >
                            <Icon name="plus" size={16} color="#FF9C01" />
                        </TouchableOpacity>
                    </View>
                </View>
            </View>

            <TouchableOpacity onPress={() => removeItem(item.id, item.customizations!)} className="flex-center">
                <Icon name="trash" size={22} color="#FE5F55" />
            </TouchableOpacity>
        </View>
    );
};

export default CartItem;
