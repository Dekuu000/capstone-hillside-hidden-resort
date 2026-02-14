import { useEffect, useMemo, useRef, useState } from 'react';
import { DayPicker, type DateRange, type Matcher } from 'react-day-picker';
import { addDays, differenceInCalendarDays, format } from 'date-fns';
import { Calendar } from 'lucide-react';
import 'react-day-picker/style.css';

export interface AvailabilityRangePickerProps {
    value: DateRange | undefined;
    onChange: (nextRange: DateRange | undefined) => void;
    booked?: Matcher | Matcher[];
    maintenance?: Matcher | Matcher[];
    unavailable?: Matcher | Matcher[];
    minNights?: number;
    disabledBefore?: Date;
}

export interface AvailabilityDatePickerProps {
    value: Date | undefined;
    onChange: (nextDate: Date | undefined) => void;
    booked?: Matcher | Matcher[];
    maintenance?: Matcher | Matcher[];
    unavailable?: Matcher | Matcher[];
    disabledBefore?: Date;
    placeholder?: string;
}

type RangeEndpoint = 'from' | 'to';

function normalizeMatchers(value?: Matcher | Matcher[]) {
    if (!value) return [];
    return Array.isArray(value) ? value : [value];
}

function formatDisplay(date?: Date) {
    if (!date) return 'Select date';
    return format(date, 'EEE, MMM d, yyyy');
}

function buildDisabledMatchers(
    booked?: Matcher | Matcher[],
    maintenance?: Matcher | Matcher[],
    unavailable?: Matcher | Matcher[],
    disabledBefore?: Date
) {
    const disabled: Matcher[] = [];
    normalizeMatchers(booked).forEach((matcher) => disabled.push(matcher));
    normalizeMatchers(maintenance).forEach((matcher) => disabled.push(matcher));
    normalizeMatchers(unavailable).forEach((matcher) => disabled.push(matcher));
    if (disabledBefore) {
        disabled.push({ before: disabledBefore });
    }
    return disabled;
}

const calendarClassNames = {
    root: 'availability-calendar w-full',
    months: 'w-full',
    month: 'w-full',
    month_caption: 'relative flex items-center justify-center py-2',
    caption_label: 'text-sm font-semibold text-gray-900',
    nav: 'absolute inset-x-0 top-2 flex items-center justify-between',
    button_previous: 'h-8 w-8 rounded-full border border-gray-200 bg-white text-gray-500 hover:text-gray-900 hover:border-gray-300',
    button_next: 'h-8 w-8 rounded-full border border-gray-200 bg-white text-gray-500 hover:text-gray-900 hover:border-gray-300',
    chevron: 'h-4 w-4 fill-current',
    month_grid: 'w-full border-separate border-spacing-1',
    weekdays: '',
    weekday: 'text-center text-[11px] font-semibold text-gray-400 uppercase py-1',
    weeks: '',
    week: '',
    day: 'calendar-day text-center',
    day_button: 'calendar-day-button mx-auto flex h-9 w-9 items-center justify-center rounded-xl text-sm font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 transition-all duration-150',
    today: 'is-today',
    outside: 'is-outside',
    disabled: 'is-disabled',
    selected: 'is-selected',
    range_start: 'is-range-start',
    range_end: 'is-range-end',
    range_middle: 'is-range-middle',
};

const modifiersClassNames = {
    booked: 'is-booked',
    maintenance: 'is-maintenance',
    unavailable: 'is-unavailable',
};

const legendItems = [
    { label: 'Available', className: 'bg-emerald-400' },
    { label: 'Booked', className: 'bg-red-500' },
    { label: 'Maintenance', className: 'bg-yellow-400' },
    { label: 'Unavailable', className: 'bg-gray-300' },
    { label: 'Selected range', className: 'bg-blue-500' },
];

function hasStatusModifiers(
    booked?: Matcher | Matcher[],
    maintenance?: Matcher | Matcher[],
    unavailable?: Matcher | Matcher[]
) {
    return Boolean(booked || maintenance || unavailable);
}

