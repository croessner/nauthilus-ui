import { expect, test } from '@playwright/test';

type ClickhouseRow = Record<string, string | number>;

const loginAsAdmin = async (page: import('@playwright/test').Page): Promise<void> => {
  await page.goto('/');
  await page.getByLabel('Username').fill('admin');
  await page.getByLabel('Password').fill('admin');
  await page.getByRole('button', { name: /login/i }).click();
  await expect(page.getByText('Server Configuration')).toBeVisible();
};

const buildMeta = (columns: string[]): Array<{ name: string; type: string }> => (
  columns.map((name) => ({
    name,
    type: name === 'ts' ? 'DateTime64(3, UTC)' : 'String',
  }))
);

const mockClickhouseRoutes = async (
  page: import('@playwright/test').Page,
  columns: string[],
  data: ClickhouseRow[],
): Promise<void> => {
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
            columns,
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
            meta: buildMeta(columns),
            data,
          },
        },
      }),
    });
  });
};

const openClickhouseAndRefresh = async (page: import('@playwright/test').Page, marker: string): Promise<void> => {
  await loginAsAdmin(page);
  await page.goto('/runtime-clickhouse');

  const endpointInput = page.getByLabel('Hook endpoint (path)');
  await expect(endpointInput).toBeVisible();
  const enabledSwitch = page.locator('input[type="checkbox"]').first();
  if ((await endpointInput.inputValue()).trim() === '') {
    await endpointInput.fill('/api/v1/custom/clickhouse-query');
  }
  if (!(await enabledSwitch.isChecked())) {
    await enabledSwitch.click();
  }

  await page.getByRole('button', { name: /^Refresh$/ }).click();
  await expect(page.getByText(marker)).toBeVisible({ timeout: 15_000 });
};

test('expanded clickhouse details stay horizontally anchored while data cells scroll', async ({ page }) => {
  const columns = [
    'ts', 'session', 'service', 'features', 'client_ip', 'client_port', 'client_net',
    'client_id', 'hostname', 'proto', 'method', 'user_agent', 'local_ip', 'local_port',
    'display_name', 'account', 'username', 'password_hash',
  ];

  const rows: ClickhouseRow[] = [
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
  ];

  await mockClickhouseRoutes(page, columns, rows);
  await openClickhouseAndRefresh(page, 'sess-a');

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

    const expandedPanel = table.querySelector('[data-testid="clickhouse-expanded-panel"]') as HTMLElement | null;
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

test('expanded panel stays right of sticky column when table has no horizontal overflow', async ({ page }) => {
  const columns = ['ts', 'client_ip', 'username'];
  const rows: ClickhouseRow[] = [
    {
      ts: '2026-03-25 16:20:00.000',
      client_ip: '192.168.0.182',
      username: 'zabbix_mail',
    },
    {
      ts: '2026-03-25 16:19:59.000',
      client_ip: '80.151.163.64',
      username: 'root',
    },
  ];

  await mockClickhouseRoutes(page, columns, rows);
  await openClickhouseAndRefresh(page, 'zabbix_mail');

  await page.evaluate(() => {
    const table = document.querySelector('table');
    if (!table) throw new Error('Table not found');

    for (const cell of table.querySelectorAll('thead th:first-child, tbody tr td:first-child')) {
      const element = cell as HTMLElement;
      element.style.width = '120px';
      element.style.minWidth = '120px';
      element.style.maxWidth = '120px';
    }
  });

  await page.getByRole('button', { name: 'Expand row' }).first().click();
  await expect(page.getByTestId('clickhouse-expanded-panel').first()).toBeVisible();

  const layout = await page.evaluate(() => {
    const table = document.querySelector('table');
    if (!table) throw new Error('Table not found');

    const expandedPanel = table.querySelector('[data-testid="clickhouse-expanded-panel"]') as HTMLElement | null;
    if (!expandedPanel) throw new Error('Expanded panel not found');

    const stickyCell = table.querySelector('tbody tr td:first-child') as HTMLElement | null;
    if (!stickyCell) throw new Error('Sticky cell not found');

    let scroller: HTMLElement | null = table.parentElement;
    while (scroller) {
      const style = window.getComputedStyle(scroller);
      const hasHorizontalScrollContext = style.overflowX === 'auto' || style.overflowX === 'scroll';
      if (hasHorizontalScrollContext) break;
      scroller = scroller.parentElement;
    }
    if (!scroller) throw new Error('Scroller not found');

    const panelLeft = expandedPanel.getBoundingClientRect().left;
    const stickyRight = stickyCell.getBoundingClientRect().right;

    return {
      hasHorizontalOverflow: scroller.scrollWidth > scroller.clientWidth + 1,
      gapPx: panelLeft - stickyRight,
    };
  });

  expect(layout.hasHorizontalOverflow).toBe(false);
  expect(layout.gapPx).toBeGreaterThanOrEqual(6);
});

test('expanding a row after scrolling does not jump back to the first expanded row', async ({ page }) => {
  const columns = ['ts', 'client_ip', 'username'];
  const rows: ClickhouseRow[] = Array.from({ length: 90 }, (_, i) => ({
    ts: `2026-03-25 16:${String(59 - Math.floor(i / 2)).padStart(2, '0')}:${String(i % 60).padStart(2, '0')}.000`,
    client_ip: `203.0.113.${(i % 200) + 1}`,
    username: `user-${String(i).padStart(3, '0')}`,
  }));

  await mockClickhouseRoutes(page, columns, rows);
  await openClickhouseAndRefresh(page, 'user-000');

  await page.getByRole('button', { name: 'Expand row' }).first().click();
  await expect(page.getByTestId('clickhouse-expanded-panel').first()).toBeVisible();

  const targetRow = page.locator('tbody tr', { hasText: 'user-070' }).first();
  await targetRow.scrollIntoViewIfNeeded();
  const scrollBefore = await page.evaluate(() => window.scrollY);

  await targetRow.getByRole('button', { name: 'Expand row' }).click();
  await expect(targetRow).toBeVisible();

  const scrollAfter = await page.evaluate(() => window.scrollY);
  expect(Math.abs(scrollAfter - scrollBefore)).toBeLessThan(220);
});
