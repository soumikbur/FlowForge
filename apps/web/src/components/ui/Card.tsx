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
      "bg-white dark:bg-slate-900 border-slate-200/90 dark:border-slate-800 shadow-xs",
    muted:
      "bg-slate-50/70 dark:bg-slate-800/40 border-slate-200/80 dark:border-slate-800 shadow-none",
    elevated:
      "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 shadow-card",
    interactive:
      "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 shadow-xs hover:shadow-card hover:border-indigo-300 dark:hover:border-indigo-600 transition-all duration-150 cursor-pointer",
  };

  return (
    <div
      className={`rounded-xl border ${variantStyles[variant]} ${className}`}
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
      className={`px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between gap-4 ${className}`}
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
      className={`text-sm font-semibold text-slate-900 dark:text-slate-100 leading-tight ${className}`}
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
      className={`text-xs text-slate-500 dark:text-slate-400 mt-0.5 leading-normal ${className}`}
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
    <div className={`p-5 ${className}`} {...props}>
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
      className={`px-5 py-3 bg-slate-50/60 dark:bg-slate-800/50 border-t border-slate-100 dark:border-slate-800 rounded-b-xl flex items-center justify-between text-xs text-slate-600 dark:text-slate-400 ${className}`}
      {...props}
    >
      {children}
    </div>
  );
}
