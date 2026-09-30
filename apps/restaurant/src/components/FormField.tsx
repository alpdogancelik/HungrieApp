import { useId, useState, type InputHTMLAttributes, type TextareaHTMLAttributes } from "react";
import { Eye, EyeOff } from "lucide-react";

type Common = { label: string; error?: string; helper?: string };

export function FormField({ label, error, helper, id: suppliedId, ...props }: Common & InputHTMLAttributes<HTMLInputElement>) {
  const generated = useId();
  const id = suppliedId || generated;
  const description = error ? `${id}-error` : helper ? `${id}-helper` : undefined;
  return <label className="ui-field" htmlFor={id}><span>{label}</span><input {...props} id={id} aria-invalid={Boolean(error)} aria-describedby={description} />{error ? <small id={`${id}-error`} className="ui-field__error">{error}</small> : helper ? <small id={`${id}-helper`}>{helper}</small> : null}</label>;
}

type PasswordFieldProps = Common & Omit<InputHTMLAttributes<HTMLInputElement>, "type"> & { showLabel: string; hideLabel: string };

export function PasswordField({ label, error, helper, showLabel, hideLabel, id: suppliedId, ...props }: PasswordFieldProps) {
  const generated = useId();
  const id = suppliedId || generated;
  const [visible, setVisible] = useState(false);
  const description = error ? `${id}-error` : helper ? `${id}-helper` : undefined;
  const toggleLabel = visible ? hideLabel : showLabel;
  return <div className="ui-field">
    <label htmlFor={id}>{label}</label>
    <span className="ui-field__password-control">
      <input {...props} id={id} type={visible ? "text" : "password"} aria-invalid={Boolean(error)} aria-describedby={description} />
      <button type="button" className="ui-field__password-toggle" aria-label={toggleLabel} aria-pressed={visible} title={toggleLabel} onClick={() => setVisible(value => !value)}>
        {visible ? <EyeOff size={19} aria-hidden="true" /> : <Eye size={19} aria-hidden="true" />}
      </button>
    </span>
    {error ? <small id={`${id}-error`} className="ui-field__error">{error}</small> : helper ? <small id={`${id}-helper`}>{helper}</small> : null}
  </div>;
}

export function TextAreaField({ label, error, helper, id: suppliedId, ...props }: Common & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const generated = useId();
  const id = suppliedId || generated;
  const description = error ? `${id}-error` : helper ? `${id}-helper` : undefined;
  return <label className="ui-field" htmlFor={id}><span>{label}</span><textarea {...props} id={id} aria-invalid={Boolean(error)} aria-describedby={description} />{error ? <small id={`${id}-error`} className="ui-field__error">{error}</small> : helper ? <small id={`${id}-helper`}>{helper}</small> : null}</label>;
}
