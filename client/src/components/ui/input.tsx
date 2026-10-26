import { forwardRef, type InputHTMLAttributes } from "react";

import { cn } from "@/lib/utils";

export type InputProps = InputHTMLAttributes<HTMLInputElement>;

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, type = "text", ...props }, ref) => (
    <input
      ref={ref}
      type={type}
      className={cn(
        "h-11 w-full rounded-[var(--radius-control)] border border-line-strong bg-surface px-3.5 text-[0.95rem] text-ink placeholder:text-muted-soft transition-colors",
        "hover:border-ink/25 focus:border-cobalt focus:outline-none focus:ring-4 focus:ring-cobalt/10",
        "aria-[invalid=true]:border-danger aria-[invalid=true]:ring-danger/10",
        "disabled:cursor-not-allowed disabled:bg-paper-deep disabled:text-muted",
        className,
      )}
      {...props}
    />
  ),
);
Input.displayName = "Input";
