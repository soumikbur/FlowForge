import React from "react";
import { Loader2 } from "lucide-react";

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "danger" | "ghost" | "outline" | "link";
  size?: "xs" | "sm" | "md" | "lg";
  isLoading?: boolean;
  loadingText?: string;
  icon?: React.ReactNode;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      children,
      variant = "primary",
      size = "md",
      isLoading = false,
      loadingText,
      icon,
      leftIcon,
      rightIcon,
      disabled,
      className = "",
      type = "button",
      ...props
    },
    ref,
  ) => {
    const baseStyles =
      "inline-flex items-center justify-center font-medium transition-all duration-150 rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed select-none active:scale-[0.98]";

    const variantStyles = {
      primary:
        "bg-[#6738E8] hover:bg-[#582ecb] active:bg-[#4925a8] text-white shadow-xs focus-visible:ring-[#6738E8]",
      secondary:
        "bg-surface-secondary hover:bg-surface-hover active:bg-border-default text-text-primary border border-border-default focus-visible:ring-purple-400",
      danger:
        "bg-rose-600 bg-[#EB5757] hover:bg-rose-700 hover:bg-[#d64545] active:bg-[#b83333] text-white shadow-xs focus-visible:ring-rose-500",
      ghost:
        "bg-transparent hover:bg-surface-hover active:bg-surface-secondary text-text-secondary hover:text-text-primary focus-visible:ring-purple-400",
      outline:
        "bg-surface-primary border border-border-default hover:bg-surface-hover hover:border-border-strong active:bg-surface-secondary text-text-primary shadow-xs focus-visible:ring-[#6738E8]",
      link: "bg-transparent text-[#6738E8] dark:text-[#8156F2] hover:underline underline-offset-4 p-0 h-auto focus-visible:ring-[#6738E8]",
    };

    const sizeStyles = {
      xs: "px-2.5 py-1 text-xs gap-1",
      sm: "px-3 py-1.5 text-xs gap-1.5 font-medium",
      md: "px-4 py-2 text-sm gap-2",
      lg: "px-5 py-2.5 text-base gap-2.5",
    };

    const isDisabled = disabled || isLoading;
    const startIcon = icon || leftIcon;

    return (
      <button
        ref={ref}
        type={type}
        disabled={isDisabled}
        aria-busy={isLoading}
        className={`${baseStyles} ${variantStyles[variant]} ${variant === "link" ? "" : sizeStyles[size]} ${className}`}
        {...props}
      >
        {isLoading ? (
          <>
            <Loader2
              className="w-4 h-4 animate-spin shrink-0"
              aria-hidden="true"
            />
            <span>{loadingText || children}</span>
          </>
        ) : (
          <>
            {startIcon && (
              <span className="shrink-0" aria-hidden="true">
                {startIcon}
              </span>
            )}
            <span>{children}</span>
            {rightIcon && (
              <span className="shrink-0" aria-hidden="true">
                {rightIcon}
              </span>
            )}
          </>
        )}
      </button>
    );
  },
);

Button.displayName = "Button";
