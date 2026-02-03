import assert from 'node:assert/strict';
import test from 'node:test';


type BookingLike = {
  id: string;
  guestId: string;
  status: string;
  amountSubtotal: number;
  currency: string;
  experience: {
    host: {
      id: string;
      stripeConnectedAccountId: string | null;
      chargesEnabled: boolean;
    };
  };
  guest: {
    id: string;
  };
};

type BookingModel = {
  findUnique: (args: unknown) => Promise<BookingLike | null>;
  update: (args: unknown) => Promise<unknown>;
};

type PrismaLike = {
  booking: BookingModel;
};

const globalForPrisma = globalThis as { prisma?: PrismaLike };
if (!globalForPrisma.prisma) {
  globalForPrisma.prisma = {
    booking: {
      findUnique: async () => null,
      update: async () => ({}),
    },
  };
}
const prismaMock = globalForPrisma.prisma;

let cachedModule: (Awaited<typeof import('./payments')>) | null = null;
let cachedStripeModule: (Awaited<typeof import('./stripe')>) | null = null;

async function getPaymentsModule() {
  if (!cachedModule) {
    cachedModule = await import('./payments');
  }
  return cachedModule;
}

async function getStripeModule() {
  if (!cachedStripeModule) {
    cachedStripeModule = await import('./stripe');
  }
  return cachedStripeModule;
}

function makeBooking(overrides: Partial<BookingLike> = {}): BookingLike {
  return {
    id: 'booking-1',
    guestId: 'guest-1',
    status: 'TENTATIVE',
    amountSubtotal: 15000,
    currency: 'usd',
    experience: {
      host: {
        id: 'host-1',
        stripeConnectedAccountId: 'acct_123',
        chargesEnabled: true,
      },
    },
    guest: { id: 'guest-1' },
    ...overrides,
  };
}

test(
  'createBookingPayment creates intent and returns payment payload',
  { concurrency: false },
  async () => {
    const { createBookingPayment } = await getPaymentsModule();
    const { stripe, PAYMENT_CONFIG } = await getStripeModule();

    const updateCalls: unknown[] = [];
    prismaMock.booking.findUnique = async () => makeBooking();
    prismaMock.booking.update = async (args) => {
      updateCalls.push(args);
      return {};
    };

    const paymentIntentsProto = Object.getPrototypeOf(stripe.paymentIntents) as {
      create: (params: unknown) => Promise<{ id: string; client_secret: string }>;
    };
    const originalCreate = paymentIntentsProto.create;
    paymentIntentsProto.create = async () => ({
      id: 'pi_123',
      client_secret: 'secret_123',
    });

    try {
      const result = await createBookingPayment('booking-1', 'guest-1');
      assert.equal(result.clientSecret, 'secret_123');
      assert.equal(result.amount, 15000);
      assert.equal(result.currency, PAYMENT_CONFIG.CURRENCY);
      assert.equal(updateCalls.length, 2);
    } finally {
      paymentIntentsProto.create = originalCreate;
    }
  }
);

test('createBookingPayment throws when booking not found', async () => {
  const { createBookingPayment } = await getPaymentsModule();
  prismaMock.booking.findUnique = async () => null;

  await assert.rejects(
    () => createBookingPayment('missing', 'guest-1'),
    /Booking not found/
  );
});

test('createBookingPayment throws when booking belongs to another user', async () => {
  const { createBookingPayment } = await getPaymentsModule();
  prismaMock.booking.findUnique = async () => makeBooking({ guestId: 'other-guest' });

  await assert.rejects(
    () => createBookingPayment('booking-1', 'guest-1'),
    /Booking does not belong to this user/
  );
});

test('createBookingPayment throws when booking is not tentative', async () => {
  const { createBookingPayment } = await getPaymentsModule();
  prismaMock.booking.findUnique = async () => makeBooking({ status: 'CONFIRMED' });

  await assert.rejects(
    () => createBookingPayment('booking-1', 'guest-1'),
    /Booking is not in TENTATIVE status/
  );
});

test('createBookingPayment throws when host is not onboarded', async () => {
  const { createBookingPayment } = await getPaymentsModule();
  prismaMock.booking.findUnique = async () =>
    makeBooking({
      experience: {
        host: {
          id: 'host-1',
          stripeConnectedAccountId: null,
          chargesEnabled: true,
        },
      },
    });

  await assert.rejects(
    () => createBookingPayment('booking-1', 'guest-1'),
    /Host not onboarded for payments/
  );
});

