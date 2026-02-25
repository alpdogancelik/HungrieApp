import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { panelDesign } from "./panelDesign";

type StateProps = {
    title: string;
    description?: string;
};

export const PanelLoadingState = ({ title, description }: StateProps) => (
    <View style={styles.stateWrap} accessibilityRole="progressbar" accessibilityLabel={title}>
        <ActivityIndicator color={panelDesign.colors.primary} />
        <Text style={styles.title}>{title}</Text>
        {description ? <Text style={styles.description}>{description}</Text> : null}
    </View>
);

export const PanelEmptyState = ({ title, description }: StateProps) => (
    <View style={styles.stateWrap}>
        <Text style={styles.title}>{title}</Text>
        {description ? <Text style={styles.description}>{description}</Text> : null}
    </View>
);

const styles = StyleSheet.create({
    stateWrap: {
        borderWidth: 1,
        borderColor: panelDesign.colors.border,
        borderRadius: panelDesign.radius.md,
        backgroundColor: panelDesign.colors.backgroundSoft,
        paddingVertical: panelDesign.spacing.xl,
        paddingHorizontal: panelDesign.spacing.md,
        alignItems: "center",
        justifyContent: "center",
        gap: panelDesign.spacing.xs,
    },
    title: {
        fontFamily: "ChairoSans",
        fontSize: 16,
        color: panelDesign.colors.text,
        textAlign: "center",
    },
    description: {
        fontFamily: "ChairoSans",
        fontSize: 13,
        color: panelDesign.colors.muted,
        textAlign: "center",
    },
});
