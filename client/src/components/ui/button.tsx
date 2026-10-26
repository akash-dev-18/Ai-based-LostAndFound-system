import { cva, type VariantProps } from "class-variance-authority";
import { LoaderCircle } from "lucide-react";
import type { ButtonHTMLAttributes, ReactNode } from "react";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 rounded-[var(--radius-control)] border font-medium transition-[background-color,border-color,color,box-shadow,transform] duration-150 disabled:pointer-events-none disabled:opacity-50 active:translate-y-px",
  {
    variants: {
      variant: {
        primary:
          "border-cobalt bg-cobalt text-white shadow-[0_1px_2px_rgb(36_87_245/0.25)] hover:border-cobalt-deep hover:bg-cobalt-deep",
        secondary: "border-line-strong bg-surface text-ink hover:border-ink/30 hover:bg-paper-deep",
        ghost: "border-transparent bg-transparent text-ink hover:bg-paper-deep",
        quiet: "border-transparent bg-cobalt-soft text-cobalt-deep hover:bg-[#dce5ff]",
        danger: "border-danger bg-danger text-white hover:bg-[#921c12]",
        "danger-soft":
          "border-danger/20 bg-danger-soft text-danger hover:border-danger/40 hover:bg-[#fbdad7]",
        link: "border-transparent bg-transparent p-0 text-cobalt underline-offset-4 hover:underline",
      },
      size: {
        sm: "h-9 px-3 text-sm",
        md: "h-11 px-4 text-sm",
        lg: "h-12 px-5 text-[0.95rem]",
        icon: "size-10 p-0",
        "icon-sm": "size-8 p-0",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "md",
    },
  },
);

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof buttonVariants> & {
    isLoading?: boolean;
    leftIcon?: ReactNode;
    rightIcon?: ReactNode;
  };

export function Button({
  className,
  variant,
  size,
  isLoading,
  leftIcon,
  rightIcon,
  children,
  disabled,
  type = "button",
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(buttonVariants({ variant, size }), className)}
      disabled={disabled || isLoading}
      {...props}
    >
      {isLoading ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : leftIcon}
      {children}
      {!isLoading && rightIcon}
    </button>
  );
}

export { buttonVariants };
