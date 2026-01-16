'use client';

import { useState } from 'react';
import { Button } from '@/components/ui';
import { formatPrice } from '@/lib/utils';

interface PaymentFormProps {
  totalAmount: number;
  currency: string;
  onSubmit: () => Promise<void>;
  onCancel: () => void;
}

export function PaymentForm({ totalAmount, currency, onSubmit, onCancel }: PaymentFormProps) {
  const [cardNumber, setCardNumber] = useState('');
  const [expiry, setExpiry] = useState('');
  const [cvc, setCvc] = useState('');
  const [name, setName] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Format card number with spaces
  const formatCardNumber = (value: string) => {
    const v = value.replace(/\s+/g, '').replace(/[^0-9]/gi, '');
    const matches = v.match(/\d{4,16}/g);
    const match = (matches && matches[0]) || '';
    const parts = [];

    for (let i = 0, len = match.length; i < len; i += 4) {
      parts.push(match.substring(i, i + 4));
    }

    if (parts.length) {
      return parts.join(' ');
    } else {
      return v;
    }
  };

  // Format expiry as MM/YY
  const formatExpiry = (value: string) => {
    const v = value.replace(/\s+/g, '').replace(/[^0-9]/gi, '');
    if (v.length >= 2) {
      return v.substring(0, 2) + '/' + v.substring(2, 4);
    }
    return v;
  };

  const validateForm = () => {
    const newErrors: Record<string, string> = {};

    if (!name.trim()) {
      newErrors.name = 'Name is required';
    }

    if (cardNumber.replace(/\s/g, '').length !== 16) {
      newErrors.cardNumber = 'Card number must be 16 digits';
    }

    if (expiry.length !== 5) {
      newErrors.expiry = 'Expiry must be MM/YY';
    }

    if (cvc.length < 3) {
      newErrors.cvc = 'CVC must be 3-4 digits';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) return;

    setIsProcessing(true);
    try {
      // Simulate payment processing
      await new Promise((resolve) => setTimeout(resolve, 2000));
      await onSubmit();
    } catch (error) {
      setErrors({ form: 'Payment failed. Please try again.' });
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="bg-white rounded-xl shadow-lg border border-[var(--border)] p-6">
      <h2 className="text-xl font-semibold text-[var(--foreground)] mb-6">
        Payment Details
      </h2>

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Card Number */}
        <div>
          <label className="block text-sm font-medium text-[var(--foreground)] mb-2">
            Card Number
          </label>
          <div className="relative">
            <input
              type="text"
              value={cardNumber}
              onChange={(e) => setCardNumber(formatCardNumber(e.target.value))}
              placeholder="1234 5678 9012 3456"
              maxLength={19}
              className={`w-full px-4 py-3 rounded-lg border ${
                errors.cardNumber ? 'border-red-500' : 'border-[var(--border)]'
              } focus:outline-none focus:ring-2 focus:ring-[var(--sunset-orange)] transition-colors`}
            />
            <div className="absolute right-3 top-1/2 -translate-y-1/2 flex gap-1">
              <svg className="h-8 w-8 text-[#1A1F71]" viewBox="0 0 48 48" fill="currentColor">
                <path d="M44 12H4a2 2 0 00-2 2v20a2 2 0 002 2h40a2 2 0 002-2V14a2 2 0 00-2-2z" fill="#1565C0"/>
                <path d="M20 32l2-14h3l-2 14h-3zm14-14l-3 9-1-9h-3l2 14h3l5-14h-3zm-18 0l-3 14h3l.5-3h3l.5 3h3l-3-14h-4zm2 8l1-5 1 5h-2z" fill="#FFF"/>
              </svg>
              <svg className="h-8 w-8" viewBox="0 0 48 48">
                <circle cx="19" cy="24" r="10" fill="#EB001B"/>
                <circle cx="29" cy="24" r="10" fill="#F79E1B"/>
                <path d="M24 17a10 10 0 000 14 10 10 0 000-14z" fill="#FF5F00"/>
              </svg>
            </div>
          </div>
          {errors.cardNumber && (
            <p className="text-red-500 text-sm mt-1">{errors.cardNumber}</p>
          )}
        </div>

        {/* Expiry and CVC */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-[var(--foreground)] mb-2">
              Expiry Date
            </label>
            <input
              type="text"
              value={expiry}
              onChange={(e) => setExpiry(formatExpiry(e.target.value))}
              placeholder="MM/YY"
              maxLength={5}
              className={`w-full px-4 py-3 rounded-lg border ${
                errors.expiry ? 'border-red-500' : 'border-[var(--border)]'
              } focus:outline-none focus:ring-2 focus:ring-[var(--sunset-orange)] transition-colors`}
            />
            {errors.expiry && (
              <p className="text-red-500 text-sm mt-1">{errors.expiry}</p>
            )}
          </div>
          <div>
            <label className="block text-sm font-medium text-[var(--foreground)] mb-2">
              CVC
            </label>
            <input
              type="text"
              value={cvc}
              onChange={(e) => setCvc(e.target.value.replace(/\D/g, '').slice(0, 4))}
              placeholder="123"
              maxLength={4}
              className={`w-full px-4 py-3 rounded-lg border ${
                errors.cvc ? 'border-red-500' : 'border-[var(--border)]'
              } focus:outline-none focus:ring-2 focus:ring-[var(--sunset-orange)] transition-colors`}
            />
            {errors.cvc && (
              <p className="text-red-500 text-sm mt-1">{errors.cvc}</p>
            )}
          </div>
        </div>

        {/* Cardholder Name */}
        <div>
          <label className="block text-sm font-medium text-[var(--foreground)] mb-2">
            Cardholder Name
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="John Doe"
            className={`w-full px-4 py-3 rounded-lg border ${
              errors.name ? 'border-red-500' : 'border-[var(--border)]'
            } focus:outline-none focus:ring-2 focus:ring-[var(--sunset-orange)] transition-colors`}
          />
          {errors.name && (
            <p className="text-red-500 text-sm mt-1">{errors.name}</p>
          )}
        </div>

        {/* Form Error */}
        {errors.form && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-red-600 text-sm">{errors.form}</p>
          </div>
        )}

        {/* Security Notice */}
        <div className="flex items-center gap-2 text-sm text-[var(--muted-foreground)]">
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
          </svg>
          <span>Your payment info is secure and encrypted</span>
        </div>

        {/* Buttons */}
        <div className="flex gap-3 pt-4">
          <Button
            type="button"
            variant="outline"
            className="flex-1"
            onClick={onCancel}
            disabled={isProcessing}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            variant="primary"
            className="flex-1"
            isLoading={isProcessing}
            disabled={isProcessing}
          >
            Pay {formatPrice(totalAmount, currency)}
          </Button>
        </div>
      </form>
    </div>
  );
}
