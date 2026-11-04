import React from "react";

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: "default" | "muted" | "elevated" | "interactive";
}

export function Card({
  className = "",
  variant = "default",
  children,
  ...props
}: CardProps) {
  const variantStyles = {
    default:
      "bg-surface-primary dark:bg-slate-900 border border-border-default dark:border-slate-800 shadow-card text-text-primary",
    muted:
      "bg-surface-secondary/70 dark:bg-slate-800/70 border border-border-subtle dark:border-slate-800 shadow-none text-text-primary",
    elevated:
      "bg-surface-primary dark:bg-slate-900 border border-border-default dark:border-slate-800 shadow-elevated text-text-primary",
    interactive:
      "bg-surface-primary dark:bg-slate-900 border border-border-default dark:border-slate-800 shadow-card hover:shadow-elevated hover:border-purple-300 dark:hover:border-purple-600 transition-all duration-200 cursor-pointer text-text-primary",
  };

  return (
    <div
      className={`rounded-2xl transition-colors duration-150 ${variantStyles[variant]} ${className}`}
      {...props}
    >
      {children}
    </div>
  );
}

export function CardHeader({
  className = "",
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={`px-6 py-5 border-b border-border-subtle flex items-center justify-between gap-4 ${className}`}
      {...props}
    >
      {children}
    </div>
  );
}

export function CardTitle({
  className = "",
  children,
  ...props
}: React.HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h3
      className={`text-base font-semibold text-text-primary tracking-tight leading-tight ${className}`}
      {...props}
    >
      {children}
    </h3>
  );
}

export function CardDescription({
  className = "",
  children,
  ...props
}: React.HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p
      className={`text-xs text-text-secondary mt-1 leading-normal ${className}`}
      {...props}
    >
      {children}
    </p>
  );
}

export function CardContent({
  className = "",
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={`p-6 ${className}`} {...props}>
      {children}
    </div>
  );
}

export function CardFooter({
  className = "",
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={`px-6 py-4 bg-surface-secondary/50 border-t border-border-subtle rounded-b-2xl flex items-center justify-between text-xs text-text-secondary ${className}`}
      {...props}
    >
      {children}
    </div>
  );
}
