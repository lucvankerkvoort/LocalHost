'use client';

import { useEffect, useRef, useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useChat } from '@ai-sdk/react';
import { useAppSelector, useAppDispatch } from '@/store/hooks';
import {
  selectProfile,
  updateIdentity,
  updateImage,
  updateInterests,
  removeInterest,
  updateLanguages,
  removeLanguage,
  updatePreferences,
  updateBio,
  type TravelPreferences,
} from '@/store/profile-slice';
import {
  PROFILE_SETUP_START_TOKEN,
} from '@/components/features/chat-widget-handshake';
import {
  MapPin,
  Sparkles,
  Send,
  Camera,
  Pencil,
  X,
  User as UserIcon,
  Heart,
  Compass,
  Link as LinkIcon,
  Home,
} from 'lucide-react';
import { useSession } from 'next-auth/react';

// ─── Local types matching chat-widget.tsx ─────────────────────

type ChatMessagePart = {
  type?: string;
  text?: string;
  toolName?: string;
  toolCallId?: string;
  state?: string;
  output?: unknown;
  input?: unknown;
};

type ChatMessageRecord = {
  id?: string;
  role?: string;
  content?: string;
  parts?: ChatMessagePart[];
  toolInvocations?: Array<{
    toolName?: string;
    state?: string;
    result?: Record<string, unknown>;
  }>;
};

type UseChatResult = {
  messages: ChatMessageRecord[];
  sendMessage?: (
    message: { text: string },
    options?: { body?: Record<string, unknown> }
  ) => Promise<void> | void;
  status: string;
  error?: Error | null;
};

// ─── Tool result ingestion ───────────────────────────────────

function useIngestProfileTools(messages: ChatMessageRecord[]): string | null {
  const dispatch = useAppDispatch();
  const seen = useRef(new Set<string>());
  const [redirectUrl, setRedirectUrl] = useState<string | null>(null);

  useEffect(() => {
    for (const msg of messages) {
      if (msg.role !== 'assistant') continue;

      // Parts-based extraction (primary)
      if (Array.isArray(msg.parts)) {
        for (const part of msg.parts) {
          // Skip non-tool parts
          const partType = part.type || '';
          const isTool = partType.startsWith('tool-') || partType === 'dynamic-tool';
          if (!isTool) continue;

          // Extract tool name: prefer explicit toolName, fall back to parsing type
          const toolName = part.toolName || (partType.startsWith('tool-') && partType !== 'tool-invocation'
            ? partType.slice(5)
            : null);
          if (!toolName) continue;

          // Accept 'output-available' or 'result' states
          const state = part.state;
          if (state !== 'output-available' && state !== 'result') continue;

          const id = part.toolCallId || `${toolName}-${msg.id}`;
          if (seen.current.has(id)) continue;
          seen.current.add(id);

          // Output can be in 'output' field or 'result' field depending on SDK version
          const output = (part.output ?? (part as Record<string, unknown>).result) as Record<string, unknown> | undefined;
          if (!output?.success) continue;

          console.log('[ProfileSetup] Tool result:', toolName, output);

          if (toolName === 'startTrip' && typeof output.redirectUrl === 'string') {
            setRedirectUrl(output.redirectUrl);
          } else {
            dispatchToolResult(dispatch, toolName, output);
          }
        }
      }

      // Fallback: legacy toolInvocations
      if (Array.isArray(msg.toolInvocations)) {
        for (const inv of msg.toolInvocations) {
          if (inv.state !== 'result' || !inv.result?.success) continue;
          const toolName = inv.toolName || '';
          const fallbackId = `legacy-${toolName}-${msg.id}`;
          if (seen.current.has(fallbackId)) continue;
          seen.current.add(fallbackId);

          console.log('[ProfileSetup] Legacy tool result:', toolName, inv.result);

          if (toolName === 'startTrip' && typeof inv.result.redirectUrl === 'string') {
            setRedirectUrl(inv.result.redirectUrl);
          } else {
            dispatchToolResult(dispatch, toolName, inv.result);
          }
        }
      }
    }
  }, [messages, dispatch]);

  return redirectUrl;
}

function dispatchToolResult(
  dispatch: ReturnType<typeof useAppDispatch>,
  toolName: string,
  output: Record<string, unknown>
) {
  switch (toolName) {
    case 'updateIdentity':
      dispatch(
        updateIdentity(
          output as { name?: string; city?: string; country?: string; occupation?: string }
        )
      );
      break;
    case 'updateInterests':
      if (Array.isArray(output.interests)) {
        dispatch(updateInterests(output.interests as string[]));
      }
      break;
    case 'updateLanguages':
      if (Array.isArray(output.languages)) {
        dispatch(updateLanguages(output.languages as string[]));
      }
      break;
    case 'updatePreferences':
      dispatch(updatePreferences(output as TravelPreferences));
      break;
    case 'draftBio':
      if (typeof output.bio === 'string') {
        dispatch(updateBio(output.bio));
      }
      break;
  }
}

