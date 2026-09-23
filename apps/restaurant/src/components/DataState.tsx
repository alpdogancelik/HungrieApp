import { AlertTriangle, LoaderCircle } from "lucide-react";
import { Button } from "./Button";

export function DataState({ kind, title, detail, action, live = false }: { kind: "loading" | "error" | "empty"; title: string; detail?: string; action?: { label: string; onClick: () => void }; live?: boolean }) {
  return <section className="ui-data-state" role={kind === "error" ? "alert" : "status"} aria-live={live ? (kind === "error" ? "assertive" : "polite") : undefined}>
    {kind === "loading" ? <LoaderCircle className="ui-spinner" aria-hidden="true" /> : kind === "error" ? <AlertTriangle aria-hidden="true" /> : null}
    <h1>{title}</h1>{detail && <p>{detail}</p>}{action && <Button type="button" onClick={action.onClick}>{action.label}</Button>}
  </section>;
}
