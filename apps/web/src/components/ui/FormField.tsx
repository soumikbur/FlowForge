import React from "react";
import { AlertCircle } from "lucide-react";

interface FormFieldProps {
  id?: string;
  name?: string;
  label: string;
  required?: boolean;
  error?: string | null;
  hint?: string | null;
  className?: string;
  children: React.ReactNode;
}

export function FormField({
  id,
  name,
  label,
  required = false,
  error,
  hint,
  className = "",
  children,
}: FormFieldProps) {
  const fieldId = id || name || label.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  const errorId = `${fieldId}-error`;
  const hintId = `${fieldId}-hint`;

  return (
    <div className={`space-y-1.5 ${className}`}>
      <div className="flex items-center justify-between">
        <label
          htmlFor={fieldId}
          className="block text-xs font-semibold text-slate-700 dark:text-slate-300 select-none"
        >
          {label}
          {required && (
            <span
              className="text-rose-600 dark:text-rose-400 ml-1"
              aria-hidden="true"
            >
              *
            </span>
          )}
        </label>
      </div>

      <div>{children}</div>

      {hint && !error && (
        <p id={hintId} className="text-xs text-slate-500 dark:text-slate-400">
          {hint}
        </p>
      )}

      {error && (
        <p
          id={errorId}
          className="text-xs text-rose-600 dark:text-rose-400 flex items-center gap-1 font-medium mt-1"
          role="alert"
        >
          <AlertCircle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
          <span>{error}</span>
        </p>
      )}
    </div>
  );
}

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  isInvalid?: boolean;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ id, isInvalid = false, className = "", ...props }, ref) => {
    return (
      <input
        ref={ref}
        id={id}
        aria-invalid={isInvalid}
        aria-describedby={
          isInvalid && id ? `${id}-error` : id ? `${id}-hint` : undefined
        }
        className={`w-full bg-white dark:bg-slate-900 border rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all shadow-xs disabled:bg-slate-50 dark:disabled:bg-slate-800 disabled:text-slate-500 dark:disabled:text-slate-400 ${
          isInvalid
            ? "border-rose-400 dark:border-rose-500 focus:ring-rose-500 focus:border-rose-500"
            : "border-slate-300 dark:border-slate-700 hover:border-slate-400 dark:hover:border-slate-600"
        } ${className}`}
        {...props}
      />
    );
  },
);

Input.displayName = "Input";

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  isInvalid?: boolean;
}

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ id, isInvalid = false, className = "", rows = 3, ...props }, ref) => {
    return (
      <textarea
        ref={ref}
        id={id}
        rows={rows}
        aria-invalid={isInvalid}
        aria-describedby={
          isInvalid && id ? `${id}-error` : id ? `${id}-hint` : undefined
        }
        className={`w-full bg-white dark:bg-slate-900 border rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all shadow-xs disabled:bg-slate-50 dark:disabled:bg-slate-800 disabled:text-slate-500 dark:disabled:text-slate-400 ${
          isInvalid
            ? "border-rose-400 dark:border-rose-500 focus:ring-rose-500 focus:border-rose-500"
            : "border-slate-300 dark:border-slate-700 hover:border-slate-400 dark:hover:border-slate-600"
        } ${className}`}
        {...props}
      />
    );
  },
);

Textarea.displayName = "Textarea";
