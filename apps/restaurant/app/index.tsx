import { StyleSheet, Text, View } from "react-native";
import { PORTAL_IDS, type PortalId } from "@hungrie/domain";
import type { Database } from "@hungrie/database-types";

const portal: PortalId = PORTAL_IDS[1];
type RuntimeStatus = Database["public"]["Functions"]["get_runtime_status"]["Returns"][number];
const statusLabel: keyof RuntimeStatus = "mode";

export default function ProofHome() {
  return (
      <View style={styles.container}>
        <Text style={styles.heading}>Restaurant app foundation</Text>
        <Text style={styles.body}>Separate {portal} route tree. No private data is loaded.</Text>
        <Text style={styles.caption}>Shared database contract field: {statusLabel}</Text>
      </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: "center", padding: 32, backgroundColor: "#fff8ef" },
  heading: { fontSize: 28, fontWeight: "700", color: "#3c220e" },
  body: { marginTop: 12, fontSize: 16, color: "#624c39" },
  caption: { marginTop: 24, fontSize: 13, color: "#806b58" }
});
