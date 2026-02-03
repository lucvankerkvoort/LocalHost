import assert from 'node:assert/strict';
import test from 'node:test';


type UserLike = {
  id: string;
  email: string;
  stripeConnectedAccountId: string | null;
};

type PrismaLike = {
  user: {
    findUnique: (args: unknown) => Promise<UserLike | null>;
    findFirst: (args: unknown) => Promise<{ id: string } | null>;
    update: (args: unknown) => Promise<unknown>;
  };
};

const globalForPrisma = globalThis as { prisma?: PrismaLike };
if (!globalForPrisma.prisma) {
  globalForPrisma.prisma = {
    user: {
      findUnique: async () => null,
      findFirst: async () => null,
      update: async () => ({}),
    },
  };
}
const prismaMock = globalForPrisma.prisma;

let cachedConnectModule: (Awaited<typeof import('./connect')>) | null = null;
let cachedStripeModule: (Awaited<typeof import('./stripe')>) | null = null;

async function getConnectModule() {
  if (!cachedConnectModule) {
    cachedConnectModule = await import('./connect');
  }
  return cachedConnectModule;
}

async function getStripeModule() {
  if (!cachedStripeModule) {
    cachedStripeModule = await import('./stripe');
  }
  return cachedStripeModule;
}

function makeUser(overrides: Partial<UserLike> = {}): UserLike {
  return {
    id: 'user-1',
    email: 'user@example.com',
    stripeConnectedAccountId: null,
    ...overrides,
  };
}

test(
  'createConnectAccount creates a new account and stores it',
  { concurrency: false },
  async () => {
    const { createConnectAccount } = await getConnectModule();
    const { stripe } = await getStripeModule();

    prismaMock.user.findUnique = async () => makeUser();
    let updatePayload: Record<string, unknown> | null = null;
    prismaMock.user.update = async (args) => {
      updatePayload = (args as { data?: Record<string, unknown> }).data || null;
      return {};
    };

    const accountsProto = Object.getPrototypeOf(stripe.accounts) as {
      create: (params: unknown) => Promise<{ id: string }>;
    };
    const originalCreate = accountsProto.create;
    accountsProto.create = async () => ({ id: 'acct_new' });

    try {
      const accountId = await createConnectAccount('user-1');
      assert.equal(accountId, 'acct_new');
      assert.equal(updatePayload?.['stripeConnectedAccountId'], 'acct_new');
      assert.equal(updatePayload?.['stripeOnboardingStatus'], 'PENDING');
    } finally {
      accountsProto.create = originalCreate;
    }
  }
);

test(
  'createConnectAccount returns existing account without creating a new one',
  { concurrency: false },
  async () => {
    const { createConnectAccount } = await getConnectModule();
    const { stripe } = await getStripeModule();

    prismaMock.user.findUnique = async () => makeUser({ stripeConnectedAccountId: 'acct_existing' });
    prismaMock.user.update = async () => ({});

    let called = false;
    const accountsProto = Object.getPrototypeOf(stripe.accounts) as {
      create: (params: unknown) => Promise<{ id: string }>;
    };
    const originalCreate = accountsProto.create;
    accountsProto.create = async () => {
      called = true;
      return { id: 'acct_should_not_be_called' };
    };

    try {
      const accountId = await createConnectAccount('user-1');
      assert.equal(accountId, 'acct_existing');
      assert.equal(called, false);
    } finally {
      accountsProto.create = originalCreate;
    }
  }
);

test('createConnectAccount throws when user is missing', async () => {
  const { createConnectAccount } = await getConnectModule();
  prismaMock.user.findUnique = async () => null;

  await assert.rejects(() => createConnectAccount('missing'), /User not found/);
});

test(
  'createAccountLink returns onboarding URL',
  { concurrency: false },
  async () => {
    const { createAccountLink } = await getConnectModule();
    const { stripe } = await getStripeModule();

    const accountLinksProto = Object.getPrototypeOf(stripe.accountLinks) as {
      create: (params: unknown) => Promise<{ url: string }>;
    };
    const originalCreate = accountLinksProto.create;
    accountLinksProto.create = async () => ({ url: 'https://stripe.test/onboarding' });

    try {
      const url = await createAccountLink('acct_1', 'https://app.local');
      assert.equal(url, 'https://stripe.test/onboarding');
    } finally {
      accountLinksProto.create = originalCreate;
    }
  }
);

