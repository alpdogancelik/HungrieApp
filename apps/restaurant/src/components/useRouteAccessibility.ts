import { useEffect, type RefObject } from "react";

export function useRouteAccessibility(pathname: string, locale: string, mainRef: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const main = mainRef.current;
      if (!main) return;
      const heading = main.querySelector<HTMLElement>("h1");
      document.documentElement.lang = locale;
      document.title = `${heading?.textContent?.trim() || "Hungrie Restaurant"} · Hungrie Restaurant`;
      main.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [locale, mainRef, pathname]);
}
