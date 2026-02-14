import { useEffect, useMemo, useRef, useState } from 'react';
import { DayPicker } from 'react-day-picker';
import { format } from 'date-fns';
import { Calendar } from 'lucide-react';
import { formatDateWithWeekday } from '../../lib/validation';
import { calendarClassNames } from './calendarStyles';
import 'react-day-picker/style.css';

interface DatePickerProps {
    value: string;
    onChange: (value: string) => void;
    minDate?: string;
    placeholder?: string;
    allowClear?: boolean;
}

function toDateValue(value?: string) {
    if (!value) return undefined;
    const simpleDate = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    const date = simpleDate
        ? new Date(Number(simpleDate[1]), Number(simpleDate[2]) - 1, Number(simpleDate[3]))
        : new Date(value);
    return Number.isNaN(date.getTime()) ? undefined : date;
}

function toIsoDate(date: Date) {
    return format(date, 'yyyy-MM-dd');
}

export function DatePicker({
    value,
    onChange,
    minDate,
    placeholder = 'Select date',
    allowClear = true,
}: DatePickerProps) {
    const [open, setOpen] = useState(false);
    const overlayRef = useRef<HTMLDivElement | null>(null);
    const selectedDate = useMemo(() => toDateValue(value), [value]);
    const [draftDate, setDraftDate] = useState<Date | undefined>(selectedDate);

    useEffect(() => {
        if (open) {
            setDraftDate(selectedDate);
        }
    }, [open, selectedDate]);

    useEffect(() => {
        function handleKey(event: KeyboardEvent) {
            if (event.key === 'Escape') setOpen(false);
        }
        if (open) {
            window.addEventListener('keydown', handleKey);
        }
        return () => window.removeEventListener('keydown', handleKey);
    }, [open]);

    const minSelectable = toDateValue(minDate);
    const displayValue = value ? formatDateWithWeekday(value) : placeholder;

    return (
        <div className="relative">
            <button
                type="button"
                className="input w-full flex items-center justify-between text-left"
                onClick={() => setOpen(true)}
            >
                <span className={value ? 'text-gray-900' : 'text-gray-400'}>
                    {displayValue}
                </span>
                <Calendar className="w-4 h-4 text-gray-400" />
            </button>

            {open && (
                <div
                    ref={overlayRef}
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
                    onClick={(event) => {
                        if (event.target === overlayRef.current) {
                            setOpen(false);
                        }
                    }}
                >
                    <div className="w-full max-w-sm rounded-2xl bg-white p-4 shadow-xl">
                        <div className="mb-3">
                            <p className="text-sm font-semibold text-gray-900">Select date</p>
                            <p className="text-xs text-gray-500">Choose a date to continue.</p>
                        </div>

                        <DayPicker
                            mode="single"
                            selected={draftDate}
                            onSelect={(date) => setDraftDate(date)}
                            defaultMonth={draftDate ?? minSelectable ?? new Date()}
                            fromDate={minSelectable}
                            className="mx-auto"
                            classNames={calendarClassNames}
                        />

                        <div className="mt-4 flex items-center justify-between">
                            {allowClear ? (
                                <button
                                    type="button"
                                    className="text-xs font-semibold text-gray-500 hover:text-gray-700"
                                    onClick={() => {
                                        setDraftDate(undefined);
                                        onChange('');
                                        setOpen(false);
                                    }}
                                >
                                    Clear date
                                </button>
                            ) : (
                                <span />
                            )}
                            <button
                                type="button"
                                className="btn-primary"
                                onClick={() => {
                                    if (!draftDate) {
                                        if (allowClear) {
                                            onChange('');
                                            setOpen(false);
                                        }
                                        return;
                                    }
                                    onChange(toIsoDate(draftDate));
                                    setOpen(false);
                                }}
                            >
                                Done
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
