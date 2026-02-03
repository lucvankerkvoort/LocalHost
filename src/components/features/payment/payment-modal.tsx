'use client';

import { useEffect, useState } from 'react';
import { Elements } from '@stripe/react-stripe-js';
import { loadStripe } from '@stripe/stripe-js';
import { CheckoutForm } from './checkout-form';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Loading03Icon } from 'hugeicons-react';

// Initialize Stripe outside of render
const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!);

interface PaymentModalProps {
  bookingId: string;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function PaymentModal({ bookingId, isOpen, onClose, onSuccess }: PaymentModalProps) {
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [amount, setAmount] = useState<number>(0);
  const [currency, setCurrency] = useState('USD');
  const [error, setError] = useState<string | null>(null);

  // Reset state when bookingId changes to prevent stale clientSecret
  useEffect(() => {
    setClientSecret(null);
    setAmount(0);
    setCurrency('USD');
    setError(null);
  }, [bookingId]);

  // Reset state when modal closes
  const handleClose = () => {
    setClientSecret(null);
    setAmount(0);
    setCurrency('USD');
    setError(null);
    onClose();
  };

  useEffect(() => {
    if (isOpen && bookingId) {
      // Create Payment Intent
      fetch(`/api/bookings/${bookingId}/pay`, { method: 'POST' })
        .then((res) => res.json())
        .then((data) => {
          if (data.error) {
            setError(data.error);
          } else {
            setClientSecret(data.clientSecret);
            setAmount(data.amount);
            setCurrency(data.currency);
          }
        })
        .catch((err) => setError('Failed to initialize payment'));
    }
  }, [isOpen, bookingId]);

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto bg-[var(--card)]">
        <DialogHeader>
          <DialogTitle>Complete Your Booking</DialogTitle>
        </DialogHeader>
        
        {error ? (
          <div className="text-red-500 p-4">{error}</div>
        ) : clientSecret ? (
          <Elements stripe={stripePromise} options={{ clientSecret, appearance: { theme: 'stripe' } }}>
            <CheckoutForm 
              amount={amount}
              currency={currency}
              onSuccess={onSuccess} 
              onCancel={onClose} 
            />
          </Elements>
        ) : (
          <div className="flex justify-center p-8">
            <Loading03Icon className="w-8 h-8 animate-spin text-[var(--primary)]" />
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
