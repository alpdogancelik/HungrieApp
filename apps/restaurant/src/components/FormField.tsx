import { useId, type InputHTMLAttributes, type TextareaHTMLAttributes } from "react";

type Common = { label: string; error?: string; helper?: string };

export function FormField({ label, error, helper, id: suppliedId, ...props }: Common & InputHTMLAttributes<HTMLInputElement>) {
  const generated = useId();
  const id = suppliedId || generated;
  const description = error ? `${id}-error` : helper ? `${id}-helper` : undefined;
  return <label className="ui-field" htmlFor={id}><span>{label}</span><input {...props} id={id} aria-invalid={Boolean(error)} aria-describedby={description} />{error ? <small id={`${id}-error`} className="ui-field__error">{error}</small> : helper ? <small id={`${id}-helper`}>{helper}</small> : null}</label>;
}

export function TextAreaField({ label, error, helper, id: suppliedId, ...props }: Common & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const generated = useId();
  const id = suppliedId || generated;
  const description = error ? `${id}-error` : helper ? `${id}-helper` : undefined;
  return <label className="ui-field" htmlFor={id}><span>{label}</span><textarea {...props} id={id} aria-invalid={Boolean(error)} aria-describedby={description} />{error ? <small id={`${id}-error`} className="ui-field__error">{error}</small> : helper ? <small id={`${id}-helper`}>{helper}</small> : null}</label>;
}
