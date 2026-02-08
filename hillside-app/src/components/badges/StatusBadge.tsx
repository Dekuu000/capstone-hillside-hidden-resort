import type { LucideIcon } from 'lucide-react';

interface StatusBadgeProps {
    label: string;
    className?: string;
    icon?: LucideIcon;
}

export function StatusBadge({ label, className = '', icon: Icon }: StatusBadgeProps) {
    return (
        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${className}`.trim()}>
            {Icon && <Icon className="w-3.5 h-3.5" />}
            {label}
        </span>
    );
}
