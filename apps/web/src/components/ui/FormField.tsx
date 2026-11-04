import React from "react";
import { AlertCircle } from "lucide-react";

interface FormFieldProps {
  id?: string;
  name?: string;
  htmlFor?: string;
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
  htmlFor,
  label,
  required = false,
  error,
  hint,
  className = "",
  children,
}: FormFieldProps) {
  const fieldId =
    htmlFor || id || name || label.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  const errorId = `${fieldId}-error`;
  const hintId = `${fieldId}-hint`;

  const describedBy = error ? errorId : hint ? hintId : undefined;

  const enhancedChildren = React.isValidElement(children)
    ? React.cloneElement(children as React.ReactElement<any>, {
        "aria-describedby":
          (children.props as any)["aria-describedby"] || describedBy,
        "aria-invalid":
          (children.props as any)["aria-invalid"] ??
          ((children.props as any).isInvalid || Boolean(error)
            ? "true"
            : undefined),
      })
    : children;

  return (
    <div className={`space-y-1.5 ${className}`}>
      <div className="flex items-center justify-between">
        <label
          htmlFor={fieldId}
          className="block text-xs font-semibold text-text-primary select-none"
        >
          {label}
          {required && (
            <span className="text-[#EB5757] ml-1" aria-hidden="true">
              *
            </span>
          )}
        </label>
      </div>

      <div>{enhancedChildren}</div>

      {hint && !error && (
        <p id={hintId} className="text-xs text-text-muted">
          {hint}
        </p>
      )}

      {error && (
        <p
          id={errorId}
          className="text-xs text-[#EB5757] flex items-center gap-1 font-medium mt-1"
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
  error?: boolean;
  isInvalid?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  (
    { className = "", error, isInvalid, leftIcon, rightIcon, ...props },
    ref,
  ) => {
    const hasError = error || isInvalid;
    return (
      <div className="relative flex items-center w-full">
        {leftIcon && (
          <div className="absolute left-3.5 text-text-muted pointer-events-none flex items-center">
            {leftIcon}
          </div>
        )}
        <input
          ref={ref}
          aria-invalid={hasError ? "true" : props["aria-invalid"]}
          className={`w-full bg-surface-primary border rounded-xl py-2 px-3.5 text-sm text-text-primary placeholder:text-text-muted transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-[#6738E8]/30 focus:border-[#6738E8] ${
            hasError
              ? "border-[#EB5757] focus:ring-[#EB5757]/30 focus:border-[#EB5757]"
              : "border-border-default hover:border-border-strong"
          } ${leftIcon ? "pl-10" : ""} ${rightIcon ? "pr-10" : ""} ${className}`}
          {...props}
        />
        {rightIcon && (
          <div className="absolute right-3.5 text-text-muted flex items-center">
            {rightIcon}
          </div>
        )}
      </div>
    );
  },
);

Input.displayName = "Input";

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  error?: boolean;
}

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className = "", error, ...props }, ref) => {
    return (
      <textarea
        ref={ref}
        className={`w-full bg-surface-primary border rounded-xl py-2 px-3.5 text-sm text-text-primary placeholder:text-text-muted transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-[#6738E8]/30 focus:border-[#6738E8] ${
          error
            ? "border-[#EB5757] focus:ring-[#EB5757]/30 focus:border-[#EB5757]"
            : "border-border-default hover:border-border-strong"
        } ${className}`}
        {...props}
      />
    );
  },
);

Textarea.displayName = "Textarea";
