'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { CreditCardIcon, CheckmarkCircle01Icon, AlertCircleIcon, Loading03Icon } from 'hugeicons-react';

interface PayoutSetupCardProps {
  status: 'NOT_STARTED' | 'PENDING' | 'COMPLETE' | 'RESTRICTED' | null;
  payoutsEnabled: boolean;
  chargesEnabled?: boolean;
}

export function PayoutSetupCard({ status, payoutsEnabled }: PayoutSetupCardProps) {
  const [isLoading, setIsLoading] = useState(false);

  const handleSetup = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/hosts/stripe/connect', { method: 'POST' });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        alert('Failed to start onboarding');
      }
    } catch (error) {
      console.error(error);
      alert('Error connecting to Stripe');
    } finally {
      setIsLoading(false);
    }
  };

  if (status === 'COMPLETE' && payoutsEnabled) {
    return (
      <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-xl p-4 mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-green-100 dark:bg-green-800 rounded-full">
            <CheckmarkCircle01Icon className="w-5 h-5 text-green-600 dark:text-green-400" />
          </div>
          <div>
            <h3 className="font-semibold text-green-900 dark:text-green-100">Payouts Active</h3>
            <p className="text-sm text-green-700 dark:text-green-300">Your account is ready to receive funds.</p>
          </div>
        </div>
        <Button 
          variant="outline" 
          size="sm" 
          className="border-green-200 !text-green-700 hover:bg-green-100 bg-white"
          onClick={handleSetup} // Re-auth link
        >
          Manage Settings
        </Button>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-zinc-900 border border-orange-200 dark:border-zinc-800 rounded-xl p-6 mb-6 shadow-sm">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-start gap-4">
          <div className="p-3 bg-orange-100 dark:bg-orange-900/30 rounded-full shrink-0">
            <CreditCardIcon className="w-6 h-6 text-[var(--princeton-orange)]" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-[var(--foreground)]">Set up Payouts</h3>
            <p className="text-[var(--muted-foreground)]">
              {status === 'RESTRICTED' 
                ? 'Your account requires attention. Please update your details to continue receiving payouts.'
                : 'Connect your bank account to receive earnings from your experiences.'}
            </p>
          </div>
        </div>
        <Button 
          onClick={handleSetup} 
          disabled={isLoading}
          className="bg-[var(--princeton-orange)] hover:bg-[#E04F2E] text-white shrink-0 min-w-[140px]"
        >
          {isLoading ? (
            <Loading03Icon className="w-4 h-4 animate-spin" />
          ) : (
            status === 'NOT_STARTED' ? 'Connect Stripe' : 'Continue Setup'
          )}
        </Button>
      </div>
      {status === 'PENDING' && (
         <div className="mt-4 pt-4 border-t border-[var(--border)] flex items-center gap-2 text-sm text-[var(--muted-foreground)]">
            <AlertCircleIcon className="w-4 h-4" />
            <span>Verification in progress. You can continue setting up, but payouts may be paused until verified.</span>
         </div>
      )}
    </div>
  );
}
