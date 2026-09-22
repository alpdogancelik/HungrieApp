import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { orders as initialOrders } from "./fixtures";
import type { Locale, MockOrder, OrderStatus, Scenario } from "./types";

type MockContextValue = {
  locale: Locale;
  setLocale: (value: Locale) => void;
  scenario: Scenario;
  setScenario: (value: Scenario) => void;
  accepting: boolean;
  setAccepting: (value: boolean) => void;
  orders: MockOrder[];
  transitionOrder: (id: string, status: OrderStatus) => void;
  reset: () => void;
};

const MockContext = createContext<MockContextValue | null>(null);

export function MockProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocale] = useState<Locale>("tr");
  const [scenario, setScenario] = useState<Scenario>("success");
  const [accepting, setAccepting] = useState(true);
  const [orders, setOrders] = useState<MockOrder[]>(initialOrders);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const requestedLocale = params.get("locale");
    const requestedScenario = params.get("scenario");
    if (requestedLocale === "en" || requestedLocale === "tr") setLocale(requestedLocale);
    if (["success", "loading", "empty", "error", "offline", "reconnecting", "stale", "permission"].includes(requestedScenario || "")) setScenario(requestedScenario as Scenario);
  }, []);
  const value = useMemo<MockContextValue>(() => ({
    locale, setLocale, scenario, setScenario, accepting, setAccepting, orders,
    transitionOrder: (id, status) => setOrders(current => current.map(order => order.id === id ? { ...order, status } : order)),
    reset: () => { setScenario("success"); setAccepting(true); setOrders(initialOrders); },
  }), [accepting, locale, orders, scenario]);
  return <MockContext.Provider value={value}>{children}</MockContext.Provider>;
}

export function useMock() {
  const value = useContext(MockContext);
  if (!value) throw new Error("useMock must be used inside MockProvider");
  return value;
}
