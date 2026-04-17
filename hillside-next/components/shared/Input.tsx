"use client";

import type { InputHTMLAttributes, ReactNode } from "react";
import { cn } from "../../lib/cn";

type InputState = "default" | "error" | "success";

export type InputProps = InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  helperText?: string;
  errorText?: string;
  successText?: string;
  rightSlot?: ReactNode;
};

function resolveState({ errorText, successText }: Pick<InputProps, "errorText" | "successText">): InputState {
  if (errorText) return "error";
  if (successText) return "success";
  return "default";
}

export function Input({ label, helperText, errorText, successText, className, rightSlot, id, ...rest }: InputProps) {
  const state = resolveState({ errorText, successText });
  const helper = errorText || successText || helperText;
  const describedBy = helper ? `${id || label}-hint` : undefined;

  return (
    <label className="block">
      <span className="mb-2 block text-sm font-medium text-[var(--color-text)]">{label}</span>
      <span
        className={cn(
          "flex items-center gap-2 rounded-[14px] border bg-[var(--color-surface)] px-3 shadow-[var(--shadow-sm)] transition duration-200 focus-within:border-[color:color-mix(in_srgb,var(--color-secondary)_55%,white)] focus-within:ring-2 focus-within:ring-[color:color-mix(in_srgb,var(--color-secondary)_20%,white)]",
          state === "default" && "border-[color:color-mix(in_srgb,var(--color-border)_92%,white)]",
          state === "error" && "border-red-300 focus-within:border-red-400 focus-within:ring-red-100",
          state === "success" && "border-emerald-300 focus-within:border-emerald-400 focus-within:ring-emerald-100",
        )}
      >
        <input
          id={id}
          {...rest}
          aria-invalid={state === "error"}
          aria-describedby={describedBy}
          className={cn(
            "h-12 w-full border-0 bg-transparent text-sm text-[var(--color-text)] outline-none placeholder:text-[color:color-mix(in_srgb,var(--color-muted)_82%,white)]",
            className,
          )}
        />
        {rightSlot}
      </span>
      {helper ? (
        <span
          id={describedBy}
          className={cn(
            "mt-1 block text-xs",
            state === "error" && "text-red-600",
            state === "success" && "text-emerald-600",
            state === "default" && "text-[var(--color-muted)]",
          )}
        >
          {helper}
        </span>
      ) : null}
    </label>
  );
}
