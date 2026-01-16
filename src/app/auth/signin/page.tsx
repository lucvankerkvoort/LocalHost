'use client';

import { signIn } from 'next-auth/react';
import { useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui';

export default function SignInPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const handleCredentialsSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    try {
      const result = await signIn('credentials', {
        email,
        password,
        redirect: false,
      });

      if (result?.error) {
        setError('Invalid email or password');
      } else {
        window.location.href = '/';
      }
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleSignIn = () => {
    signIn('google', { callbackUrl: '/' });
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-[var(--sand-beige)] via-[var(--background)] to-[var(--sunset-orange-light)]/20 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <Link href="/" className="flex items-center justify-center gap-2 mb-8">
          <span className="text-3xl">🏠</span>
          <span className="font-bold text-2xl text-[var(--foreground)]">Localhost</span>
        </Link>

        {/* Sign In Card */}
        <div className="bg-white rounded-2xl shadow-xl p-8">
          <h1 className="text-2xl font-bold text-[var(--foreground)] text-center mb-2">
            Welcome back
          </h1>
          <p className="text-[var(--muted-foreground)] text-center mb-8">
            Sign in to continue your journey
          </p>

          {/* Google Sign In */}
          <button
            onClick={handleGoogleSignIn}
            className="w-full flex items-center justify-center gap-3 px-4 py-3 border border-[var(--border)] rounded-lg hover:bg-[var(--sand-beige-light)] transition-colors mb-6"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path
                fill="#4285F4"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="#34A853"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="#FBBC05"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
              />
              <path
                fill="#EA4335"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
              />
            </svg>
            Continue with Google
          </button>

          {/* Divider */}
          <div className="relative mb-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-[var(--border)]" />
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="px-2 bg-white text-[var(--muted-foreground)]">
                or continue with email
              </span>
            </div>
          </div>

          {/* Credentials Form */}
          <form onSubmit={handleCredentialsSignIn} className="space-y-4">
            {error && (
              <div className="p-3 rounded-lg bg-red-50 text-[var(--destructive)] text-sm">
                {error}
              </div>
            )}

            <div>
              <label
                htmlFor="email"
                className="block text-sm font-medium text-[var(--foreground)] mb-1"
              >
                Email
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
                className="w-full px-4 py-2.5 rounded-lg border border-[var(--border)] focus:outline-none focus:ring-2 focus:ring-[var(--sunset-orange)] transition-colors"
              />
            </div>

            <div>
              <label
                htmlFor="password"
                className="block text-sm font-medium text-[var(--foreground)] mb-1"
              >
                Password
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                className="w-full px-4 py-2.5 rounded-lg border border-[var(--border)] focus:outline-none focus:ring-2 focus:ring-[var(--sunset-orange)] transition-colors"
              />
            </div>

            <Button
              type="submit"
              variant="primary"
              size="lg"
              isLoading={isLoading}
              className="w-full"
            >
              Sign in
            </Button>
          </form>

          {/* Demo credentials hint */}
          <div className="mt-4 p-3 rounded-lg bg-[var(--sand-beige-light)] text-sm">
            <p className="text-[var(--muted-foreground)]">
              <strong>Demo credentials:</strong><br />
              Email: demo@localhost.com<br />
              Password: demo123
            </p>
          </div>

          {/* Sign up link */}
          <p className="mt-6 text-center text-sm text-[var(--muted-foreground)]">
            Don&apos;t have an account?{' '}
            <Link
              href="/auth/signup"
              className="text-[var(--sunset-orange)] hover:underline font-medium"
            >
              Sign up
            </Link>
          </p>
        </div>

        {/* Back to home */}
        <p className="mt-6 text-center">
          <Link
            href="/"
            className="text-sm text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors"
          >
            ← Back to home
          </Link>
        </p>
      </div>
    </div>
  );
}
