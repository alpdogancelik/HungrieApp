import { router, useLocalSearchParams } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import { TextInput, TouchableOpacity, View } from "react-native";
import Icon from "./Icon";

const Searchbar = () => {
    const params = useLocalSearchParams<{ query?: string | string[] }>();
    const [query, setQuery] = useState("");

    useEffect(() => {
        const nextValue = Array.isArray(params.query) ? params.query[0] : params.query;
        setQuery(nextValue ?? "");
    }, [params.query]);

    const updateRouteQuery = useCallback(
        (value: string) => {
            const trimmed = value.trim();
            if (trimmed) router.setParams({ query: trimmed });
            else router.setParams({ query: undefined });
        },
        [],
    );

    const handleSearch = (text: string) => {
        setQuery(text);

        if (!text.trim()) updateRouteQuery("");
    };

    const handleSubmit = () => {
        updateRouteQuery(query);
    };

    return (
        <View className="searchbar">
            <TextInput
                className="flex-1 p-5"
                placeholder="Search for pizzas, burgers..."
                value={query as any}
                onChangeText={handleSearch}
                onSubmitEditing={handleSubmit}
                placeholderTextColor="#A0A0A0"
                returnKeyType="search"
            />
            <TouchableOpacity className="pr-5" onPress={() => updateRouteQuery(query)}>
                <Icon name="search" size={20} color="#5D5F6D" />
            </TouchableOpacity>
        </View>
    );
};

export default Searchbar;
