import React from 'react';
import { cn } from '../../lib/utils';

const Input = React.forwardRef(({ className, type, ...props }, ref) => {
  return (
    <input
      type={type}
      className={cn(
        "flex h-10 w-full rounded-md border border-[color:var(--dq-border-subtle)] bg-[color:var(--dq-surface)] px-3 py-2 text-sm text-[color:var(--dq-text-primary)] placeholder:text-[color:var(--dq-text-tertiary)] focus:outline-none focus:ring-2 focus:ring-[color:var(--dq-accent-primary)] focus:border-transparent disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      ref={ref}
      {...props}
    />
  );
});
Input.displayName = "Input";

const Textarea = React.forwardRef(({ className, ...props }, ref) => {
  return (
    <textarea
      className={cn(
        "flex min-h-[80px] w-full rounded-md border border-[color:var(--dq-border-subtle)] bg-[color:var(--dq-surface)] px-3 py-2 text-sm text-[color:var(--dq-text-primary)] placeholder:text-[color:var(--dq-text-tertiary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--dq-accent-primary)] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      ref={ref}
      {...props}
    />
  );
});
Textarea.displayName = "Textarea";

const Label = React.forwardRef(({ className, ...props }, ref) => (
  <label
    ref={ref}
    className={cn(
      "text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70",
      className
    )}
    {...props}
  />
));
Label.displayName = "Label";

export { Input, Textarea, Label };