// ─── Helpers ─────────────────────────────────────────────────

function extractTextFromParts(parts?: ChatMessagePart[]): string {
  if (!Array.isArray(parts)) return '';
  return parts
    .filter((p) => p.type === 'text' && p.text)
    .map((p) => p.text!)
    .join('');
}

function getCompleteness(profile: ReturnType<typeof selectProfile>) {
  let filled = 0;
  const total = 7;
  if (profile.name) filled++;
  if (profile.city) filled++;
  if (profile.occupation) filled++;
  if (profile.languages.length > 0) filled++;
  if (profile.interests.length > 0) filled++;
  if (profile.travelPreferences.budget || profile.travelPreferences.pace) filled++;
  if (profile.bio) filled++;
  return Math.round((filled / total) * 100);
}

// ─── Page ────────────────────────────────────────────────────

export default function ProfileSetupPage() {
  const { data: session } = useSession();
  const dispatch = useAppDispatch();
  const profile = useAppSelector(selectProfile);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const [localInput, setLocalInput] = useState('');

  // Seed name from session
  useEffect(() => {
    if (session?.user?.name && !profile.name) {
      dispatch(updateIdentity({ name: session.user.name }));
    }
    if (session?.user?.image && !profile.image) {
      dispatch(updateImage(session.user.image));
    }
  }, [session, profile.name, profile.image, dispatch]);

  const chatId = 'chat-profile_setup';

  const { messages, sendMessage, status, error } = useChat({ id: chatId }) as UseChatResult;

  // Ingest tool results into Redux + detect navigation
  const redirectUrl = useIngestProfileTools(messages);
  const router = useRouter();

  // Navigate when startTrip tool returns a redirect URL
  useEffect(() => {
    if (redirectUrl) {
      router.push(redirectUrl);
    }
  }, [redirectUrl, router]);

  // Build request body
  const chatRequestBody = useCallback(() => {
    return { intent: 'profile_setup' };
  }, []);

  // Auto-trigger on mount
  const triggered = useRef(false);
  useEffect(() => {
    if (triggered.current || messages.length > 0 || !sendMessage) return;
    triggered.current = true;
    void Promise.resolve(
      sendMessage({ text: PROFILE_SETUP_START_TOKEN }, { body: chatRequestBody() })
    ).catch(() => {});
  }, [sendMessage, messages.length, chatRequestBody]);

  // Auto-scroll
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Send message
  const handleSend = useCallback(() => {
    const text = localInput.trim();
    if (!text || status === 'streaming' || !sendMessage) return;
    sendMessage({ text }, { body: chatRequestBody() });
    setLocalInput('');
  }, [localInput, status, sendMessage, chatRequestBody]);

  const completeness = getCompleteness(profile);
  const isLoading = status === 'submitted' || status === 'streaming';

  return (
    <div className="h-screen flex bg-[var(--background)] overflow-hidden">
      {/* ─── LEFT: Profile Card ───────────────────── */}
      <div className="flex-1 overflow-y-auto p-6 lg:p-10">
        <div className="max-w-xl mx-auto space-y-6">

          {/* Header */}
          <div>
            <h1 className="text-2xl font-bold mb-1">Build Your Profile</h1>
            <p className="text-sm text-[var(--muted-foreground)]">
              Chat with your profile agent — your card builds itself.
            </p>
          </div>

          {/* Completeness */}
          <div className="flex items-center gap-3">
            <div className="flex-1 h-2 rounded-full bg-[var(--muted)] overflow-hidden">
              <div
                className="h-full rounded-full bg-gradient-to-r from-[var(--princeton-orange)] to-[var(--blue-green)] transition-all duration-700"
                style={{ width: `${completeness}%` }}
              />
            </div>
            <span className="text-xs font-semibold tabular-nums text-[var(--muted-foreground)]">
              {completeness}%
            </span>
          </div>

          {/* Avatar */}
          <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-6 flex items-center gap-5">
            <div className="relative">
              <div className="w-20 h-20 rounded-full bg-[var(--muted)] flex items-center justify-center overflow-hidden border-2 border-[var(--border)]">
                {profile.image ? (
                  <img src={profile.image} alt="Avatar" className="w-full h-full object-cover" />
                ) : (
                  <UserIcon className="w-8 h-8 text-[var(--muted-foreground)]" />
                )}
              </div>
              <button
                className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full bg-[var(--princeton-orange)] text-white flex items-center justify-center shadow-md hover:scale-110 transition-transform"
                title="Upload photo"
              >
                <Camera className="w-3.5 h-3.5" />
              </button>
            </div>
            <div>
              <p className="font-semibold text-lg">{profile.name || 'Your Name'}</p>
              <p className="text-sm text-[var(--muted-foreground)]">Manual upload only</p>
            </div>
          </div>

          {/* Identity */}
          <ProfileCard
            icon={<MapPin className="w-4 h-4" />}
            title="Identity"
            aiFilled={!!(profile.city || profile.occupation)}
          >
            <div className="grid grid-cols-2 gap-3 text-sm">
              <ProfileField
                label="Home base"
                value={
                  profile.city && profile.country
                    ? `${profile.city}, ${profile.country}`
                    : profile.city
                }
              />
              <ProfileField label="Occupation" value={profile.occupation} />
              <ProfileField label="Name" value={profile.name} />
              <ProfileField
                label="Languages"
                value={
                  profile.languages.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5 mt-0.5">
                      {profile.languages.map((lang) => (
                        <span
                          key={lang}
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-[var(--muted)] border border-[var(--border)]"
                        >
                          {lang}
                          <button
                            onClick={() => dispatch(removeLanguage(lang))}
                            className="hover:text-red-500 transition-colors"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </span>
                      ))}
                    </div>
                  ) : null
                }
              />
            </div>
          </ProfileCard>

          {/* Bio */}
          <ProfileCard
            icon={<Pencil className="w-4 h-4" />}
            title="Bio"
            aiFilled={!!profile.bio}
          >
            {profile.bio ? (
              <p className="text-sm leading-relaxed text-[var(--foreground)]">{profile.bio}</p>
            ) : (
              <div className="border-2 border-dashed border-[var(--border)] rounded-xl p-6 text-center">
                <p className="text-sm text-[var(--muted-foreground)]">
                  Ask the agent to draft a bio for you
                </p>
              </div>
            )}
          </ProfileCard>

          {/* Interests */}
          <ProfileCard
            icon={<Heart className="w-4 h-4" />}
            title="Travel Interests"
            aiFilled={profile.interests.length > 0}
          >
            {profile.interests.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {profile.interests.map((interest) => (
                  <span
                    key={interest}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium bg-[var(--princeton-orange)]/10 text-[var(--princeton-orange)] border border-[var(--princeton-orange)]/20"
                  >
                    {interest}
                    <button
                      onClick={() => dispatch(removeInterest(interest))}
                      className="hover:text-red-500 transition-colors"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </span>
                ))}
              </div>
            ) : (
              <div className="border-2 border-dashed border-[var(--border)] rounded-xl p-6 text-center">
                <p className="text-sm text-[var(--muted-foreground)]">
                  Tell the agent about your interests
                </p>
              </div>
            )}
          </ProfileCard>

          {/* Trip Preferences */}
          <ProfileCard
            icon={<Compass className="w-4 h-4" />}
            title="Trip Preferences"
            aiFilled={
              !!(
                profile.travelPreferences.budget ||
                profile.travelPreferences.pace ||
                profile.travelPreferences.dietary
              )
            }
          >
            <div className="grid grid-cols-3 gap-3 text-sm">
              <ProfileField label="Budget" value={profile.travelPreferences.budget} />
              <ProfileField label="Pace" value={profile.travelPreferences.pace} />
              <ProfileField label="Dietary" value={profile.travelPreferences.dietary} />
            </div>
          </ProfileCard>

          {/* Social Links (empty state) */}
          <ProfileCard icon={<LinkIcon className="w-4 h-4" />} title="Social & Links">
            <div className="border-2 border-dashed border-[var(--border)] rounded-xl p-6 text-center">
              <p className="text-sm text-[var(--muted-foreground)]">
                Mention your social links in the chat to add them
              </p>
            </div>
          </ProfileCard>

          {/* Host CTA */}
          <div className="border-2 border-dashed border-[var(--blue-green)]/30 rounded-2xl p-6 bg-[var(--blue-green)]/5 text-center">
            <Home className="w-6 h-6 mx-auto mb-2 text-[var(--blue-green)]" />
            <p className="font-semibold text-sm mb-1">Want to host experiences?</p>
            <p className="text-xs text-[var(--muted-foreground)] mb-3">
              Activate your host profile to start welcoming travelers
            </p>
            <a
              href="/become-host"
              className="inline-block px-5 py-2 text-sm font-medium rounded-lg bg-[var(--blue-green)] text-white hover:opacity-90 transition-opacity"
            >
              Activate Host Profile
            </a>
          </div>
        </div>
      </div>

      {/* ─── RIGHT: Chat Panel ────────────────────── */}
      <div className="w-[420px] min-w-[380px] flex flex-col border-l border-[var(--border)] bg-[var(--background)]">
        {/* Header */}
        <div className="bg-gradient-to-r from-[var(--princeton-orange)] to-[var(--blue-green)] px-5 py-4 flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center">
            <Sparkles className="w-5 h-5 text-white" />
          </div>
          <div>
            <h2 className="text-white font-semibold text-sm">Profile Agent</h2>
            <p className="text-white/70 text-xs">Building your profile</p>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
          {messages
            .filter((m) => {
              const text = extractTextFromParts(m.parts) || m.content || '';
              return !text.startsWith('ACTION:') && !text.startsWith('Start profile setup');
            })
            .map((msg) => {
              const text = extractTextFromParts(msg.parts) || msg.content || '';
              if (!text.trim()) return null;

              return (
                <div
                  key={msg.id}
                  className={`flex w-full ${
                    msg.role === 'user' ? 'justify-end' : 'justify-start'
                  }`}
                >
                  <div
                    className={`max-w-[85%] px-4 py-2.5 rounded-2xl text-sm leading-relaxed ${
                      msg.role === 'user'
                        ? 'bg-[var(--princeton-orange)] text-white rounded-br-md'
                        : 'bg-[var(--card)] border border-[var(--border)] text-[var(--foreground)] rounded-bl-md'
                    }`}
                  >
                    {text}
                  </div>
                </div>
              );
            })}

          {/* Typing indicator */}
          {isLoading && (
            <div className="flex justify-start">
              <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl rounded-bl-md px-4 py-3 flex gap-1.5">
                <span
                  className="w-2 h-2 rounded-full bg-[var(--muted-foreground)] animate-bounce"
                  style={{ animationDelay: '0ms' }}
                />
                <span
                  className="w-2 h-2 rounded-full bg-[var(--muted-foreground)] animate-bounce"
                  style={{ animationDelay: '150ms' }}
                />
                <span
                  className="w-2 h-2 rounded-full bg-[var(--muted-foreground)] animate-bounce"
                  style={{ animationDelay: '300ms' }}
                />
              </div>
            </div>
          )}

          {error && (
            <div className="text-center text-xs text-red-500 py-2">
              Something went wrong. Try sending another message.
            </div>
          )}

          <div ref={chatEndRef} />
        </div>

        {/* Input */}
        <div className="p-4 border-t border-[var(--border)]">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSend();
            }}
            className="flex items-center gap-2"
          >
            <input
              type="text"
              value={localInput}
              onChange={(e) => setLocalInput(e.target.value)}
              placeholder="Tell the agent about yourself…"
              className="flex-1 px-4 py-2.5 bg-[var(--card)] border border-[var(--border)] rounded-full text-sm focus:outline-none focus:border-[var(--princeton-orange)] transition-colors"
              disabled={isLoading}
            />
            <button
              type="submit"
              disabled={isLoading || !localInput.trim()}
              className="w-10 h-10 bg-[var(--princeton-orange)] rounded-full flex items-center justify-center text-white disabled:opacity-40 hover:bg-[var(--princeton-dark)] transition-colors"
            >
              <Send className="w-5 h-5" />
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

