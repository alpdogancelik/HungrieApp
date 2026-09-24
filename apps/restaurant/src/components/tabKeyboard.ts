import type { KeyboardEvent } from "react";

export function handleTabKeyboard(event: KeyboardEvent<HTMLElement>) {
  if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
  const tabs = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]:not(:disabled)')];
  if (!tabs.length) return;
  const active = tabs.indexOf(document.activeElement as HTMLButtonElement);
  const index = event.key === "Home" ? 0
    : event.key === "End" ? tabs.length - 1
      : event.key === "ArrowRight" ? (active + 1 + tabs.length) % tabs.length
        : (active - 1 + tabs.length) % tabs.length;
  event.preventDefault();
  tabs[index].focus();
  tabs[index].click();
}
