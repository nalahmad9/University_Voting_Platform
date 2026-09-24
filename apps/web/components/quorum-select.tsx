"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export type QuorumSelectOption = {
  value: string;
  label: string;
};

export function QuorumSelect({
  value,
  onValueChange,
  options,
  ariaLabel,
  placeholder = "Select an option",
  compact = false,
}: {
  value: string;
  onValueChange: (value: string) => void;
  options: QuorumSelectOption[];
  ariaLabel: string;
  placeholder?: string;
  compact?: boolean;
}) {
  return (
    <Select value={value} onValueChange={onValueChange}>
      <SelectTrigger
        aria-label={ariaLabel}
        className={`${compact ? "h-10 min-w-36 rounded-xl px-3" : "mt-2 h-12 w-full rounded-xl px-4"} cursor-pointer border-[#d8cebd] bg-white text-[#211a22] shadow-[0_1px_2px_rgb(58_41_48/5%)] transition hover:border-[#bba989] hover:bg-[#fffdf9] focus-visible:border-[#8f2f43] focus-visible:ring-[#8f2f43]/20`}
      >
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent
        position="popper"
        align="start"
        className="min-w-[var(--radix-select-trigger-width)] rounded-xl border-[#d8cebd] bg-[#fffdf9] p-1.5 shadow-[0_18px_50px_rgb(37_25_35/16%)]"
      >
        {options.map((option) => (
          <SelectItem
            key={option.value}
            value={option.value}
            className="cursor-pointer rounded-lg px-3 py-2.5 pr-9 text-[#211a22] focus:bg-[#efe4d8] focus:text-[#6f2436] data-[state=checked]:font-semibold"
          >
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