test(
  'updateAccountStatus returns COMPLETE when account is fully onboarded',
  { concurrency: false },
  async () => {
    const { updateAccountStatus } = await getConnectModule();
    const { stripe } = await getStripeModule();

    const accountsProto = Object.getPrototypeOf(stripe.accounts) as {
      retrieve: (accountId: string) => Promise<unknown>;
    };
    const originalRetrieve = accountsProto.retrieve;
    accountsProto.retrieve = async () =>
      ({
        payouts_enabled: true,
        charges_enabled: true,
        details_submitted: true,
        requirements: { disabled_reason: null },
      }) as unknown;

    prismaMock.user.findFirst = async () => ({ id: 'user-1' });
    let updatedData: Record<string, unknown> | null = null;
    prismaMock.user.update = async (args) => {
      updatedData = (args as { data?: Record<string, unknown> }).data || null;
      return {};
    };

    try {
      const result = await updateAccountStatus('acct_1');
      assert.equal(result.status, 'COMPLETE');
      assert.equal(updatedData?.['stripeOnboardingStatus'], 'COMPLETE');
      assert.equal(updatedData?.['payoutsEnabled'], true);
      assert.equal(updatedData?.['chargesEnabled'], true);
    } finally {
      accountsProto.retrieve = originalRetrieve;
    }
  }
);

test(
  'updateAccountStatus returns PENDING when account is incomplete and unrestricted',
  { concurrency: false },
  async () => {
    const { updateAccountStatus } = await getConnectModule();
    const { stripe } = await getStripeModule();

    const accountsProto = Object.getPrototypeOf(stripe.accounts) as {
      retrieve: (accountId: string) => Promise<unknown>;
    };
    const originalRetrieve = accountsProto.retrieve;
    accountsProto.retrieve = async () =>
      ({
        payouts_enabled: false,
        charges_enabled: false,
        details_submitted: false,
        requirements: { disabled_reason: null },
      }) as unknown;

    prismaMock.user.findFirst = async () => ({ id: 'user-1' });
    prismaMock.user.update = async () => ({});

    try {
      const result = await updateAccountStatus('acct_1');
      assert.equal(result.status, 'PENDING');
      assert.equal(result.payoutsEnabled, false);
      assert.equal(result.chargesEnabled, false);
    } finally {
      accountsProto.retrieve = originalRetrieve;
    }
  }
);

test(
  'updateAccountStatus returns RESTRICTED when Stripe disabled reason is present',
  { concurrency: false },
  async () => {
    const { updateAccountStatus } = await getConnectModule();
    const { stripe } = await getStripeModule();

    const accountsProto = Object.getPrototypeOf(stripe.accounts) as {
      retrieve: (accountId: string) => Promise<unknown>;
    };
    const originalRetrieve = accountsProto.retrieve;
    accountsProto.retrieve = async () =>
      ({
        payouts_enabled: false,
        charges_enabled: false,
        details_submitted: false,
        requirements: { disabled_reason: 'rejected.fraud' },
      }) as unknown;

    prismaMock.user.findFirst = async () => ({ id: 'user-1' });
    prismaMock.user.update = async () => ({});

    try {
      const result = await updateAccountStatus('acct_1');
      assert.equal(result.status, 'RESTRICTED');
    } finally {
      accountsProto.retrieve = originalRetrieve;
    }
  }
);

test(
  'updateAccountStatus skips user update when no local user is linked',
  { concurrency: false },
  async () => {
    const { updateAccountStatus } = await getConnectModule();
    const { stripe } = await getStripeModule();

    const accountsProto = Object.getPrototypeOf(stripe.accounts) as {
      retrieve: (accountId: string) => Promise<unknown>;
    };
    const originalRetrieve = accountsProto.retrieve;
    accountsProto.retrieve = async () =>
      ({
        payouts_enabled: true,
        charges_enabled: true,
        details_submitted: true,
        requirements: { disabled_reason: null },
      }) as unknown;

    prismaMock.user.findFirst = async () => null;
    let updateCalled = false;
    prismaMock.user.update = async () => {
      updateCalled = true;
      return {};
    };

    try {
      const result = await updateAccountStatus('acct_1');
      assert.equal(result.status, 'COMPLETE');
      assert.equal(updateCalled, false);
    } finally {
      accountsProto.retrieve = originalRetrieve;
    }
  }
);
