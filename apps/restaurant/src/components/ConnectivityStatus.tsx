import { CloudOff, RefreshCw, Wifi, WifiOff } from "lucide-react";
import type { RestaurantRuntimeStatus } from "../RestaurantRuntimeContext";

export function ConnectivityStatus({ status, labels }: { status: RestaurantRuntimeStatus; labels: Record<RestaurantRuntimeStatus, string> }) {
  const Icon = status === "connected" ? Wifi : status === "offline" ? CloudOff : status === "stale" ? WifiOff : RefreshCw;
  return <span className={`runtime-status runtime-status--${status}`} role="status" aria-live="polite"><Icon size={14} aria-hidden="true" /><span>{labels[status]}</span></span>;
}