export function AvailabilityRangePicker({
    value,
    onChange,
    booked,
    maintenance,
    unavailable,
    minNights = 1,
    disabledBefore,
}: AvailabilityRangePickerProps) {
    const [open, setOpen] = useState(false);
    const [activeField, setActiveField] = useState<RangeEndpoint>('from');
    const overlayRef = useRef<HTMLDivElement | null>(null);
    const [draftRange, setDraftRange] = useState<DateRange | undefined>(value);

    useEffect(() => {
        if (open) {
            setDraftRange(value);
        }
    }, [open, value]);

    useEffect(() => {
        function handleKey(event: KeyboardEvent) {
            if (event.key === 'Escape') setOpen(false);
        }
        if (open) {
            window.addEventListener('keydown', handleKey);
        }
        return () => window.removeEventListener('keydown', handleKey);
    }, [open]);

    const disabledMatchers = useMemo(
        () => buildDisabledMatchers(booked, maintenance, unavailable, disabledBefore),
        [booked, maintenance, unavailable, disabledBefore]
    );
    const showStatusLegend = hasStatusModifiers(booked, maintenance, unavailable);

    const handleDayPick = (day: Date, modifiers: Record<string, boolean>) => {
        if (modifiers.disabled) return;

        if (activeField === 'from') {
            const nextFrom = day;
            const existingTo = draftRange?.to;
            const nextTo = existingTo && existingTo >= nextFrom ? existingTo : undefined;
            setDraftRange({ from: nextFrom, to: nextTo });
            setActiveField('to');
            return;
        }

        const currentFrom = draftRange?.from ?? day;
        const normalizedRange = day < currentFrom
            ? { from: day, to: currentFrom }
            : { from: currentFrom, to: day };

        if (normalizedRange.from && normalizedRange.to && minNights > 1) {
            const nights = differenceInCalendarDays(normalizedRange.to, normalizedRange.from);
            if (nights < minNights) {
                setDraftRange({
                    from: normalizedRange.from,
                    to: addDays(normalizedRange.from, minNights),
                });
                return;
            }
        }

        setDraftRange(normalizedRange);
    };

    const displayCheckIn = formatDisplay(value?.from);
    const displayCheckOut = formatDisplay(value?.to);

    return (
        <div className="relative">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Check-in Date</label>
                    <button
                        type="button"
                        className="input w-full flex items-center justify-between text-left"
                        onClick={() => {
                            setActiveField('from');
                            setOpen(true);
                        }}
                    >
                        <span className={value?.from ? 'text-gray-900' : 'text-gray-400'}>
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
                        onClick={() => {
                            setActiveField('to');
                            setOpen(true);
                        }}
                    >
                        <span className={value?.to ? 'text-gray-900' : 'text-gray-400'}>
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
                            onDayClick={handleDayPick}
                            defaultMonth={draftRange?.from ?? disabledBefore ?? new Date()}
                            disabled={disabledMatchers}
                            modifiers={{
                                booked,
                                maintenance,
                                unavailable,
                            }}
                            modifiersClassNames={modifiersClassNames}
                            showOutsideDays
                            fixedWeeks
                            className="mx-auto availability-picker"
                            classNames={calendarClassNames}
                        />

                        {showStatusLegend ? (
                            <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-gray-600">
                                {legendItems.map((item) => (
                                    <div key={item.label} className="flex items-center gap-2">
                                        <span className={`h-3 w-3 rounded-full ${item.className}`} />
                                        <span>{item.label}</span>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <p className="mt-3 text-xs text-gray-500">
                                {activeField === 'from'
                                    ? 'Select your check-in date, then pick check-out.'
                                    : 'Select your check-out date to complete the range.'}
                            </p>
                        )}

                        <div className="mt-4 flex items-center justify-between">
                            <button
                                type="button"
                                className="text-xs font-semibold text-gray-500 hover:text-gray-700"
                                onClick={() => {
                                    setDraftRange(undefined);
                                    onChange(undefined);
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
                                    const to = draftRange.to ?? addDays(draftRange.from, minNights > 0 ? minNights : 1);
                                    onChange({ from, to });
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

export function AvailabilityDatePicker({
    value,
    onChange,
    booked,
    maintenance,
    unavailable,
    disabledBefore,
    placeholder = 'Select date',
}: AvailabilityDatePickerProps) {
    const [open, setOpen] = useState(false);
    const overlayRef = useRef<HTMLDivElement | null>(null);
    const [draftDate, setDraftDate] = useState<Date | undefined>(value);

    useEffect(() => {
        if (open) {
            setDraftDate(value);
        }
    }, [open, value]);

    useEffect(() => {
        function handleKey(event: KeyboardEvent) {
            if (event.key === 'Escape') setOpen(false);
        }
        if (open) {
            window.addEventListener('keydown', handleKey);
        }
        return () => window.removeEventListener('keydown', handleKey);
    }, [open]);

    const disabledMatchers = useMemo(
        () => buildDisabledMatchers(booked, maintenance, unavailable, disabledBefore),
        [booked, maintenance, unavailable, disabledBefore]
    );
    const showStatusLegend = hasStatusModifiers(booked, maintenance, unavailable);

    return (
        <div className="relative">
            <button
                type="button"
                className="input w-full flex items-center justify-between text-left"
                onClick={() => setOpen(true)}
            >
                <span className={value ? 'text-gray-900' : 'text-gray-400'}>
                    {value ? formatDisplay(value) : placeholder}
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
                            defaultMonth={draftDate ?? disabledBefore ?? new Date()}
                            disabled={disabledMatchers}
                            modifiers={{
                                booked,
                                maintenance,
                                unavailable,
                            }}
                            modifiersClassNames={modifiersClassNames}
                            showOutsideDays
                            fixedWeeks
                            className="mx-auto availability-picker"
                            classNames={calendarClassNames}
                        />

                        {showStatusLegend ? (
                            <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-gray-600">
                                {legendItems.map((item) => (
                                    <div key={item.label} className="flex items-center gap-2">
                                        <span className={`h-3 w-3 rounded-full ${item.className}`} />
                                        <span>{item.label}</span>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <p className="mt-3 text-xs text-gray-500">
                                Pick a date to continue.
                            </p>
                        )}

                        <div className="mt-4 flex items-center justify-between">
                            <button
                                type="button"
                                className="text-xs font-semibold text-gray-500 hover:text-gray-700"
                                onClick={() => {
                                    setDraftDate(undefined);
                                    onChange(undefined);
                                    setOpen(false);
                                }}
                            >
                                Clear date
                            </button>
                            <button
                                type="button"
                                className="btn-primary"
                                onClick={() => {
                                    if (!draftDate) return;
                                    onChange(draftDate);
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
