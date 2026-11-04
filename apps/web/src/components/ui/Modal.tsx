import React, { useEffect, useRef } from "react";
import { X } from "lucide-react";

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  maxWidth?: "sm" | "md" | "lg" | "xl" | "2xl";
  children: React.ReactNode;
}

export function Modal({
  isOpen,
  onClose,
  title,
  description,
  maxWidth = "md",
  children,
}: ModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);
  const titleId = "modal-title";
  const descId = "modal-description";

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = originalOverflow;
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const maxWidthStyles = {
    sm: "max-w-sm",
    md: "max-w-md",
    lg: "max-w-lg",
    xl: "max-w-xl",
    "2xl": "max-w-2xl",
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-navy-900/60 dark:bg-black/70 backdrop-blur-xs overflow-y-auto"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={description ? descId : undefined}
    >
      <div
        ref={modalRef}
        className={`w-full ${maxWidthStyles[maxWidth]} bg-surface-primary border border-border-default rounded-2xl shadow-elevated overflow-hidden animate-in fade-in-0 zoom-in-95 duration-150`}
      >
        <div className="px-6 py-5 border-b border-border-subtle flex items-center justify-between">
          <div>
            <h3
              id={titleId}
              className="text-base font-semibold text-text-primary"
            >
              {title}
            </h3>
            {description && (
              <p id={descId} className="text-xs text-text-secondary mt-1">
                {description}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close modal"
            className="p-1.5 rounded-lg text-text-muted hover:text-text-primary hover:bg-surface-secondary transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6">{children}</div>
      </div>
    </div>
  );
}
