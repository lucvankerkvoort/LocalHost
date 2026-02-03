import assert from 'node:assert/strict';
import test from 'node:test';


type BookingLike = {
  id: string;
  payoutStatus: string;
  paymentStatus: string;
  hostNetAmount: number;
  currency: string;
  experience: {
    host: {
      stripeConnectedAccountId: string | null;
    };
  };
};

type PrismaLike = {
  booking: {
    findUnique: (args: unknown) => Promise<BookingLike | null>;
    update: (args: unknown) => Promise<unknown>;
  };
  paymentEvent: {
    create: (args: unknown) => Promise<unknown>;
  };
};

const globalForPrisma = globalThis as { prisma?: PrismaLike };
if (!globalForPrisma.prisma) {
  globalForPrisma.prisma = {
    booking: {
      findUnique: async () => null,
      update: async () => ({}),
    },
    paymentEvent: {
      create: async () => ({}),
    },
  };
}
const prismaMock = globalForPrisma.prisma;

let cachedPayoutsModule: (Awaited<typeof import('./payouts')>) | null = null;
let cachedStripeModule: (Awaited<typeof import('./stripe')>) | null = null;

async function getPayoutsModule() {
  if (!cachedPayoutsModule) {
    cachedPayoutsModule = await import('./payouts');
  }
  return cachedPayoutsModule;
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
    payoutStatus: 'PENDING',
    paymentStatus: 'PAID',
    hostNetAmount: 13500,
    currency: 'USD',
    experience: {
      host: {
        stripeConnectedAccountId: 'acct_123',
      },
    },
    ...overrides,
  };
}

test(
  'releasePayout creates transfer, updates booking, and records event',
  { concurrency: false },
  async () => {
    const { releasePayout } = await getPayoutsModule();
    const { stripe } = await getStripeModule();

    prismaMock.booking.findUnique = async () => makeBooking();
    let bookingUpdateCalled = false;
    prismaMock.booking.update = async () => {
      bookingUpdateCalled = true;
      return {};
    };
    let paymentEventCalled = false;
    prismaMock.paymentEvent.create = async () => {
      paymentEventCalled = true;
      return {};
    };

    const transfersProto = Object.getPrototypeOf(stripe.transfers) as {
      create: (params: unknown) => Promise<{ id: string }>;
    };
    const originalTransferCreate = transfersProto.create;
    transfersProto.create = async () => ({ id: 'tr_123' });

    try {
      const transfer = await releasePayout('booking-1');
      assert.equal(transfer.id, 'tr_123');
      assert.equal(bookingUpdateCalled, true);
      assert.equal(paymentEventCalled, true);
    } finally {
      transfersProto.create = originalTransferCreate;
    }
  }
);

test('releasePayout throws for ineligible booking payment status', async () => {
  const { releasePayout } = await getPayoutsModule();
  prismaMock.booking.findUnique = async () => makeBooking({ paymentStatus: 'PENDING' });

  await assert.rejects(() => releasePayout('booking-1'), /Booking not paid/);
});
