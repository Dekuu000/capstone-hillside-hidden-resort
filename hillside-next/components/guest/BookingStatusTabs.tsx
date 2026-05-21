"use client";

import { Tabs, type TabItem } from "../shared/Tabs";

type BookingStatusTabsProps = {
  items: TabItem[];
  value: string;
  onChange: (value: string) => void;
  className?: string;
  helperText?: string;
};

export function BookingStatusTabs({ items, value, onChange, className, helperText }: BookingStatusTabsProps) {
  return (
    <div data-testid="guest-tabs" className={className}>
      <Tabs
        items={items}
        value={value}
        onChange={onChange}
        ariaLabel="Booking status tabs"
        mobileMode="scroll"
        className="-mx-1 border-none bg-transparent p-0 px-1 pb-2 sm:mx-0 sm:grid-cols-4 sm:px-0 sm:pb-0"
        tabClassName="h-11 min-w-[118px] shrink-0 rounded-2xl px-4 text-sm font-bold sm:min-w-0 sm:px-5"
        activeClassName="border border-[var(--color-secondary)] bg-teal-50 text-[var(--color-secondary)] shadow-sm"
        inactiveClassName="border border-transparent text-slate-500 hover:bg-slate-50 hover:text-[var(--color-primary)]"
      />
      {helperText ? <p className="mt-4 text-sm text-slate-500">{helperText}</p> : null}
    </div>
  );
}
