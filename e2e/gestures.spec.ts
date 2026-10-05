// Gesty kart na stole (desktop): zapisy tylko na końcu gestu, anulowanie przy zmianie od agenta (ADR 0001, I7).
//
// ZABLOKOWANE przez E2E-1 (docs/adr/0005): w Chromium pointerdown w karcie trafia w kontener stołu
// z `transform-style: preserve-3d` (współpłaszczyznowe karty), więc gest w ogóle nie startuje — także w punkcie,
// który elementFromPoint wskazuje jako kartę. Testy są gotowe i zostaną włączone po decyzji właściciela w sprawie E2E-1.
import { expect, test } from '@playwright/test';
import { BACK, countLayoutWrites, dispatch, hittablePoint, item, layout, openApp, seedWorkspace, setAngle } from './helpers';

test.describe('gesty kart (desktop)', () => {
    test.fixme(true, 'E2E-1: hit-testing kart w kontenerze preserve-3d — czeka na decyzję właściciela');

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

    test('pointercancel w trakcie drag nie zapisuje geometrii', async ({ page }) => {
        const p = await hittablePoint(page, 'Element table');
        const before = (await layout(page)).table;
        await page.mouse.move(p.x, p.y);
        await page.mouse.down();
        for (let i = 1; i <= 5; i++) await page.mouse.move(p.x + i * 10, p.y + i * 4);
        await page.getByRole('article', { name: 'Element table' }).dispatchEvent('pointercancel', { pointerId: 1, bubbles: true });
        await page.mouse.up();
        const after = (await layout(page)).table;
        expect([after.x, after.y]).toEqual([before.x, before.y]);
    });

    test('podwójny tap wysyła kartę na ekran', async ({ page }) => {
        const p = await hittablePoint(page, 'Element kpis');
        await page.mouse.click(p.x, p.y);
        await page.mouse.click(p.x, p.y);
        await expect.poll(async () => (await layout(page)).kpis.presentation).toBe('screen');
    });
});
