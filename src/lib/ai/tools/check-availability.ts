import { z } from 'zod';
import { createTool, ToolResult } from './tool-registry';
import { prisma } from '@/lib/prisma';

// ============================================================================
// Schema
// ============================================================================

const CheckAvailabilityParams = z.object({
  hostId: z.string().describe('ID of the host to check availability for'),
  experienceId: z.string().optional().describe('Specific experience ID (optional)'),
  dates: z.array(z.string().describe('ISO date string (YYYY-MM-DD)')).min(1).describe('Dates to check'),
  guestCount: z.number().min(1).max(20).default(2).describe('Number of guests'),
});

type TimeSlot = {
  date: string;
  startTime?: string | null;
  endTime?: string | null;
  spotsAvailable?: number | null;
  price: number;
  currency: string;
};

type CheckAvailabilityResult = {
  hostId: string;
  experienceId?: string;
  available: boolean;
  slots: TimeSlot[];
  nextAvailableDate?: string;
  message: string;
};

// ============================================================================
// Tool Implementation
// ============================================================================

export const checkAvailabilityTool = createTool({
  name: 'check_availability',
  description: 'Check if a host or experience is available on specific dates. Returns available time slots and pricing.',
  parameters: CheckAvailabilityParams,

  async handler(params): Promise<ToolResult<CheckAvailabilityResult>> {
    try {
      const slots: TimeSlot[] = [];
      const now = new Date();

      const experienceFilter = params.experienceId
        ? { id: params.experienceId }
        : { hostId: params.hostId };

      for (const dateStr of params.dates) {
        const dayStart = new Date(`${dateStr}T00:00:00.000Z`);
        const dayEnd = new Date(`${dateStr}T23:59:59.999Z`);

        const availability = await prisma.experienceAvailability.findMany({
          where: {
            experience: experienceFilter,
            date: { gte: dayStart, lte: dayEnd },
          },
          include: {
            experience: true,
          },
        });

        for (const slot of availability) {
          if (slot.spotsLeft !== null && slot.spotsLeft !== undefined) {
            if (slot.spotsLeft < params.guestCount) continue;
          }

          slots.push({
            date: dateStr,
            startTime: slot.startTime ?? null,
            endTime: slot.endTime ?? null,
            spotsAvailable: slot.spotsLeft ?? null,
            price: slot.experience.price,
            currency: slot.experience.currency,
          });
        }
      }

      const available = slots.length > 0;

      // Find next available date if none of requested dates work
      let nextAvailableDate: string | undefined;
      if (!available) {
        const nextAvailability = await prisma.experienceAvailability.findFirst({
          where: {
            experience: experienceFilter,
            date: { gte: now },
          },
          orderBy: { date: 'asc' },
        });
        if (nextAvailability) {
          nextAvailableDate = nextAvailability.date.toISOString().split('T')[0];
        }
      }

      return {
        success: true,
        data: {
          hostId: params.hostId,
          experienceId: params.experienceId,
          available,
          slots,
          nextAvailableDate,
          message: available
            ? `Found ${slots.length} available slot(s) across ${params.dates.length} date(s)`
            : `No availability for requested dates.${nextAvailableDate ? ` Next available: ${nextAvailableDate}` : ''}`,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Availability check failed',
        code: 'AVAILABILITY_ERROR',
      };
    }
  },
});
