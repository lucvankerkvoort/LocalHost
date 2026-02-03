import assert from 'node:assert/strict';
import test from 'node:test';

type MockAvailabilityModel = {
  findMany: (args: unknown) => Promise<unknown[]>;
  findFirst: (args: unknown) => Promise<unknown | null>;
};

type MockPrisma = {
  experienceAvailability: MockAvailabilityModel;
};

const mockPrisma: MockPrisma = {
  experienceAvailability: {
    findMany: async () => [],
    findFirst: async () => null,
  },
};

// Prevent real Prisma client construction during tests.
const globalForPrisma = globalThis as { prisma?: MockPrisma };
globalForPrisma.prisma = mockPrisma;

let cachedTool:
  | (Awaited<typeof import('./check-availability')>['checkAvailabilityTool'])
  | null = null;

async function getTool() {
  if (!cachedTool) {
    cachedTool = (await import('./check-availability')).checkAvailabilityTool;
  }
  return cachedTool;
}

test(
  'checkAvailabilityTool returns available slots and respects guest count filtering',
  { concurrency: false },
  async () => {
    const originalFindMany = mockPrisma.experienceAvailability.findMany;
    const originalFindFirst = mockPrisma.experienceAvailability.findFirst;

    try {
      mockPrisma.experienceAvailability.findMany = async () => [
        {
          startTime: '09:00',
          endTime: '11:00',
          spotsLeft: 2,
          experience: { price: 7500, currency: 'EUR' },
        },
        {
          startTime: '12:00',
          endTime: '14:00',
          spotsLeft: 4,
          experience: { price: 7500, currency: 'EUR' },
        },
      ];
      mockPrisma.experienceAvailability.findFirst = async () => null;

      const checkAvailabilityTool = await getTool();
      const result = await checkAvailabilityTool.handler({
        hostId: 'host-1',
        dates: ['2026-03-01'],
        guestCount: 3,
      });

      assert.equal(result.success, true);
      if (!result.success) return;

      assert.equal(result.data.available, true);
      assert.equal(result.data.slots.length, 1);
      assert.equal(result.data.slots[0].spotsAvailable, 4);
      assert.equal(result.data.message.includes('Found 1 available slot(s)'), true);
    } finally {
      mockPrisma.experienceAvailability.findMany = originalFindMany;
      mockPrisma.experienceAvailability.findFirst = originalFindFirst;
    }
  }
);

test(
  'checkAvailabilityTool returns nextAvailableDate when requested dates have no slots',
  { concurrency: false },
  async () => {
    const originalFindMany = mockPrisma.experienceAvailability.findMany;
    const originalFindFirst = mockPrisma.experienceAvailability.findFirst;

    try {
      mockPrisma.experienceAvailability.findMany = async () => [];
      mockPrisma.experienceAvailability.findFirst = async () => ({
        date: new Date('2026-04-10T00:00:00.000Z'),
      });

      const checkAvailabilityTool = await getTool();
      const result = await checkAvailabilityTool.handler({
        hostId: 'host-2',
        experienceId: 'exp-2',
        dates: ['2026-04-01', '2026-04-02'],
        guestCount: 2,
      });

      assert.equal(result.success, true);
      if (!result.success) return;

      assert.equal(result.data.available, false);
      assert.equal(result.data.nextAvailableDate, '2026-04-10');
      assert.equal(
        result.data.message.includes('No availability for requested dates.'),
        true
      );
      assert.equal(
        result.data.message.includes('Next available: 2026-04-10'),
        true
      );
    } finally {
      mockPrisma.experienceAvailability.findMany = originalFindMany;
      mockPrisma.experienceAvailability.findFirst = originalFindFirst;
    }
  }
);

test(
  'checkAvailabilityTool returns AVAILABILITY_ERROR when prisma query fails',
  { concurrency: false },
  async () => {
    const originalFindMany = mockPrisma.experienceAvailability.findMany;
    const originalFindFirst = mockPrisma.experienceAvailability.findFirst;

    try {
      mockPrisma.experienceAvailability.findMany = async () => {
        throw new Error('database unavailable');
      };
      mockPrisma.experienceAvailability.findFirst = async () => null;

      const checkAvailabilityTool = await getTool();
      const result = await checkAvailabilityTool.handler({
        hostId: 'host-3',
        dates: ['2026-05-01'],
        guestCount: 2,
      });

      assert.equal(result.success, false);
      if (result.success) return;

      assert.equal(result.code, 'AVAILABILITY_ERROR');
      assert.equal(result.error, 'database unavailable');
    } finally {
      mockPrisma.experienceAvailability.findMany = originalFindMany;
      mockPrisma.experienceAvailability.findFirst = originalFindFirst;
    }
  }
);
