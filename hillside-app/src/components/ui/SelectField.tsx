import {
    Children,
    isValidElement,
    useEffect,
    useMemo,
    useRef,
    useState,
    type ChangeEvent,
    type ReactNode,
    type SelectHTMLAttributes,
} from 'react';
import { Check, ChevronDown } from 'lucide-react';

type OptionItem = {
    value: string;
    label: string;
    disabled: boolean;
};

type SelectFieldProps = Omit<SelectHTMLAttributes<HTMLSelectElement>, 'children'> & {
    children: ReactNode;
    wrapperClassName?: string;
    placeholder?: string;
};

function extractOptions(children: ReactNode): OptionItem[] {
    const list = Children.toArray(children);
    return list
        .filter((child) => isValidElement(child))
        .map((child) => {
            const props = (child as { props?: Record<string, unknown> }).props ?? {};
            const rawChildren = props.children;
            return {
                value: String(props.value ?? ''),
                label: typeof rawChildren === 'string' ? rawChildren : String(rawChildren ?? ''),
                disabled: Boolean(props.disabled),
            };
        });
}

export function SelectField({
    className = '',
    wrapperClassName = '',
    children,
    value,
    onChange,
    disabled,
    placeholder,
}: SelectFieldProps) {
    const rootRef = useRef<HTMLDivElement | null>(null);
    const [open, setOpen] = useState(false);
    const options = useMemo(() => extractOptions(children), [children]);
    const selected = options.find((opt) => opt.value === String(value ?? '')) ?? options[0];

    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (!rootRef.current) return;
            if (!rootRef.current.contains(event.target as Node)) {
                setOpen(false);
            }
        }
        function handleEscape(event: KeyboardEvent) {
            if (event.key === 'Escape') setOpen(false);
        }

        document.addEventListener('mousedown', handleClickOutside);
        document.addEventListener('keydown', handleEscape);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
            document.removeEventListener('keydown', handleEscape);
        };
    }, []);

    function selectValue(nextValue: string) {
        if (disabled) return;
        onChange?.({ target: { value: nextValue } } as ChangeEvent<HTMLSelectElement>);
        setOpen(false);
    }

    return (
        <div ref={rootRef} className={`relative ${wrapperClassName}`}>
            <button
                type="button"
                disabled={disabled}
                onClick={() => setOpen((prev) => !prev)}
                className={`input flex w-full items-center justify-between text-left text-sm md:text-base ${className} ${disabled ? 'cursor-not-allowed bg-gray-100 text-gray-400' : ''}`}
                aria-haspopup="listbox"
                aria-expanded={open}
            >
                <span className={`truncate ${selected ? 'text-gray-800' : 'text-gray-400'}`}>
                    {selected?.label || placeholder || 'Select'}
                </span>
                <ChevronDown className={`ml-3 h-4 w-4 shrink-0 text-gray-500 transition-transform ${open ? 'rotate-180' : ''}`} />
            </button>

            {open && (
                <div className="absolute z-50 mt-1 w-full overflow-hidden rounded-lg border border-gray-200 bg-white shadow-xl">
                    <ul
                        role="listbox"
                        className="max-h-64 overflow-y-auto py-1 text-sm"
                    >
                        {options.map((option) => {
                            const isSelected = option.value === selected?.value;
                            return (
                                <li key={option.value}>
                                    <button
                                        type="button"
                                        disabled={option.disabled}
                                        onClick={() => selectValue(option.value)}
                                        className={`flex w-full items-center justify-between px-3 py-2 text-left transition-colors ${
                                            option.disabled
                                                ? 'cursor-not-allowed text-gray-300'
                                                : isSelected
                                                    ? 'bg-primary text-white'
                                                    : 'text-gray-800 hover:bg-blue-50'
                                        }`}
                                    >
                                        <span className="truncate">{option.label}</span>
                                        {isSelected && <Check className="ml-2 h-4 w-4 shrink-0" />}
                                    </button>
                                </li>
                            );
                        })}
                    </ul>
                </div>
            )}
        </div>
    );
}
