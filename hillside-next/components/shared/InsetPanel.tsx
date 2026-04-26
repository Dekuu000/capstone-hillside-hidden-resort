import type { ComponentPropsWithoutRef, ElementType, ReactNode } from "react";
import { cn } from "../../lib/cn";

type InsetPanelTone = "muted" | "surface";

const toneClass: Record<InsetPanelTone, string> = {
  muted: "bg-slate-50",
  surface: "bg-white",
};

type InsetPanelProps<T extends ElementType> = {
  as?: T;
  tone?: InsetPanelTone;
  className?: string;
  children: ReactNode;
} & Omit<ComponentPropsWithoutRef<T>, "as" | "className" | "children">;

export function InsetPanel<T extends ElementType = "div">({
  as,
  tone = "muted",
  className,
  children,
  ...rest
}: InsetPanelProps<T>) {
  const Component = as ?? "div";
  return (
    <Component
      className={cn("rounded-xl border border-[var(--color-border)] p-3", toneClass[tone], className)}
      {...rest}
    >
      {children}
    </Component>
  );
}
