import { SafeAreaView } from "react-native-safe-area-context";
import { View, Text, StyleSheet } from "react-native";

const RestaurantOrders = () => {
    return (
        <SafeAreaView style={styles.safeArea}>
            <View style={styles.container}>
                <Text style={styles.title}>Active Orders</Text>
                <Text style={styles.subtitle}>Accept or reject incoming orders here.</Text>
                {/* TODO: Implement orders list */}
            </View>
        </SafeAreaView>
    );
};

const styles = StyleSheet.create({
    safeArea: { flex: 1, backgroundColor: "#FFF6EC", padding: 16 },
    container: { flex: 1, gap: 8 },
    title: { fontFamily: "ChairoSans", fontSize: 22, color: "#0F172A", letterSpacing: -0.2 },
    subtitle: { fontFamily: "ChairoSans", fontSize: 14, color: "#475569" },
});

export default RestaurantOrders;
