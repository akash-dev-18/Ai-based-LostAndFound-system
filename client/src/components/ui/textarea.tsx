import { forwardRef, type TextareaHTMLAttributes } from "react";

import { cn } from "@/lib/utils";

export type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement>;

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, ...props }, ref) => (
    <textarea
      ref={ref}
      className={cn(
        "min-h-28 w-full resize-y rounded-[var(--radius-control)] border border-line-strong bg-surface px-3.5 py-3 text-[0.95rem] leading-6 text-ink placeholder:text-muted-soft transition-colors",
        "hover:border-ink/25 focus:border-cobalt focus:outline-none focus:ring-4 focus:ring-cobalt/10",
        "aria-[invalid=true]:border-danger aria-[invalid=true]:ring-danger/10",
        "disabled:cursor-not-allowed disabled:bg-paper-deep disabled:text-muted",
        className,
      )}
      {...props}
    />
  ),
);
Textarea.displayName = "Textarea";
