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

test('admin can log in and open critical routes', async ({ page }, testInfo) => {
  const routeDurations: Record<string, number> = {};
  const consoleErrors: string[] = [];

  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      consoleErrors.push(msg.text());
    }
  });

  await page.goto('/');
  await page.getByLabel('Username').fill('admin');
  await page.getByLabel('Password').fill('admin');

  const loginStart = Date.now();
  await page.getByRole('button', { name: /login/i }).click();
  await expect(page.getByText('Server Configuration')).toBeVisible();
  routeDurations.Login = Date.now() - loginStart;

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
