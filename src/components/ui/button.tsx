import { cn } from '@/lib/utils';
import { ButtonHTMLAttributes, forwardRef } from 'react';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'destructive';
  size?: 'sm' | 'md' | 'lg';
  isLoading?: boolean;
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant = 'primary',
      size = 'md',
      isLoading = false,
      disabled,
      children,
      ...props
    },
    ref
  ) => {
    const baseStyles = `
      inline-flex items-center justify-center gap-2
      font-medium rounded-lg transition-all duration-200
      focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2
      disabled:opacity-50 disabled:cursor-not-allowed
      active:scale-[0.98]
    `;

    const variants = {
      primary: `
        bg-[var(--primary)] text-[var(--primary-foreground)]
        hover:bg-[var(--princeton-dark)]
        focus-visible:ring-[var(--ring)]
        shadow-md hover:shadow-lg
      `,
      secondary: `
        bg-[var(--secondary)] text-[var(--secondary-foreground)]
        hover:bg-[var(--blue-green-dark)]
        focus-visible:ring-[var(--secondary)]
        shadow-md hover:shadow-lg
      `,
      outline: `
        border-2 border-[var(--primary)] text-[var(--primary)]
        hover:bg-[var(--primary)] hover:text-[var(--primary-foreground)]
        focus-visible:ring-[var(--ring)]
      `,
      ghost: `
        text-[var(--foreground)]
        hover:bg-[var(--muted)]/20
        focus-visible:ring-[var(--ring)]
      `,
      destructive: `
        bg-[var(--destructive)] text-[var(--destructive-foreground)]
        hover:bg-red-700
        focus-visible:ring-[var(--destructive)]
        shadow-md hover:shadow-lg
      `,
    };

    const sizes = {
      sm: 'px-3 py-1.5 text-sm',
      md: 'px-5 py-2.5 text-base',
      lg: 'px-7 py-3.5 text-lg',
    };

    return (
      <button
        ref={ref}
        className={cn(baseStyles, variants[variant], sizes[size], className)}
        disabled={disabled || isLoading}
        {...props}
      >
        {isLoading && (
          <svg
            className="animate-spin h-4 w-4"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            />
          </svg>
        )}
        {children}
      </button>
    );
  }
);

Button.displayName = 'Button';

export { Button };
