"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "../../lib/cn";

type ButtonVariant = "primary" | "secondary" | "ghost" | "destructive";
type ButtonSize = "sm" | "md" | "lg";

const variantClass: Record<ButtonVariant, string> = {
  primary: "bg-[var(--color-cta)] text-white hover:brightness-95",
  secondary: "border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)] hover:bg-slate-50",
  ghost: "bg-transparent text-[var(--color-primary)] hover:bg-slate-100",
  destructive: "bg-[var(--color-error)] text-white hover:brightness-95",
};

const sizeClass: Record<ButtonSize, string> = {
  sm: "h-9 px-3 text-sm",
  md: "h-10 px-4 text-sm",
  lg: "h-12 px-6 text-base",
};

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  leftSlot?: ReactNode;
};

export function Button({
  variant = "primary",
  size = "md",
  loading = false,
  disabled,
  className,
  children,
  leftSlot,
  ...rest
}: ButtonProps) {
  const isDisabled = disabled || loading;
  return (
    <button
      {...rest}
      disabled={isDisabled}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-[10px] font-semibold transition duration-200 focus-visible:outline-none",
        "focus-visible:ring-4 focus-visible:ring-teal-200 disabled:cursor-not-allowed disabled:opacity-60",
        sizeClass[size],
        variantClass[variant],
        className,
      )}
    >
      {loading ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-r-transparent" aria-hidden="true" /> : leftSlot}
      <span>{children}</span>
    </button>
  );
}
