import { useEffect, useId, useRef, type PropsWithChildren, type ReactNode } from "react";

export function Dialog({ open, title, children, actions, onClose }: PropsWithChildren<{ open: boolean; title: string; actions?: ReactNode; onClose: () => void }>) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const restoreRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (!open) return;
    restoreRef.current = document.activeElement as HTMLElement;
    const dialog = dialogRef.current;
    const focusable = () => [...(dialog?.querySelectorAll<HTMLElement>('button,[href],input,select,textarea,[tabindex]:not([tabindex="-1"])') || [])].filter(element => !element.hasAttribute("disabled"));
    focusable()[0]?.focus();
    const keydown = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); onClose(); return; }
      if (event.key !== "Tab") return;
      const items = focusable();
      if (!items.length) return;
      const first = items[0], last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", keydown);
    return () => { document.removeEventListener("keydown", keydown); restoreRef.current?.focus(); };
  }, [open, onClose]);
  if (!open) return null;
  return <div className="ui-dialog-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}><div ref={dialogRef} className="ui-dialog" role="dialog" aria-modal="true" aria-labelledby={titleId}><h2 id={titleId}>{title}</h2><div>{children}</div>{actions && <div className="ui-dialog__actions">{actions}</div>}</div></div>;
}
