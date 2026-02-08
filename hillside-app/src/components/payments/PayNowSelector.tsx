interface PayNowPreset {
    label: string;
    value: number;
}

interface PayNowSelectorProps {
    label?: string;
    value: number;
    presets: PayNowPreset[];
    onSelectPreset: (value: number) => void;
    showCustomToggle?: boolean;
    customActive?: boolean;
    onToggleCustom?: () => void;
    showCustomInput?: boolean;
    onCustomChange?: (rawValue: string) => void;
    onCustomBlur?: () => void;
    error?: string | null;
    helperText?: string;
    min?: number;
    max?: number;
    step?: number;
    inputClassName?: string;
    inputWrapperClassName?: string;
    showCurrencyPrefix?: boolean;
}

export function PayNowSelector({
    label = 'Amount to pay now (online)',
    value,
    presets,
    onSelectPreset,
    showCustomToggle = true,
    customActive = false,
    onToggleCustom,
    showCustomInput = false,
    onCustomChange,
    onCustomBlur,
    error,
    helperText,
    min,
    max,
    step = 10,
    inputClassName = 'input w-full',
    inputWrapperClassName = '',
    showCurrencyPrefix = false,
}: PayNowSelectorProps) {
    return (
        <div className="pt-2 space-y-2">
            {label && (
                <label className="text-xs font-medium text-gray-600">
                    {label}
                </label>
            )}
            <div className="flex flex-wrap items-center gap-2 text-xs">
                {presets.map((preset) => (
                    <button
                        key={preset.label}
                        type="button"
                        className={`px-2 py-1 rounded-md border ${
                            value === preset.value
                                ? 'border-primary text-primary'
                                : 'border-gray-200 text-gray-600 hover:text-gray-900'
                        }`}
                        onClick={() => onSelectPreset(preset.value)}
                    >
                        {preset.label}
                    </button>
                ))}
                {showCustomToggle && (
                    <button
                        type="button"
                        className={`ml-auto px-2.5 py-1 rounded-full border text-xs font-semibold ${
                            customActive
                                ? 'border-primary bg-primary/10 text-primary'
                                : 'border-gray-200 text-gray-600 hover:text-gray-900 hover:border-gray-300'
                        }`}
                        onClick={onToggleCustom}
                    >
                        {customActive ? 'Custom amount ✓' : 'Custom amount'}
                    </button>
                )}
            </div>
            {showCustomInput && (
                <div className={`relative ${inputWrapperClassName}`.trim()}>
                    {showCurrencyPrefix && (
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-gray-500">₱</span>
                    )}
                    <input
                        type="text"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        min={min}
                        max={max}
                        step={step}
                        className={`${inputClassName} ${showCurrencyPrefix ? 'pl-7' : ''}`.trim()}
                        value={value}
                        onChange={(e) => onCustomChange?.(e.target.value)}
                        onBlur={onCustomBlur}
                    />
                </div>
            )}
            {error && <p className="text-xs text-red-600">{error}</p>}
            {helperText && <p className="text-xs text-gray-500">{helperText}</p>}
        </div>
    );
}
