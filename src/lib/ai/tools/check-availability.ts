import { z } from 'zod';
import { createTool, ToolResult } from './tool-registry';

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
  startTime: string;
  endTime: string;
  spotsAvailable: number;
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
      // MOCK IMPLEMENTATION
      // In production, this would query the database or external booking system
      
      const slots: TimeSlot[] = [];
      const now = new Date();
      
      for (const dateStr of params.dates) {
        const date = new Date(dateStr);
        
        // Simulate some dates being unavailable (weekends less available)
        const dayOfWeek = date.getDay();
        const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
        const isPast = date < now;
        
        if (isPast) {
          continue; // Skip past dates
        }

        // Random availability based on day
        const baseAvailability = isWeekend ? 0.6 : 0.85;
        const hash = (params.hostId + dateStr).split('').reduce((a, c) => a + c.charCodeAt(0), 0);
        const isAvailable = (hash % 100) / 100 < baseAvailability;

        if (isAvailable) {
          // Generate 1-3 time slots
          const slotCount = (hash % 3) + 1;
          const timeSlots = [
            { start: '09:00', end: '12:00' },
            { start: '14:00', end: '17:00' },
            { start: '18:00', end: '21:00' },
          ];

          for (let i = 0; i < slotCount; i++) {
            const slot = timeSlots[i];
            const spots = Math.max(1, 6 - params.guestCount - (hash % 3));
            
            slots.push({
              date: dateStr,
              startTime: slot.start,
              endTime: slot.end,
              spotsAvailable: spots,
              price: 4500 + (hash % 30) * 100, // Price in cents
              currency: 'USD',
            });
          }
        }
      }

      const available = slots.length > 0;
      
      // Find next available date if none of requested dates work
      let nextAvailableDate: string | undefined;
      if (!available) {
        const futureDate = new Date(now);
        futureDate.setDate(futureDate.getDate() + 3 + (params.hostId.charCodeAt(0) % 7));
        nextAvailableDate = futureDate.toISOString().split('T')[0];
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
            : `No availability for requested dates. Next available: ${nextAvailableDate}`,
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