test('createBookingPayment throws when host charges are disabled', async () => {
  const { createBookingPayment } = await getPaymentsModule();
  prismaMock.booking.findUnique = async () =>
    makeBooking({
      experience: {
        host: {
          id: 'host-1',
          stripeConnectedAccountId: 'acct_123',
          chargesEnabled: false,
        },
      },
    });

  await assert.rejects(
    () => createBookingPayment('booking-1', 'guest-1'),
    /Host Stripe account is not fully onboarded/
  );
});

test('createBookingPayment throws when amount subtotal is invalid', async () => {
  const { createBookingPayment } = await getPaymentsModule();
  prismaMock.booking.findUnique = async () => makeBooking({ amountSubtotal: 0 });

  await assert.rejects(
    () => createBookingPayment('booking-1', 'guest-1'),
    /Invalid booking amount/
  );
});

test(
  'createBookingPayment calculates platform fee and host net amount',
  { concurrency: false },
  async () => {
    const { createBookingPayment } = await getPaymentsModule();
    const { stripe } = await getStripeModule();

    const updateCalls: Array<{ data?: Record<string, unknown> }> = [];
    prismaMock.booking.findUnique = async () => makeBooking({ amountSubtotal: 15000 });
    prismaMock.booking.update = async (args) => {
      updateCalls.push(args as { data?: Record<string, unknown> });
      return {};
    };

    const paymentIntentsProto = Object.getPrototypeOf(stripe.paymentIntents) as {
      create: (params: unknown) => Promise<{ id: string; client_secret: string }>;
    };
    const originalCreate = paymentIntentsProto.create;
    paymentIntentsProto.create = async () => ({
      id: 'pi_456',
      client_secret: 'secret_456',
    });

    try {
      await createBookingPayment('booking-1', 'guest-1');
      assert.equal(updateCalls[0].data?.platformFee, 1500);
      assert.equal(updateCalls[0].data?.hostNetAmount, 13500);
    } finally {
      paymentIntentsProto.create = originalCreate;
    }
  }
);

test(
  'createBookingPayment sends booking metadata to Stripe',
  { concurrency: false },
  async () => {
    const { createBookingPayment } = await getPaymentsModule();
    const { stripe } = await getStripeModule();

    prismaMock.booking.findUnique = async () => makeBooking({ id: 'booking-meta' });
    prismaMock.booking.update = async () => ({});

    let stripeArgs: Record<string, unknown> | null = null;
    const paymentIntentsProto = Object.getPrototypeOf(stripe.paymentIntents) as {
      create: (params: unknown) => Promise<{ id: string; client_secret: string }>;
    };
    const originalCreate = paymentIntentsProto.create;
    paymentIntentsProto.create = async (args: unknown) => {
      stripeArgs = args as Record<string, unknown>;
      return { id: 'pi_meta', client_secret: 'secret_meta' };
    };

    try {
      await createBookingPayment('booking-meta', 'guest-1');
      const metadata = stripeArgs?.['metadata'] as Record<string, unknown> | undefined;
      assert.equal(metadata?.['bookingId'], 'booking-meta');
      assert.equal(metadata?.['hostId'], 'host-1');
      assert.equal(metadata?.['guestId'], 'guest-1');
      assert.equal(stripeArgs?.['transfer_group'], 'booking-meta');
    } finally {
      paymentIntentsProto.create = originalCreate;
    }
  }
);

test(
  'createBookingPayment stores stripePaymentId on booking',
  { concurrency: false },
  async () => {
    const { createBookingPayment } = await getPaymentsModule();
    const { stripe } = await getStripeModule();

    const updateCalls: Array<{ data?: Record<string, unknown> }> = [];
    prismaMock.booking.findUnique = async () => makeBooking();
    prismaMock.booking.update = async (args) => {
      updateCalls.push(args as { data?: Record<string, unknown> });
      return {};
    };

    const paymentIntentsProto = Object.getPrototypeOf(stripe.paymentIntents) as {
      create: (params: unknown) => Promise<{ id: string; client_secret: string }>;
    };
    const originalCreate = paymentIntentsProto.create;
    paymentIntentsProto.create = async () => ({
      id: 'pi_store',
      client_secret: 'secret_store',
    });

    try {
      await createBookingPayment('booking-1', 'guest-1');
      assert.equal(updateCalls[1].data?.stripePaymentId, 'pi_store');
    } finally {
      paymentIntentsProto.create = originalCreate;
    }
  }
);
