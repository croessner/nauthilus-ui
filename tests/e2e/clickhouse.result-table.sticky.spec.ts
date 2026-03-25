import { expect, test } from '@playwright/test';

const loginAsAdmin = async (page: import('@playwright/test').Page): Promise<void> => {
  await page.goto('/');
  await page.getByLabel('Username').fill('admin');
  await page.getByLabel('Password').fill('admin');
  await page.getByRole('button', { name: /login/i }).click();
  await expect(page.getByText('Server Configuration')).toBeVisible();
};

test('expanded clickhouse details stay horizontally anchored while data cells scroll', async ({ page }) => {
  await page.route('**/api/runtime/**', async (route) => {
    if (route.request().method() !== 'GET') {
      await route.continue();
      return;
    }

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
        hooks: {
          clickhouse_query: {
            enabled: true,
            endpoint_path: '/api/v1/custom/clickhouse-query',
            columns: [
              'ts', 'session', 'service', 'features', 'client_ip', 'client_port', 'client_net',
              'client_id', 'hostname', 'proto', 'method', 'user_agent', 'local_ip', 'local_port',
              'display_name', 'account', 'username', 'password_hash',
            ],
          },
        },
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

  await page.route('**/proxy/hooks/any**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        status: 'success',
        clickhouse: {
          query_result: {
            meta: [
              { name: 'ts', type: 'DateTime64(3, UTC)' },
              { name: 'session', type: 'String' },
              { name: 'service', type: 'String' },
              { name: 'features', type: 'String' },
              { name: 'client_ip', type: 'String' },
              { name: 'client_port', type: 'String' },
              { name: 'client_net', type: 'String' },
              { name: 'client_id', type: 'String' },
              { name: 'hostname', type: 'String' },
              { name: 'proto', type: 'String' },
              { name: 'method', type: 'String' },
              { name: 'user_agent', type: 'String' },
              { name: 'local_ip', type: 'String' },
              { name: 'local_port', type: 'String' },
              { name: 'display_name', type: 'String' },
              { name: 'account', type: 'String' },
              { name: 'username', type: 'String' },
              { name: 'password_hash', type: 'String' },
            ],
            data: [
              {
                ts: '2026-03-25 16:20:00.000',
                session: 'sess-a',
                service: 'imap',
                features: 'f1',
                client_ip: '203.0.113.10',
                client_port: '50001',
                client_net: 'public',
                client_id: 'c1',
                hostname: 'mail-a',
                proto: 'imap',
                method: 'plain',
                user_agent: 'Mozilla/5.0 test-agent',
                local_ip: '10.0.0.10',
                local_port: '993',
                display_name: 'Alice',
                account: 'alice',
                username: 'alice',
                password_hash: 'hash-a',
              },
              {
                ts: '2026-03-25 16:19:59.000',
                session: 'sess-b',
                service: 'smtp',
                features: 'f2',
                client_ip: '203.0.113.11',
                client_port: '50002',
                client_net: 'public',
                client_id: 'c2',
                hostname: 'mail-b',
                proto: 'smtp',
                method: 'login',
                user_agent: 'Mozilla/5.0 second-test-agent',
                local_ip: '10.0.0.11',
                local_port: '587',
                display_name: 'Bob',
                account: 'bob',
                username: 'bob',
                password_hash: 'hash-b',
              },
            ],
          },
        },
      }),
    });
  });

  await loginAsAdmin(page);
  await page.goto('/runtime-clickhouse');
  await expect(page.getByRole('heading', { name: 'ClickHouse' })).toBeVisible();

  const endpointInput = page.getByLabel('Hook endpoint (path)');
  const enabledSwitch = page.locator('input[type="checkbox"]').first();
  if ((await endpointInput.inputValue()).trim() === '') {
    await endpointInput.fill('/api/v1/custom/clickhouse-query');
  }
  if (!(await enabledSwitch.isChecked())) {
    await enabledSwitch.click();
  }
  await page.getByRole('button', { name: /^Refresh$/ }).click();
  await expect(page.getByText('sess-a')).toBeVisible({ timeout: 15_000 });

  await page.getByRole('button', { name: 'Expand row' }).first().click();
  await expect(page.getByTestId('clickhouse-expanded-panel').first()).toBeVisible();

  const offsets = await page.evaluate(() => {
    const table = document.querySelector('table');
    if (!table) throw new Error('Table not found');

    let scroller: HTMLElement | null = table.parentElement;
    while (scroller) {
      const style = window.getComputedStyle(scroller);
      const isScrollable = (style.overflowX === 'auto' || style.overflowX === 'scroll') && scroller.scrollWidth > scroller.clientWidth;
      if (isScrollable) break;
      scroller = scroller.parentElement;
    }
    if (!scroller) throw new Error('Horizontal scroller not found');

    const expandedPanel = table.querySelector('[data-testid=\"clickhouse-expanded-panel\"]') as HTMLElement | null;
    if (!expandedPanel) throw new Error('Expanded panel not found');

    const dataCell = table.querySelector('tbody tr td:nth-child(3)') as HTMLElement | null;
    if (!dataCell) throw new Error('Data cell not found');

    const beforePanelLeft = expandedPanel.getBoundingClientRect().left;
    const beforeCellLeft = dataCell.getBoundingClientRect().left;

    scroller.scrollLeft += 180;

    const afterPanelLeft = expandedPanel.getBoundingClientRect().left;
    const afterCellLeft = dataCell.getBoundingClientRect().left;

    return {
      panelDelta: afterPanelLeft - beforePanelLeft,
      cellDelta: afterCellLeft - beforeCellLeft,
    };
  });

  expect(Math.abs(offsets.panelDelta)).toBeLessThan(3);
  expect(offsets.cellDelta).toBeLessThan(-100);
});
