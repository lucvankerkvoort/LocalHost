'use client';

import { useState } from 'react';
import { useStripe, useElements, PaymentElement } from '@stripe/react-stripe-js';
import { Button } from '@/components/ui/button';
import { Loading03Icon } from 'hugeicons-react';

interface CheckoutFormProps {
  amount: number;
  currency: string;
  onSuccess: () => void;
  onCancel: () => void;
}

export function CheckoutForm({ amount, currency, onSuccess, onCancel }: CheckoutFormProps) {
  const stripe = useStripe();
  const elements = useElements();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!stripe || !elements) {
      return;
    }

    setIsProcessing(true);

    const { error } = await stripe.confirmPayment({
      elements,
      confirmParams: {
        return_url: `${window.location.origin}/trips`, // Redirect to trips page
      },
      redirect: 'if_required',
    });

    if (error) {
      setErrorMessage(error.message ?? 'Payment failed');
      setIsProcessing(false);
    } else {
      // Payment succeeded!
      onSuccess();
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <PaymentElement />
      
      {errorMessage && (
        <div className="text-sm text-red-500 bg-red-50 p-3 rounded-md">
          {errorMessage}
        </div>
      )}

      <div className="flex gap-3 pt-4">
        <Button
          type="button"
          variant="outline"
          className="w-full"
          onClick={onCancel}
          disabled={isProcessing}
        >
          Cancel
        </Button>
        <Button
          type="submit"
          className="w-full bg-[var(--princeton-orange)] hover:bg-[#E04F2E] text-white"
          disabled={!stripe || isProcessing}
        >
          {isProcessing ? (
            <Loading03Icon className="w-4 h-4 animate-spin mr-2" />
          ) : (
            `Pay ${new Intl.NumberFormat('en-US', { style: 'currency', currency: currency }).format(amount / 100)}`
          )}
        </Button>
      </div>
      
      <p className="text-xs text-center text-gray-500 dark:text-gray-400">
        Funds will be held securely until the experience is completed.
      </p>
    </form>
  );
}
