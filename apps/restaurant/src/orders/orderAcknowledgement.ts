import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { restaurantOrderRepository } from "./orderRepository";
import { getAcknowledgementIntent, type AcknowledgementState } from "./orderAcknowledgementModel";

export async function acknowledgeVisibleOrder(orderId: string, version: string) {
  const intent = getAcknowledgementIntent(orderId, version);
  if (intent.state === "acknowledged") return;
  if (intent.promise) return intent.promise;
  intent.state = "sending";
  intent.promise = restaurantOrderRepository.acknowledge(orderId, version, intent.operationId)
    .then(() => { intent.state = "acknowledged"; })
    .catch(error => { intent.state = "failed"; throw error; })
    .finally(() => { intent.promise = null; });
  return intent.promise;
}

export function useVisibleOrderAcknowledgement(orderId: string, version: string, rootRef?: RefObject<Element | null>) {
  const targetRef = useRef<HTMLElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const visible = useRef(false);
  const [state, setState] = useState<AcknowledgementState>(() => getAcknowledgementIntent(orderId, version).state);
  const clear = useCallback(() => { if (timer.current) clearTimeout(timer.current); timer.current = null; }, []);
  const send = useCallback(async () => {
    try { await acknowledgeVisibleOrder(orderId, version); setState("acknowledged"); }
    catch { setState("failed"); }
  }, [orderId, version]);
  const arm = useCallback(() => {
    clear();
    if (!visible.current || document.visibilityState !== "visible") return;
    timer.current = setTimeout(() => { timer.current = null; if (visible.current && document.visibilityState === "visible") void send(); }, 1000);
  }, [clear, send]);

  useEffect(() => {
    setState(getAcknowledgementIntent(orderId, version).state);
    const target = targetRef.current;
    if (!target) return;
    const observer = new IntersectionObserver(entries => {
      visible.current = Boolean(entries[0]?.isIntersecting && entries[0].intersectionRatio >= 0.5);
      if (visible.current) arm(); else clear();
    }, { root: rootRef?.current || null, threshold: [0, 0.5, 1] });
    const visibility = () => { if (document.visibilityState === "visible" && visible.current) arm(); else clear(); };
    observer.observe(target);
    document.addEventListener("visibilitychange", visibility);
    return () => { visible.current = false; clear(); observer.disconnect(); document.removeEventListener("visibilitychange", visibility); };
  }, [arm, clear, orderId, rootRef, version]);

  return { targetRef, state, retry: send };
}
