"use client";

import { useState } from "react";
import { format } from "date-fns";
import { CalendarDays, Check, Clock3 } from "lucide-react";

import { Calendar } from "@/components/ui/calendar";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

function toLocalDateTime(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function parseLocalDateTime(value: string): Date | undefined {
  if (!value) return undefined;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

function hour24(hour12: number, period: "AM" | "PM"): number {
  if (period === "AM") return hour12 === 12 ? 0 : hour12;
  return hour12 === 12 ? 12 : hour12 + 12;
}

function TimePartSelect({
  value,
  onValueChange,
  options,
  ariaLabel,
  caption,
  width = "w-[72px]",
}: {
  value: string;
  onValueChange: (value: string) => void;
  options: string[];
  ariaLabel: string;
  caption: string;
  width?: string;
}) {
  return (
    <div className="min-w-0">
      <span className="mb-1 block text-[10px] font-bold uppercase tracking-[.1em] text-[#80756c]">{caption}</span>
      <Select value={value} onValueChange={onValueChange}>
        <SelectTrigger
          aria-label={ariaLabel}
          className={`h-10 ${width} cursor-pointer rounded-xl border-[#d8cebd] bg-white px-3 font-semibold text-[#352b34] shadow-sm hover:border-[#bba989] focus-visible:border-[#8f2f43] focus-visible:ring-[#8f2f43]/20`}
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent
          position="popper"
          align="start"
          className="z-[70] max-h-56 min-w-[var(--radix-select-trigger-width)] rounded-xl border-[#d8cebd] bg-[#fffdf9] p-1 shadow-[0_16px_40px_rgb(37_25_35/18%)]"
        >
          {options.map((option) => (
            <SelectItem
              key={option}
              value={option}
              className="cursor-pointer rounded-lg px-3 py-2 pr-8 font-medium focus:bg-[#efe4d8] focus:text-[#6f2436]"
            >
              {option}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

export function DateTimePicker({
  value,
  onChange,
  ariaLabel,
}: {
  value: string;
  onChange: (value: string) => void;
  ariaLabel: string;
}) {
  const [open, setOpen] = useState(false);
  const selected = parseLocalDateTime(value);
  const selectedHour = selected?.getHours() ?? 9;
  const selectedMinute = selected?.getMinutes() ?? 0;
  const selectedPeriod: "AM" | "PM" = selectedHour >= 12 ? "PM" : "AM";
  const displayHour = selectedHour % 12 || 12;
  const minuteOptions = Array.from(new Set([
    ...Array.from({ length: 12 }, (_, index) => pad(index * 5)),
    pad(selectedMinute),
  ])).sort();

  const chooseDate = (date: Date | undefined) => {
    if (!date) return;
    const next = new Date(date);
    next.setHours(selected?.getHours() ?? 9, selected?.getMinutes() ?? 0, 0, 0);
    onChange(toLocalDateTime(next));
  };

  const chooseTime = (hours: number, minutes: number) => {
    const next = selected ? new Date(selected) : new Date();
    next.setHours(hours, minutes, 0, 0);
    onChange(toLocalDateTime(next));
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button
          type="button"
          aria-label={ariaLabel}
          className="mt-2 flex h-12 w-full cursor-pointer items-center justify-between rounded-xl border border-[#d8cebd] bg-white px-4 text-left text-[#211a22] shadow-[0_1px_2px_rgb(58_41_48/5%)] transition hover:border-[#bba989] hover:bg-[#fffdf9] focus-visible:border-[#8f2f43] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8f2f43]/20"
        >
          <span className="flex min-w-0 items-center gap-3">
            <CalendarDays size={18} className="shrink-0 text-[#8f2f43]" />
            <span className="truncate">{selected ? format(selected, "EEE, MMM d, yyyy · h:mm a") : "Choose date and time"}</span>
          </span>
          <Clock3 size={17} className="ml-3 shrink-0 text-[#82776d]" />
        </button>
      </DialogTrigger>
      <DialogContent
        showCloseButton={false}
        className="flex max-h-[calc(100dvh-2rem)] w-[380px] max-w-[calc(100vw-2rem)] flex-col gap-0 overflow-hidden rounded-2xl border-[#d8cebd] bg-[#fffdf9] p-0 shadow-[0_28px_80px_rgb(25_16_24/28%)] sm:max-w-[380px]"
      >
        <div className="flex shrink-0 items-center justify-between gap-4 border-b border-[#e4dacb] px-4 py-3">
          <div><DialogTitle className="text-sm font-bold text-[#211a22]">{ariaLabel}</DialogTitle><DialogDescription className="mt-0.5 text-xs text-[#746b64]">Choose a date and local time.</DialogDescription></div>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="inline-flex h-9 shrink-0 cursor-pointer items-center gap-1.5 rounded-xl bg-[#8f2f43] px-3.5 text-sm font-bold text-white transition hover:bg-[#742437] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8f2f43]/30"
          >
            <Check size={15} /> Done
          </button>
        </div>
        <div className="min-h-0 overflow-y-auto overscroll-contain">
          <Calendar
            mode="single"
            selected={selected}
            onSelect={chooseDate}
            defaultMonth={selected}
            className="mx-auto p-3"
            classNames={{
              today: "rounded-lg bg-[#f2e6cf] text-[#6f4f1b]",
              day: "group/day relative aspect-square h-full w-full cursor-pointer p-0 text-center select-none",
            }}
          />
        </div>
        <div className="shrink-0 border-t border-[#e4dacb] bg-[#faf6ef] p-3">
          <div className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-[.12em] text-[#746b64]"><Clock3 size={14} className="text-[#8f2f43]"/>Time</div>
          <div className="flex items-end gap-2">
            <TimePartSelect
              ariaLabel="Hour"
              caption="Hour"
              value={pad(displayHour)}
              onValueChange={(nextHour) => chooseTime(hour24(Number(nextHour), selectedPeriod), selectedMinute)}
              options={Array.from({ length: 12 }, (_, index) => pad(index + 1))}
            />
            <span aria-hidden="true" className="pb-2.5 font-bold text-[#746b64]">:</span>
            <TimePartSelect
              ariaLabel="Minute"
              caption="Minute"
              value={pad(selectedMinute)}
              onValueChange={(nextMinute) => chooseTime(selectedHour, Number(nextMinute))}
              options={minuteOptions}
            />
            <TimePartSelect
              ariaLabel="AM or PM"
              caption="AM / PM"
              value={selectedPeriod}
              onValueChange={(nextPeriod) => chooseTime(hour24(displayHour, nextPeriod as "AM" | "PM"), selectedMinute)}
              options={["AM", "PM"]}
              width="w-[86px]"
            />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
