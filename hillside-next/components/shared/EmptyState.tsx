import { Button } from "./Button";

export function EmptyState({
  title,
  description,
  actionLabel,
  onAction,
  compact = false,
}: {
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
  compact?: boolean;
}) {
  return (
    <div
      className={`surface flex flex-col items-center justify-center text-center ${
        compact ? "px-4 py-6" : "px-6 py-10"
      }`}
    >
      <h3 className={`${compact ? "text-base" : "text-lg"} font-semibold text-[var(--color-text)]`}>
        {title}
      </h3>
      <p className="mt-2 max-w-md text-sm text-[var(--color-muted)]">{description}</p>
      {actionLabel && onAction ? (
        <Button className="mt-4" variant="secondary" onClick={onAction}>
          {actionLabel}
        </Button>
      ) : null}
    </div>
  );
}