// ─── Reusable components ─────────────────────────────────────

function ProfileCard({
  icon,
  title,
  aiFilled,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  aiFilled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl overflow-hidden">
      <div className="flex items-center justify-between px-5 py-3 border-b border-[var(--border)] bg-[var(--muted)]/30">
        <div className="flex items-center gap-2 text-sm font-semibold">
          {icon}
          {title}
        </div>
        {aiFilled && (
          <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-[var(--blue-green)]">
            <Sparkles className="w-3 h-3" />
            AI filled
          </span>
        )}
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}

function ProfileField({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  const isEmpty = !value;
  return (
    <div className="group relative">
      <p className="text-[10px] uppercase tracking-wider font-semibold text-[var(--muted-foreground)] mb-0.5">
        {label}
      </p>
      {isEmpty ? (
        <p className="text-[var(--muted-foreground)]/50 italic text-xs">—</p>
      ) : (
        <div className="relative">
          {typeof value === 'string' ? <p className="font-medium">{value}</p> : value}
          <button className="absolute -right-1 -top-1 w-5 h-5 rounded-full bg-[var(--card)] border border-[var(--border)] flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow-sm">
            <Pencil className="w-2.5 h-2.5 text-[var(--muted-foreground)]" />
          </button>
        </div>
      )}
    </div>
  );
}
