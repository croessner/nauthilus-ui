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

const openProfileVersionsDialog = async (page: Page): Promise<void> => {
  await page.getByRole('button', { name: /manage profiles/i }).first().click();
  await page.getByRole('menuitem', { name: /profile versions/i }).click();
  await expect(page.getByRole('heading', { name: /Profile Versions:/i })).toBeVisible();
};

const mockBruteForceRuntime = async (page: Page): Promise<void> => {
  await page.route('**/api/runtime/**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        connection: {
          backend_url: 'https://runtime.example.invalid',
          basic_auth: {
            enabled: false,
            username: '',
            password: '',
          },
          oidc_auth: {
            enabled: false,
            client_id: '',
            client_secret: '',
            token: '',
            expires_at: 0,
          },
        },
        hooks: {},
      }),
    });
  });

  await page.route('**/proxy/ping**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ status: 'ok' }),
    });
  });

  await page.route('**/proxy/bruteforce/list**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        result: [
          {
            entries: [
              {
                network: '2001:db8:85a3::8a2e:370:7334/64',
                bucket: 'public-net',
                ban_time: 1_200_000_000_000,
                ttl: 900_000_000_000,
                banned_at: '2026-03-25T10:15:00.000Z',
              },
            ],
          },
          {
            accounts: {
              demo: ['2001:db8:85a3::8a2e:370:7334'],
            },
          },
        ],
      }),
    });
  });
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

test('profile restore uses in-app confirmation dialog without native browser dialogs', async ({ page }) => {
  const profileVersion = {
    profileName: 'default',
    version: 42,
    createdAt: '2026-03-26T10:00:00.000Z',
    createdBy: 'admin',
    source: 'manual',
    comment: 'snapshot for restore',
  };
  let restoreRequestBody = '';
  let nativeDialogCount = 0;

  page.on('dialog', async (dialog) => {
    nativeDialogCount += 1;
    await dialog.dismiss();
  });

  await page.route('**/api/profiles/**/versions?limit=200', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ items: [profileVersion] }),
    });
  });

  await page.route('**/api/profiles/**/versions/42/restore', async (route) => {
    restoreRequestBody = route.request().postData() || '';
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ message: 'Profile restored' }),
    });
  });

  await loginAsAdmin(page);
  await openProfileVersionsDialog(page);
  await expect(page.getByText('Version 42', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: 'Restore' }).first().click();

  const restoreDialog = page.getByRole('dialog').filter({
    has: page.getByRole('heading', { name: 'Restore Profile Version' }),
  });
  await expect(restoreDialog).toBeVisible();
  await restoreDialog.getByLabel('Restore Comment (optional)').fill('restore smoke comment');
  await restoreDialog.getByRole('button', { name: 'Restore' }).click();

  await expect.poll(() => restoreRequestBody, { timeout: 10_000 }).not.toBe('');
  expect(JSON.parse(restoreRequestBody) as { comment: string }).toEqual({
    comment: 'restore smoke comment',
  });
  expect(nativeDialogCount).toBe(0);
});

test('auth probe 401 on focus stays silent and does not force session-expired dialog', async ({ page }) => {
  await loginAsAdmin(page);

  let forcedMeFailures = 0;
  let refreshAttempts = 0;

  await page.route('**/api/auth/me', async (route) => {
    if (forcedMeFailures === 0) {
      forcedMeFailures += 1;
      await route.fulfill({
        status: 401,
        contentType: 'application/json',
        headers: {
          'x-nauthilus-auth-required': '1',
        },
        body: JSON.stringify({ error: 'Not authenticated' }),
      });
      return;
    }

    await route.continue();
  });

  await page.route('**/api/auth/refresh', async (route) => {
    refreshAttempts += 1;
    await route.fulfill({
      status: 401,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'Refresh session required' }),
    });
  });

  // Wait past debounce and trigger the focus probe explicitly.
  await page.waitForTimeout(1700);
  await page.evaluate(() => {
    window.dispatchEvent(new Event('focus'));
  });

  await expect.poll(() => forcedMeFailures, { timeout: 10_000 }).toBe(1);
  await expect.poll(() => refreshAttempts, { timeout: 10_000 }).toBe(1);
  await expect(page.getByRole('heading', { name: 'Session expired' })).toHaveCount(0);
});

