import { expect, test } from '@playwright/test';
import { BACK, openApp, seedWorkspace, setAngle } from './helpers';

test('smoke: scena gotowa, stół z trzema kartami widoczny z Back', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await openApp(page);
    await seedWorkspace(page);
    await setAngle(page, BACK);
    const table = page.getByRole('region', { name: 'Stół roboczy' });
    await expect(table).toBeVisible();
    await expect(table.getByRole('article')).toHaveCount(3);
    expect(errors).toEqual([]);
});
