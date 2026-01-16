import { cn } from '@/lib/utils';
import { HTMLAttributes, forwardRef } from 'react';

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'elevated' | 'outlined';
  hoverable?: boolean;
}

const Card = forwardRef<HTMLDivElement, CardProps>(
  ({ className, variant = 'default', hoverable = false, children, ...props }, ref) => {
    const baseStyles = `
      rounded-xl overflow-hidden
      bg-[var(--card)] text-[var(--card-foreground)]
    `;

    const variants = {
      default: 'shadow-md',
      elevated: 'shadow-xl',
      outlined: 'border border-[var(--border)]',
    };

    const hoverStyles = hoverable
      ? 'transition-all duration-300 hover:shadow-xl hover:-translate-y-1 cursor-pointer'
      : '';

    return (
      <div
        ref={ref}
        className={cn(baseStyles, variants[variant], hoverStyles, className)}
        {...props}
      >
        {children}
      </div>
    );
  }
);

Card.displayName = 'Card';

// Card Header
interface CardHeaderProps extends HTMLAttributes<HTMLDivElement> {}

const CardHeader = forwardRef<HTMLDivElement, CardHeaderProps>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('p-6', className)} {...props} />
  )
);
CardHeader.displayName = 'CardHeader';

// Card Content
interface CardContentProps extends HTMLAttributes<HTMLDivElement> {}

const CardContent = forwardRef<HTMLDivElement, CardContentProps>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('px-6 pb-6', className)} {...props} />
  )
);
CardContent.displayName = 'CardContent';

// Card Image
interface CardImageProps extends HTMLAttributes<HTMLDivElement> {
  src: string;
  alt: string;
  aspectRatio?: 'video' | 'square' | 'wide';
}

const CardImage = forwardRef<HTMLDivElement, CardImageProps>(
  ({ className, src, alt, aspectRatio = 'video', ...props }, ref) => {
    const aspectRatios = {
      video: 'aspect-video',
      square: 'aspect-square',
      wide: 'aspect-[21/9]',
    };

    return (
      <div
        ref={ref}
        className={cn('relative overflow-hidden', aspectRatios[aspectRatio], className)}
        {...props}
      >
        <img
          src={src}
          alt={alt}
          className="object-cover w-full h-full transition-transform duration-300 hover:scale-105"
        />
      </div>
    );
  }
);
CardImage.displayName = 'CardImage';

// Card Footer
interface CardFooterProps extends HTMLAttributes<HTMLDivElement> {}

const CardFooter = forwardRef<HTMLDivElement, CardFooterProps>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn('px-6 py-4 border-t border-[var(--border)]', className)}
      {...props}
    />
  )
);
CardFooter.displayName = 'CardFooter';

export { Card, CardHeader, CardContent, CardImage, CardFooter };
