import { useCallback, useEffect, useState } from "react";

export function useDirtyGuard(dirty: boolean) {
  const [pending, setPending] = useState<null | (() => void)>(null);
  const request = useCallback((action: () => void) => { if (!dirty) action(); else setPending(() => action); }, [dirty]);
  useEffect(() => {
    if (!dirty) return;
    const beforeUnload = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    const click = (event: MouseEvent) => {
      const anchor = (event.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!anchor || anchor.target === "_blank" || event.defaultPrevented) return;
      const target = new URL(anchor.href, location.href); if (target.href === location.href) return;
      event.preventDefault(); event.stopPropagation(); setPending(() => () => location.assign(target.href));
    };
    const popstate = () => { if (!window.confirm("Discard unsaved changes?")) history.forward(); };
    window.addEventListener("beforeunload", beforeUnload); window.addEventListener("popstate", popstate); document.addEventListener("click", click, true);
    return () => { window.removeEventListener("beforeunload", beforeUnload); window.removeEventListener("popstate", popstate); document.removeEventListener("click", click, true); };
  }, [dirty]);
  const discard = () => { const action = pending; setPending(null); action?.(); };
  return { request, confirmOpen: Boolean(pending), cancel: () => setPending(null), discard };
}
