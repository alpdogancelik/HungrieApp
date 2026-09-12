import { PORTAL_IDS, type PortalId } from "@hungrie/domain";
import type { Database } from "@hungrie/database-types";

const portal: PortalId = PORTAL_IDS[2];
type RuntimeStatus = Database["public"]["Functions"]["get_runtime_status"]["Returns"][number];
const field: keyof RuntimeStatus = "mode";

export default function Home() {
  return (
    <main style={{ maxWidth: 720, margin: "15vh auto", padding: 32 }}>
      <h1>Admin app foundation</h1>
      <p>Separate {portal} route tree. No private data is loaded.</p>
      <p>Shared database contract field: {field}</p>
    </main>
  );
}
