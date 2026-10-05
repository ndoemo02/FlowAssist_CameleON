// Gesty kart na stole (desktop): zapisy tylko na końcu gestu, anulowanie przy zmianie od agenta (ADR 0001, I7).
// Regresja E2E-1 (docs/adr/0006): kontener stołu bez `preserve-3d`, więc pointerdown trafia w kartę.
import { expect, test } from '@playwright/test';
import { BACK, countLayoutWrites, dispatch, hittablePoint, item, layout, openApp, seedWorkspace, setAngle } from './helpers';

test.describe('gesty kart (desktop)', () => {
    test.beforeEach(async ({ page }, info) => {
        test.skip(info.project.name !== 'desktop', 'swobodne gesty tylko na desktopie (compact: przyciski)');
        await openApp(page);
        await seedWorkspace(page);
        await setAngle(page, BACK);
    });

    test('drag: raise na starcie, brak zapisów geometrii w trakcie, jeden commit na końcu', async ({ page }) => {
        const p = await hittablePoint(page, 'Element kpis');
        const writes = await countLayoutWrites(page);
        const before = (await layout(page)).kpis;
        await page.mouse.move(p.x, p.y);
        await page.mouse.down();
        await page.mouse.move(p.x + 5, p.y + 2);
        const afterStart = await writes(); // raise
        for (let i = 1; i <= 10; i++) await page.mouse.move(p.x + 5 + i * 8, p.y + 2 + i * 3);
        expect(await writes()).toBe(afterStart); // brak zapisów w trakcie ruchu
        await page.mouse.up();
        expect(await writes()).toBe(afterStart + 1); // jeden commit końcowy
        expect(afterStart).toBe(1);
        const after = (await layout(page)).kpis;
        expect(after.x).toBeGreaterThan(before.x);
    });

    test('zmiana od agenta w trakcie drag anuluje gest bez zapisu (rev)', async ({ page }) => {
        const p = await hittablePoint(page, 'Element table');
        const before = (await layout(page)).table;
        await page.mouse.move(p.x, p.y);
        await page.mouse.down();
        for (let i = 1; i <= 5; i++) await page.mouse.move(p.x + i * 10, p.y + i * 4);
        await dispatch(page, { version: 'v0.9.1', updateComponents: { surfaceId: 'workspace', components: [item('table', 'table', 'table2d', 3, { presentation: 'focus' })] } });
        for (let i = 6; i <= 8; i++) await page.mouse.move(p.x + i * 10, p.y + i * 4);
        await page.mouse.up();
        const after = (await layout(page)).table;
        expect([after.x, after.y]).toEqual([before.x, before.y]);
        expect(after.presentation).toBe('focus');
    });

    // E2E-2 (ADR 0006): @use-gesture zgłasza pointercancel jako zwykły koniec gestu — anulowanie nie może nic zapisać.
    test('pointercancel w trakcie drag nie zapisuje geometrii', async ({ page }) => {
        const card = page.getByRole('article', { name: 'Element table' });
        const p = await hittablePoint(page, 'Element table');
        const before = (await layout(page)).table;
        const restTransform = await card.evaluate((el) => (el as HTMLElement).style.transform);
        await page.mouse.move(p.x, p.y);
        await page.mouse.down();
        for (let i = 1; i <= 5; i++) await page.mouse.move(p.x + i * 10, p.y + i * 4);
        expect(await card.evaluate((el) => (el as HTMLElement).style.transform)).not.toBe(restTransform); // gest trwa
        await card.dispatchEvent('pointercancel', { pointerId: 1, bubbles: true });
        await page.mouse.up();
        const after = (await layout(page)).table;
        expect([after.x, after.y]).toEqual([before.x, before.y]);
        expect(await card.evaluate((el) => (el as HTMLElement).style.transform)).toBe(restTransform); // transform przywrócony
    });

    test('pointercancel w trakcie zmiany rozmiaru nie zapisuje skali', async ({ page }) => {
        const card = page.getByRole('article', { name: 'Element table' });
        const handle = card.locator('[aria-label="Zmień rozmiar"]');
        const box = (await handle.boundingBox())!;
        const hx = box.x + box.width / 2, hy = box.y + box.height / 2;
        const before = (await layout(page)).table;
        const restTransform = await card.evaluate((el) => (el as HTMLElement).style.transform);
        await page.mouse.move(hx, hy);
        await page.mouse.down();
        for (let i = 1; i <= 5; i++) await page.mouse.move(hx + i * 12, hy + i * 12);
        expect(await card.evaluate((el) => (el as HTMLElement).style.transform)).not.toBe(restTransform); // gest trwa
        await handle.dispatchEvent('pointercancel', { pointerId: 1, bubbles: true });
        await page.mouse.up();
        expect((await layout(page)).table.scale).toBe(before.scale);
        expect(await card.evaluate((el) => (el as HTMLElement).style.transform)).toBe(restTransform);
    });

    test('podwójny tap wysyła kartę na ekran', async ({ page }) => {
        const p = await hittablePoint(page, 'Element kpis');
        await page.mouse.click(p.x, p.y);
        await page.mouse.click(p.x, p.y);
        await expect.poll(async () => (await layout(page)).kpis.presentation).toBe('screen');
    });
});
