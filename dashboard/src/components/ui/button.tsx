import { cn } from "@/lib/utils";
import { type ReactNode } from "react";

interface ButtonProps {
  children: ReactNode;
  onClick?: () => void;
  type?: "button" | "submit" | "reset";
  variant?: "primary" | "secondary" | "danger" | "ghost" | "pill";
  disabled?: boolean;
  className?: string;
}

export function Button({
  children,
  onClick,
  type = "button",
  variant = "primary",
  disabled = false,
  className,
}: ButtonProps) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "px-3.5 py-1.5 text-sm font-medium transition-colors duration-200 rounded-full",
        "border disabled:opacity-50 disabled:cursor-not-allowed",
        variant === "primary" && "glass-button-primary",
        variant === "secondary" && "glass-button-secondary text-[var(--text-primary)]",
        variant === "danger" && "glass-button-danger",
        variant === "ghost" && "glass-button-ghost text-[var(--text-secondary)] hover:text-[var(--text-primary)]",
        variant === "pill"
          && "rounded-full border-[var(--surface-border)] bg-[var(--surface-base)] text-[var(--text-primary)] shadow-none transition-[background-color,border-color,color,transform,box-shadow] duration-200 hover:bg-[var(--surface-muted)] hover:border-[var(--surface-border-strong)] active:translate-y-px disabled:hover:bg-[var(--surface-base)] disabled:hover:border-[var(--surface-border)] disabled:active:translate-y-0",
        className
      )}
    >
      {children}
    </button>
  );
}
