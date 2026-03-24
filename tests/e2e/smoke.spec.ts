import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

type RouteProbe = {
  menu: string;
  heading: string;
};

const routeProbes: RouteProbe[] = [
  { menu: 'Authentication', heading: 'Authentication Configuration' },
  { menu: 'Frontend', heading: 'Frontend & IdP Configuration' },
  { menu: 'Connection', heading: 'Backend Configuration' },
  { menu: 'Security', heading: 'Security' },
];

const clickMenu = async (page: Page, label: string): Promise<void> => {
  const button = page.getByRole('button', { name: new RegExp(`^${label}$`, 'i') });
  if (await button.count()) {
    await button.first().click();
    return;
  }

  await page.getByText(label, { exact: true }).first().click();
};

const loginAsAdmin = async (page: Page): Promise<void> => {
  await page.goto('/');
  await page.getByLabel('Username').fill('admin');
  await page.getByLabel('Password').fill('admin');
  await page.getByRole('button', { name: /login/i }).click();
  await expect(page.getByText('Server Configuration')).toBeVisible();
};

test('admin can log in and open critical routes', async ({ page }, testInfo) => {
  const routeDurations: Record<string, number> = {};
  const consoleErrors: string[] = [];

  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      consoleErrors.push(msg.text());
    }
  });

  const loginStart = Date.now();
  await loginAsAdmin(page);
  routeDurations.Login = Date.now() - loginStart;

  const cookieNames = (await page.context().cookies()).map(({ name }) => name);
  expect(cookieNames).toEqual(
    expect.arrayContaining([
      'nauthilus_ui_session',
      'nauthilus_ui_refresh_session',
      'nauthilus_ui_csrf_token',
    ]),
  );
  expect(cookieNames).not.toContain('nauthilus_session');
  expect(cookieNames).not.toContain('nauthilus_refresh_session');
  expect(cookieNames).not.toContain('nauthilus_csrf_token');
  expect(cookieNames).not.toContain('nauthilus_mfa_pending');

  for (const probe of routeProbes) {
    const startedAt = Date.now();
    await clickMenu(page, probe.menu);
    await expect(page.getByText(probe.heading, { exact: false }).first()).toBeVisible();
    routeDurations[probe.menu] = Date.now() - startedAt;
  }

  console.log(`Route timings: ${JSON.stringify(routeDurations)}`);
  await testInfo.attach('route-timings', {
    body: Buffer.from(JSON.stringify(routeDurations, null, 2)),
    contentType: 'application/json',
  });

  expect(
    consoleErrors.filter((message) =>
      message.includes('cannot be a descendant of') ||
      message.includes('cannot contain a nested'),
    ),
  ).toEqual([]);
});

test('runtime OIDC token is refreshed automatically when expired', async ({ page }) => {
  const refreshedTokenValue = 'runtime-fresh-token';
  const seenAuthValues: string[] = [];
  let oidcTokenFetchCount = 0;

  await page.route('**/api/runtime/**', async (route) => {
    if (route.request().method() !== 'GET') {
      await route.continue();
      return;
    }

    const expiredTokenResponse = {
      connection: {
        backend_url: 'https://runtime.example.invalid',
        basic_auth: {
          enabled: false,
          username: '',
          password: '',
        },
        oidc_auth: {
          enabled: true,
          client_id: 'runtime-client',
          client_secret: 'runtime-secret',
          scope: 'nauthilus:security',
          token: 'runtime-expired-token',
          expires_at: 1,
        },
      },
      hooks: {},
    };

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(expiredTokenResponse),
    });
  });

  await page.route('**/proxy/oidc-token**', async (route) => {
    oidcTokenFetchCount += 1;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        access_token: refreshedTokenValue,
        expires_in: 3600,
      }),
    });
  });

  await page.route('**/proxy/ping**', async (route) => {
    const authValue = route.request().headers()['x-auth-value'] || '';
    if (authValue) {
      seenAuthValues.push(authValue);
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ status: 'ok' }),
    });
  });

  await page.route('**/proxy/security/metrics**', async (route) => {
    const authValue = route.request().headers()['x-auth-value'] || '';
    if (authValue) {
      seenAuthValues.push(authValue);
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        timestamp_ms: Date.now(),
        unique_ips_per_user: [],
        account_fail_budget_used: [],
        global_ips_per_user: [],
        sprayed_password_tokens: [],
      }),
    });
  });

  await page.route('**/proxy/hooks/distributed-brute-force-admin**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ metrics: { warmup: { warmed_up: true } } }),
    });
  });

  await loginAsAdmin(page);
  await clickMenu(page, 'Security');
  await expect(page.getByText('Security', { exact: false }).first()).toBeVisible();

  await expect.poll(() => oidcTokenFetchCount, { timeout: 15_000 }).toBeGreaterThan(0);
  await expect.poll(() => seenAuthValues.length, { timeout: 15_000 }).toBeGreaterThan(0);
  expect(seenAuthValues).toContain(refreshedTokenValue);
  expect(seenAuthValues).not.toContain('runtime-expired-token');
});
