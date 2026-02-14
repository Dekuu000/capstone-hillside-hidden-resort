import { useEffect, useMemo, useRef, useState } from 'react';
import { DayPicker, type DateRange } from 'react-day-picker';
import { format } from 'date-fns';
import { Calendar } from 'lucide-react';
import { formatDateWithWeekday } from '../../lib/validation';
import { calendarClassNames } from './calendarStyles';
import 'react-day-picker/style.css';

interface DateRangePickerProps {
    checkInDate: string;
    checkOutDate: string;
    onChange: (checkIn: string, checkOut: string) => void;
    minDate?: string;
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

export function DateRangePicker({
    checkInDate,
    checkOutDate,
    onChange,
    minDate,
}: DateRangePickerProps) {
    const [open, setOpen] = useState(false);
    const overlayRef = useRef<HTMLDivElement | null>(null);

    const currentRange = useMemo<DateRange>(() => ({
        from: toDateValue(checkInDate),
        to: toDateValue(checkOutDate),
    }), [checkInDate, checkOutDate]);

    const [draftRange, setDraftRange] = useState<DateRange | undefined>(currentRange);

    useEffect(() => {
        if (open) {
            setDraftRange(currentRange);
        }
    }, [open, currentRange]);

    useEffect(() => {
        function handleKey(event: KeyboardEvent) {
            if (event.key === 'Escape') setOpen(false);
        }
        if (open) {
            window.addEventListener('keydown', handleKey);
        }
        return () => window.removeEventListener('keydown', handleKey);
    }, [open]);

    const displayCheckIn = checkInDate ? formatDateWithWeekday(checkInDate) : 'Select date';
    const displayCheckOut = checkOutDate ? formatDateWithWeekday(checkOutDate) : 'Select date';

    const minSelectable = toDateValue(minDate) ?? new Date();

    const legend = [
        { label: 'Selected', className: 'bg-red-500 text-white' },
        { label: 'Date range', className: 'bg-emerald-100 text-emerald-700 border border-emerald-200' },
    ];

    return (
        <div className="relative">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Check-in Date</label>
                    <button
                        type="button"
                        className="input w-full flex items-center justify-between text-left"
                        onClick={() => setOpen(true)}
                    >
                        <span className={checkInDate ? 'text-gray-900' : 'text-gray-400'}>
                            {displayCheckIn}
                        </span>
                        <Calendar className="w-4 h-4 text-gray-400" />
                    </button>
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Check-out Date</label>
                    <button
                        type="button"
                        className="input w-full flex items-center justify-between text-left"
                        onClick={() => setOpen(true)}
                    >
                        <span className={checkOutDate ? 'text-gray-900' : 'text-gray-400'}>
                            {displayCheckOut}
                        </span>
                        <Calendar className="w-4 h-4 text-gray-400" />
                    </button>
                </div>
            </div>

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
                            <p className="text-sm font-semibold text-gray-900">Select stay dates</p>
                            <p className="text-xs text-gray-500">Tap a start and end date.</p>
                        </div>

                        <DayPicker
                            mode="range"
                            selected={draftRange}
                            onSelect={(range) => setDraftRange(range)}
                            defaultMonth={draftRange?.from ?? minSelectable}
                            fromDate={minSelectable}
                            className="mx-auto"
                            classNames={calendarClassNames}
                        />

                        <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-gray-600">
                            {legend.map((item) => (
                                <div key={item.label} className="flex items-center gap-2">
                                    <span className={`h-3 w-3 rounded-full ${item.className}`} />
                                    <span>{item.label}</span>
                                </div>
                            ))}
                        </div>

                        <div className="mt-4 flex items-center justify-between">
                            <button
                                type="button"
                                className="text-xs font-semibold text-gray-500 hover:text-gray-700"
                                onClick={() => {
                                    const today = new Date();
                                    const nextDay = new Date(today);
                                    nextDay.setDate(today.getDate() + 1);
                                    const nextRange = { from: today, to: nextDay };
                                    setDraftRange(nextRange);
                                    onChange(toIsoDate(today), toIsoDate(nextDay));
                                    setOpen(false);
                                }}
                            >
                                Clear dates
                            </button>
                            <button
                                type="button"
                                className="btn-primary"
                                onClick={() => {
                                    if (!draftRange?.from) return;
                                    const from = draftRange.from;
                                    const to = draftRange.to ?? draftRange.from;
                                    onChange(toIsoDate(from), toIsoDate(to));
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
