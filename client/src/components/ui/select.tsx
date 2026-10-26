import { ChevronDown } from "lucide-react";
import { forwardRef, type SelectHTMLAttributes } from "react";

import { cn } from "@/lib/utils";

export type SelectProps = SelectHTMLAttributes<HTMLSelectElement>;

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, children, ...props }, ref) => (
    <div className="relative">
      <select
        ref={ref}
        className={cn(
          "h-11 w-full appearance-none rounded-[var(--radius-control)] border border-line-strong bg-surface py-0 pr-10 pl-3.5 text-[0.95rem] text-ink transition-colors",
          "hover:border-ink/25 focus:border-cobalt focus:outline-none focus:ring-4 focus:ring-cobalt/10",
          "aria-[invalid=true]:border-danger aria-[invalid=true]:ring-danger/10",
          "disabled:cursor-not-allowed disabled:bg-paper-deep disabled:text-muted",
          className,
        )}
        {...props}
      >
        {children}
      </select>
      <ChevronDown
        className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-muted"
        aria-hidden="true"
      />
    </div>
  ),
);
Select.displayName = "Select";
