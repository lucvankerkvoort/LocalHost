'use client';

import { useState } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

export default function SignInPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
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
        router.push('/');
        router.refresh();
      }
    } catch (err) {
      setError('An error occurred. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleSignIn = () => {
    setIsLoading(true);
    signIn('google', { callbackUrl: '/' });
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--background)] p-4 relative overflow-hidden">
      {/* Background Elements */}
      <div className="absolute inset-0 bg-[url('https://images.unsplash.com/photo-1469854523086-cc02fe5d8800?q=80&w=2021&auto=format&fit=crop')] bg-cover bg-center opacity-10 blur-sm" />
      <div className="absolute inset-0 bg-gradient-to-t from-[var(--background)] to-transparent" />

      <div className="w-full max-w-md bg-[var(--card)]/80 backdrop-blur-xl rounded-2xl border border-[var(--border)] shadow-2xl p-8 relative z-10 animate-in fade-in zoom-in-95 duration-500">
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-[var(--princeton-orange)]/10 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-[var(--princeton-orange)]/20">
            <span className="text-3xl">🌍</span>
          </div>
          <h1 className="text-2xl font-bold text-[var(--foreground)]">Welcome Back</h1>
          <p className="text-[var(--muted-foreground)] mt-2">
            Sign in to continue your journey
          </p>
        </div>

        {error && (
          <div className="mb-6 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-500 text-sm text-center">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-[var(--foreground)] mb-1.5">
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full px-4 py-2.5 rounded-lg bg-[var(--background)] border border-[var(--border)] 
                       focus:outline-none focus:ring-2 focus:ring-[var(--princeton-orange)]/50 focus:border-[var(--princeton-orange)]
                       transition-all placeholder:text-[var(--muted)]"
              placeholder="name@example.com"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-[var(--foreground)] mb-1.5">
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full px-4 py-2.5 rounded-lg bg-[var(--background)] border border-[var(--border)] 
                       focus:outline-none focus:ring-2 focus:ring-[var(--princeton-orange)]/50 focus:border-[var(--princeton-orange)]
                       transition-all placeholder:text-[var(--muted)]"
              placeholder="••••••••"
            />
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full py-3 rounded-lg bg-[var(--princeton-orange)] text-white font-medium
                     hover:bg-[var(--princeton-dark)] active:scale-[0.98] transition-all
                     disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-[var(--princeton-orange)]/20"
          >
            {isLoading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>

        <div className="relative my-8">
          <div className="absolute inset-0 flex items-center">
            <span className="w-full border-t border-[var(--border)]" />
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-[var(--card)] px-2 text-[var(--muted-foreground)]">
              Or continue with
            </span>
          </div>
        </div>

        <button
          type="button"
          onClick={handleGoogleSignIn}
          disabled={isLoading}
          className="w-full py-3 rounded-lg bg-[var(--background)] border border-[var(--border)] text-[var(--foreground)] font-medium
                   hover:bg-[var(--muted)]/50 active:scale-[0.98] transition-all
                   disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          <svg className="w-5 h-5" viewBox="0 0 24 24">
            <path
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              fill="#4285F4"
            />
            <path
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              fill="#34A853"
            />
            <path
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
              fill="#FBBC05"
            />
            <path
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
              fill="#EA4335"
            />
          </svg>
          Sign in with Google
        </button>

        <p className="mt-8 text-center text-sm text-[var(--muted-foreground)]">
          Don&apos;t have an account?{' '}
          <Link href="/auth/signup" className="text-[var(--princeton-orange)] hover:underline">
            Sign up
          </Link>
        </p>


      </div>
    </div>
  );
}
