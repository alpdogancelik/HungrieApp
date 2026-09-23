import type { RestaurantDashboard } from "./dashboardContract";

export type RestaurantRuntimeStatus = "offline" | "connecting" | "connected" | "stale";

export function deriveRestaurantRuntimeStatus(input: { online: boolean; realtimeConnected: boolean; dashboard: RestaurantDashboard | null; refreshFailed: boolean }): RestaurantRuntimeStatus {
  if (!input.online) return "offline";
  if (input.refreshFailed) return "stale";
  if (input.realtimeConnected && input.dashboard) return "connected";
  return "connecting";
}

export function runtimeResultIsCurrent(input: { resultGeneration: number; currentGeneration: number; request: number; latestAppliedRequest: number }) {
  return input.resultGeneration === input.currentGeneration && input.request >= input.latestAppliedRequest;
}