test('dev proxy requests stay on the UI origin to avoid split-session backends', async ({ page }) => {
  const seenProxyOrigins = new Set<string>();

  await page.route('**/api/runtime/**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        connection: {
          backend_url: 'https://runtime.example.invalid',
          basic_auth: {
            enabled: false,
            username: '',
            password: '',
          },
          oidc_auth: {
            enabled: false,
            client_id: '',
            client_secret: '',
            token: '',
            expires_at: 0,
          },
        },
        hooks: {},
      }),
    });
  });

  await page.route('**/proxy/**', async (route) => {
    const requestURL = route.request().url();
    seenProxyOrigins.add(new URL(requestURL).origin);

    const pathname = new URL(requestURL).pathname;
    if (pathname.endsWith('/proxy/ping')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ status: 'ok' }),
      });
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({}),
    });
  });

  await loginAsAdmin(page);
  const uiOrigin = new URL(page.url()).origin;
  await clickMenu(page, 'Connection');

  await expect.poll(() => seenProxyOrigins.size, { timeout: 10_000 }).toBeGreaterThan(0);
  expect(Array.from(seenProxyOrigins)).toEqual([uiOrigin]);
});

test('LDAP search protocols no longer show the removed webauthn credentials filter', async ({ page }) => {
  await loginAsAdmin(page);
  await clickMenu(page, 'LDAP');
  await expect(page.getByText('LDAP Configuration', { exact: false }).first()).toBeVisible();

  await page.getByRole('tab', { name: 'Search Protocols' }).click();
  await page.getByRole('button', { name: 'Add Search Protocol' }).click();

  await expect(page.getByLabel('User Filter').first()).toBeVisible();
  await expect(page.getByLabel('List Accounts Filter').first()).toBeVisible();
  await expect(page.getByLabel('WebAuthn Credentials Filter')).toHaveCount(0);
});

test('OIDC clients and SAML service providers are editable via selectors', async ({ page }) => {
  await loginAsAdmin(page);
  await clickMenu(page, 'Frontend');
  await expect(page.getByText('Frontend & IdP Configuration', { exact: false }).first()).toBeVisible();

  const oidcSection = page.locator('#oidc-content');
  await page.locator('#oidc-header').click();
  await oidcSection.getByRole('button', { name: 'OIDC Clients' }).click();
  await expect(oidcSection.getByRole('button', { name: 'Add OIDC Client' })).toBeVisible();

  await oidcSection.getByRole('button', { name: 'Add OIDC Client' }).click();
  const oidcClientCard = oidcSection.locator('.MuiCard-root').filter({
    has: page.getByRole('button', { name: 'Remove Client' }),
  }).first();
  await oidcClientCard.getByLabel('Name').fill('Alpha Client');
  await oidcClientCard.getByLabel('Client ID').fill('alpha-client-id');

  await oidcSection.getByRole('button', { name: 'Add OIDC Client' }).click();
  await oidcSection.locator('#oidc-client-selector').click();
  await page.getByRole('listbox').last().getByRole('option').last().click();
  await oidcClientCard.getByLabel('Name').fill('Beta Client');
  await oidcClientCard.getByLabel('Client ID').fill('beta-client-id');

  await oidcSection.locator('#oidc-client-selector').click();
  await expect(page.getByRole('option', { name: 'Alpha Client (alpha-client-id)' })).toBeVisible();
  await expect(page.getByRole('option', { name: 'Beta Client (beta-client-id)' })).toBeVisible();
  await page.keyboard.press('Escape');

  const samlSection = page.locator('#saml2-content');
  await page.locator('#saml2-header').click();
  await samlSection.getByRole('button', { name: 'Service Providers' }).click();
  await expect(samlSection.getByRole('button', { name: 'Add Service Provider' })).toBeVisible();

  await samlSection.getByRole('button', { name: 'Add Service Provider' }).click();
  const serviceProviderCard = samlSection.locator('.MuiCard-root').filter({
    has: page.getByRole('button', { name: 'Remove Service Provider' }),
  }).first();
  await serviceProviderCard.getByLabel('Name').fill('SP Alpha');
  await serviceProviderCard.getByLabel('Entity ID').fill('sp-alpha-entity');

  await samlSection.getByRole('button', { name: 'Add Service Provider' }).click();
  await samlSection.locator('#saml-service-provider-selector').click();
  await page.getByRole('listbox').last().getByRole('option').last().click();
  await serviceProviderCard.getByLabel('Name').fill('SP Beta');
  await serviceProviderCard.getByLabel('Entity ID').fill('sp-beta-entity');

  await samlSection.locator('#saml-service-provider-selector').click();
  await expect(page.getByRole('option', { name: 'SP Alpha (sp-alpha-entity)' })).toBeVisible();
  await expect(page.getByRole('option', { name: 'SP Beta (sp-beta-entity)' })).toBeVisible();
});

