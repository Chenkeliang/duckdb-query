import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        // Primary actions use inverted ink; orange is reserved for Run (variant="run").
        default: "bg-foreground text-background hover:opacity-90",
        run: "bg-primary text-primary-foreground font-semibold hover:brightness-105",
        destructive: "bg-error text-error-foreground hover:opacity-90",
        outline:
          "border border-border bg-background text-foreground hover:border-border-strong hover:bg-surface-hover",
        secondary: "border border-border bg-muted text-foreground hover:bg-surface-hover",
        subtle:
          "border border-border-subtle bg-transparent text-muted-foreground hover:border-border hover:bg-surface-hover hover:text-foreground aria-pressed:bg-surface-active aria-pressed:text-foreground data-[state=open]:bg-surface-active data-[state=open]:text-foreground",
        quiet:
          "text-muted-foreground hover:text-foreground aria-pressed:bg-surface-active aria-pressed:text-foreground data-[state=open]:bg-surface-active data-[state=open]:text-foreground",
        ghost: "text-foreground hover:bg-surface-hover",
        link: "text-foreground underline underline-offset-4 hover:opacity-80",
      },
      size: {
        default: "h-8 px-3",
        sm: "h-7 rounded-md px-2.5 text-xs",
        lg: "h-9 rounded-md px-4",
        icon: "h-8 w-8",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";

export { Button, buttonVariants };
