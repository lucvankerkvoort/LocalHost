'use client';

import { signIn, signOut, useSession } from 'next-auth/react';
import { Button } from '@/components/ui';

interface AuthButtonProps {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  showSignOut?: boolean;
}

export function AuthButton({ 
  variant = 'primary', 
  size = 'sm',
  showSignOut = true 
}: AuthButtonProps) {
  const { data: session, status } = useSession();

  if (status === 'loading') {
    return (
      <Button variant="ghost" size={size} disabled>
        <span className="animate-pulse">Loading...</span>
      </Button>
    );
  }

  if (session?.user) {
    if (!showSignOut) return null;
    
    return (
      <Button 
        variant="ghost" 
        size={size}
        onClick={() => signOut({ callbackUrl: '/' })}
      >
        Sign out
      </Button>
    );
  }

  return (
    <Button 
      variant={variant} 
      size={size}
      onClick={() => signIn(undefined, { callbackUrl: '/' })}
    >
      Sign up
    </Button>
  );
}

export function SignInButton({ 
  variant = 'ghost', 
  size = 'sm' 
}: Omit<AuthButtonProps, 'showSignOut'>) {
  const { data: session } = useSession();

  if (session?.user) return null;

  return (
    <Button 
      variant={variant} 
      size={size}
      onClick={() => signIn(undefined, { callbackUrl: '/' })}
    >
      Log in
    </Button>
  );
}