test('backend action buttons stay right aligned and outside the backend selector field', async ({ page }) => {
  await loginAsAdmin(page);
  await clickMenu(page, 'Backends');
  await expect(page.getByText('Backends Configuration', { exact: false }).first()).toBeVisible();

  const firstBackendSelector = page.locator('#backend-type-0').first();
  if (await firstBackendSelector.count() === 0) {
    await page.getByRole('button', { name: 'Add Backend' }).click();
  }

  const selector = page.locator('#backend-type-0').first();
  const actions = page.getByTestId('backend-actions-0');
  const row = actions.locator('xpath=ancestor::li[1]');

  await expect(selector).toBeVisible();
  await expect(actions).toBeVisible();
  await expect(row).toBeVisible();

  const selectorBox = await selector.boundingBox();
  const actionsBox = await actions.boundingBox();
  const rowBox = await row.boundingBox();

  expect(selectorBox).not.toBeNull();
  expect(actionsBox).not.toBeNull();
  expect(rowBox).not.toBeNull();

  if (!selectorBox || !actionsBox || !rowBox) {
    return;
  }

  const selectorRightEdge = selectorBox.x + selectorBox.width;
  const actionsLeftEdge = actionsBox.x;
  const actionsRightGap = (rowBox.x + rowBox.width) - (actionsBox.x + actionsBox.width);

  expect(actionsLeftEdge).toBeGreaterThan(selectorRightEdge - 4);
  expect(actionsRightGap).toBeLessThan(40);
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

test('brute-force list action does not overlap on iPhone width', async ({ page }) => {
  await page.setViewportSize({ width: 402, height: 874 });
  await mockBruteForceRuntime(page);
  await loginAsAdmin(page);

  await page.goto('/bruteforce');
  await expect(page.getByText('Brute Force Protection Management')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Refresh List' })).toBeVisible();

  const freeButton = page.getByRole('button', { name: /^Free$/ }).first();
  await expect(freeButton).toBeVisible();
  const layout = await freeButton.evaluate((button) => {
    const row = button.closest('.MuiListItem-root');
    const primaryText = row?.querySelector('.MuiListItemText-primary');
    const secondaryAction = row?.querySelector('.MuiListItemSecondaryAction-root');
    const buttonRect = button.getBoundingClientRect();
    const primaryRect = primaryText?.getBoundingClientRect();
    const buttonStyle = window.getComputedStyle(button);

    return {
      hasSecondaryAction: Boolean(secondaryAction),
      buttonWidth: Math.round(buttonRect.width),
      buttonTop: Math.round(buttonRect.top),
      primaryBottom: primaryRect ? Math.round(primaryRect.bottom) : null,
      buttonDisplay: buttonStyle.display,
    };
  });

  expect(layout.hasSecondaryAction).toBe(false);
  expect(layout.buttonWidth).toBeGreaterThan(200);
  expect(layout.buttonDisplay.includes('flex')).toBe(true);
  expect(layout.primaryBottom).not.toBeNull();
  expect(layout.buttonTop).toBeGreaterThanOrEqual(layout.primaryBottom as number);
});
