export type SyntheticResponseStyle = 'FRIENDLY' | 'PROFESSIONAL' | 'CONCISE' | 'WARM';

export interface SyntheticResponderInput {
  hostName?: string | null;
  style: SyntheticResponseStyle;
  personaKey?: string | null;
  guestMessage: string;
  bookingDate: Date;
  recentMessages: Array<{ senderId: string; content: string }>;
  useLlm?: boolean;
}

const MAX_REPLY_CHARS = 320;

const OFF_PLATFORM_PATTERN =
  /\b(whatsapp|telegram|signal|email me|text me|phone number|paypal|venmo|cash app|cashapp|wire transfer|bank transfer|off-platform)\b/i;

const HUMAN_CLAIM_PATTERN =
  /\b(as a human|i am human|i'm human|real person|not a bot)\b/i;

function detectIntent(message: string): 'arrival' | 'timing' | 'food' | 'thanks' | 'generic' {
  const text = message.toLowerCase();
  if (/\b(arrive|arrival|meet|meeting point|where)\b/.test(text)) return 'arrival';
  if (/\b(time|when|schedule|start)\b/.test(text)) return 'timing';
  if (/\b(food|eat|diet|allerg|vegan|vegetarian)\b/.test(text)) return 'food';
  if (/\b(thanks|thank you|great|awesome)\b/.test(text)) return 'thanks';
  return 'generic';
}

function styleVariant(style: SyntheticResponseStyle, intent: ReturnType<typeof detectIntent>): string {
  if (style === 'CONCISE') {
    switch (intent) {
      case 'arrival':
        return 'Meeting point details are in your booking thread. I can share a quick recap if needed.';
      case 'timing':
        return 'Your booked time is confirmed in the itinerary. Please arrive 10 minutes early.';
      case 'food':
        return 'Dietary notes are supported. Share restrictions here and I will log them.';
      case 'thanks':
        return 'Glad to help. I will keep updates in this thread.';
      default:
        return 'Got it. I will keep everything updated here in chat.';
    }
  }

  if (style === 'PROFESSIONAL') {
    switch (intent) {
      case 'arrival':
        return 'I can confirm the meeting point and arrival guidance from your booking details.';
      case 'timing':
        return 'Your scheduled start time is locked in. Arriving a few minutes early is recommended.';
      case 'food':
        return 'Please share dietary requirements and I will register them for the booking context.';
      case 'thanks':
        return 'Happy to assist. I will continue to provide updates in this thread.';
      default:
        return 'Thanks for your message. I will keep coordination within this booking chat.';
    }
  }

  if (style === 'WARM') {
    switch (intent) {
      case 'arrival':
        return 'I can help you get there smoothly and share the easiest meeting-point plan.';
      case 'timing':
        return 'You are all set on timing, and arriving a little early will keep things relaxed.';
      case 'food':
        return 'I am happy to note dietary needs so your experience feels comfortable and fun.';
      case 'thanks':
        return 'You are very welcome. I am here whenever you need a quick update.';
      default:
        return 'Thanks for reaching out. I will keep everything organized right here in chat.';
    }
  }

  switch (intent) {
    case 'arrival':
      return 'I can share a simple meeting-point recap from the booking details.';
    case 'timing':
      return 'Timing is confirmed in your itinerary, and arriving a bit early helps.';
    case 'food':
      return 'I can record dietary preferences here so they are included in context.';
    case 'thanks':
      return 'Happy to help! I will keep updates in this chat thread.';
    default:
      return 'Thanks for the note! I will keep all coordination in this booking thread.';
  }
}

function truncateToLimit(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  return `${text.slice(0, maxChars - 1)}…`;
}

export function applySyntheticGuardrails(candidate: string): string | null {
  const normalized = candidate.replace(/\s+/g, ' ').trim();
  if (!normalized) return null;
  if (OFF_PLATFORM_PATTERN.test(normalized)) return null;
  if (HUMAN_CLAIM_PATTERN.test(normalized)) return null;
  return truncateToLimit(normalized, MAX_REPLY_CHARS);
}

export function buildSyntheticFallback(style: SyntheticResponseStyle): string {
  if (style === 'CONCISE') {
    return 'I am the Localhost automated host assistant. Thanks for your message. I will keep updates in this booking chat.';
  }
  if (style === 'PROFESSIONAL') {
    return 'I am the Localhost automated host assistant for this booking. Thank you for your message. I will continue updates here in chat.';
  }
  if (style === 'WARM') {
    return 'I am the Localhost automated host assistant for this booking. Thanks for reaching out. I will keep everything clear and updated right here.';
  }
  return 'I am the Localhost automated host assistant for this booking. Thanks for your message. I will keep everything coordinated in this chat.';
}

export function generateSyntheticHostReply(input: SyntheticResponderInput): string {
  const intent = detectIntent(input.guestMessage);
  const hostName = input.hostName?.trim();
  const prefix = hostName
    ? `I am the Localhost automated host assistant for ${hostName}.`
    : 'I am the Localhost automated host assistant for this host.';
  const middle = styleVariant(input.style, intent);
  const suffix = `Booking date on file: ${input.bookingDate.toISOString().slice(0, 10)}.`;

  const candidate = `${prefix} ${middle} ${suffix}`;
  return applySyntheticGuardrails(candidate) ?? buildSyntheticFallback(input.style);
}
