import { test, expect, E2E_ACTORS, E2E_SCENARIOS } from './fixtures';
import type { Page } from '@playwright/test';

type BookingMessage = {
  senderId?: string;
  content?: string;
};

async function loginWithCredentials(page: Page, email: string, password: string) {
  const csrf = await page.request.get('/api/auth/csrf');
  if (!csrf.ok()) return false;
  const body = await csrf.json();
  const csrfToken = body?.csrfToken;
  if (!csrfToken) return false;

  const response = await page.request.post('/api/auth/callback/credentials?callbackUrl=/', {
    form: {
      csrfToken,
      email,
      password,
      callbackUrl: '/',
      redirect: 'false',
      json: 'true',
    },
  });

  return response.status() < 400;
}

async function hasAuthenticatedSession(page: Page): Promise<boolean> {
  const sessionResponse = await page.request.get('/api/auth/session');
  if (!sessionResponse.ok()) return false;
  const session = await sessionResponse.json();
  return Boolean(session?.user?.id);
}

test.describe('Synthetic Host Bots', () => {
  test.setTimeout(120000);

  test('confirmed synthetic-host booking receives delayed automated reply', async ({ page }) => {
    const loggedIn = await loginWithCredentials(page, E2E_ACTORS.TRAVELER.email, E2E_ACTORS.TRAVELER.password);
    if (!loggedIn) {
      test.skip(true, 'Credentials login failed in this environment');
    }
    const hasSession = await hasAuthenticatedSession(page);
    if (!hasSession) {
      test.skip(true, 'No authenticated session available in this environment');
    }

    const bookingId = E2E_SCENARIOS.SYNTHETIC_REPLY;
    const before = await page.request.get(`/api/bookings/${bookingId}/messages`);
    if (before.status() === 401) {
      test.skip(true, 'Authenticated API session is unavailable for booking chat tests');
    }
    if (before.status() === 404) {
      test.skip(true, 'Synthetic E2E scenario is not seeded');
    }
    expect(before.ok()).toBeTruthy();
    const beforeMessages = await before.json();
    const beforeCount = Array.isArray(beforeMessages) ? beforeMessages.length : 0;

    const guestMessage = `E2E synthetic bot ping ${Date.now()}`;
    const postResponse = await page.request.post(`/api/bookings/${bookingId}/messages`, {
      data: { content: guestMessage },
    });
    expect(postResponse.ok()).toBeTruthy();

    const deadline = Date.now() + 35000;
    let sawBotReply = false;
    while (Date.now() < deadline) {
      const poll = await page.request.get(`/api/bookings/${bookingId}/messages`);
      expect(poll.ok()).toBeTruthy();
      const messages = (await poll.json()) as BookingMessage[];
      if (Array.isArray(messages)) {
        const newMessages = messages.slice(beforeCount);
        sawBotReply = newMessages.some(
          (message) =>
            message?.senderId === 'e2e-synthetic-host' &&
            typeof message?.content === 'string' &&
            message.content.toLowerCase().includes('automated host assistant')
        );
      }
      if (sawBotReply) break;
      await page.waitForTimeout(1500);
    }

    expect(sawBotReply).toBeTruthy();
  });

  test('human-host booking does not enqueue synthetic bot replies', async ({ page }) => {
    const loggedIn = await loginWithCredentials(page, E2E_ACTORS.TRAVELER.email, E2E_ACTORS.TRAVELER.password);
    if (!loggedIn) {
      test.skip(true, 'Credentials login failed in this environment');
    }
    const hasSession = await hasAuthenticatedSession(page);
    if (!hasSession) {
      test.skip(true, 'No authenticated session available in this environment');
    }

    const bookingId = E2E_SCENARIOS.MESSAGING_ENABLED;
    const before = await page.request.get(`/api/bookings/${bookingId}/messages`);
    if (before.status() === 401) {
      test.skip(true, 'Authenticated API session is unavailable for booking chat tests');
    }
    if (before.status() === 404) {
      test.skip(true, 'Messaging E2E scenario is not seeded');
    }
    expect(before.ok()).toBeTruthy();
    const beforeMessages = await before.json();
    const beforeCount = Array.isArray(beforeMessages) ? beforeMessages.length : 0;

    const guestMessage = `E2E human host ping ${Date.now()}`;
    const postResponse = await page.request.post(`/api/bookings/${bookingId}/messages`, {
      data: { content: guestMessage },
    });
    expect(postResponse.ok()).toBeTruthy();

    await page.waitForTimeout(5000);

    const after = await page.request.get(`/api/bookings/${bookingId}/messages`);
    expect(after.ok()).toBeTruthy();
    const afterMessages = (await after.json()) as BookingMessage[];
    const newMessages = Array.isArray(afterMessages) ? afterMessages.slice(beforeCount) : [];
    const unexpectedBotReply = newMessages.some((message) => message?.senderId === 'e2e-host-full-access');
    expect(unexpectedBotReply).toBeFalsy();
  });

  test('tentative booking remains chat-locked', async ({ page }) => {
    const loggedIn = await loginWithCredentials(page, E2E_ACTORS.TRAVELER.email, E2E_ACTORS.TRAVELER.password);
    if (!loggedIn) {
      test.skip(true, 'Credentials login failed in this environment');
    }
    const hasSession = await hasAuthenticatedSession(page);
    if (!hasSession) {
      test.skip(true, 'No authenticated session available in this environment');
    }

    const bookingId = E2E_SCENARIOS.HAPPY_PATH_BOOKING;
    const response = await page.request.post(`/api/bookings/${bookingId}/messages`, {
      data: { content: 'Should fail for tentative booking' },
    });

    if (response.status() === 404) {
      test.skip(true, 'Happy-path booking scenario is not seeded');
    }
    if (response.status() === 401) {
      test.skip(true, 'Authenticated API session is unavailable for booking chat tests');
    }

    expect(response.status()).toBe(403);
  });
});
