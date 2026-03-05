import { createHmac, timingSafeEqual } from 'node:crypto';

import { auth } from '@/auth';

const AUTH_SIGNATURE_PARAM = 'authSig';
const AUTH_EXPIRY_PARAM = 'authExp';
const AUTH_NONCE_PARAM = 'authNonce';

function canonicalizeSearchParams(url: URL): string {
  const params = new URLSearchParams(url.searchParams);
  params.delete(AUTH_SIGNATURE_PARAM);
  params.delete(AUTH_EXPIRY_PARAM);
  params.delete(AUTH_NONCE_PARAM);

  return Array.from(params.entries())
    .sort(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey))
    .map(([key, value]) => `${key}=${value}`)
    .join('&');
}

export function buildImageRequestSignaturePayload(url: URL, expiryEpochSeconds: number, nonce: string): string {
  return `${url.pathname}|${canonicalizeSearchParams(url)}|${expiryEpochSeconds}|${nonce}`;
}

function signaturesMatch(expectedHex: string, providedHex: string): boolean {
  if (!/^[a-f0-9]+$/i.test(expectedHex) || !/^[a-f0-9]+$/i.test(providedHex)) return false;
  if (expectedHex.length !== providedHex.length) return false;

  const expectedBuffer = Buffer.from(expectedHex, 'hex');
  const providedBuffer = Buffer.from(providedHex, 'hex');
  return timingSafeEqual(expectedBuffer, providedBuffer);
}

export function verifySignedImageRequest(url: URL, secret: string): { ok: boolean; reason: string } {
  const signature = url.searchParams.get(AUTH_SIGNATURE_PARAM);
  const expiryRaw = url.searchParams.get(AUTH_EXPIRY_PARAM);
  const nonce = url.searchParams.get(AUTH_NONCE_PARAM);

  if (!signature || !expiryRaw || !nonce) {
    return { ok: false, reason: 'missing_signature_fields' };
  }

  const expiryEpochSeconds = Number(expiryRaw);
  if (!Number.isFinite(expiryEpochSeconds)) {
    return { ok: false, reason: 'invalid_signature_expiry' };
  }

  if (Date.now() >= expiryEpochSeconds * 1000) {
    return { ok: false, reason: 'expired_signature' };
  }

  const payload = buildImageRequestSignaturePayload(url, expiryEpochSeconds, nonce);
  const expectedSignature = createHmac('sha256', secret).update(payload).digest('hex');
  if (!signaturesMatch(expectedSignature, signature)) {
    return { ok: false, reason: 'invalid_signature' };
  }

  return { ok: true, reason: 'signed' };
}

export type ImageRequestAuthorization = {
  authorized: boolean;
  reason: string;
  userId?: string;
};

export async function authorizeImageRequest(request: Request): Promise<ImageRequestAuthorization> {
  const session = await auth();
  if (session?.user?.id) {
    return {
      authorized: true,
      reason: 'session',
      userId: session.user.id,
    };
  }

  const signingSecret = process.env.PLACE_IMAGE_SIGNING_SECRET;
  if (!signingSecret) {
    return {
      authorized: false,
      reason: 'authentication_required',
    };
  }

  const verification = verifySignedImageRequest(new URL(request.url), signingSecret);
  return {
    authorized: verification.ok,
    reason: verification.reason,
  };
}
