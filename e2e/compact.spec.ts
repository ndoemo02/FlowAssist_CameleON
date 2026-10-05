// Compact (telefon w poziomie 844×390): natywny scroll paska kart, przyciski zamiast gestów (E13).
import { expect, test } from '@playwright/test';
import { BACK, layout, openApp, seedWorkspace, setAngle } from './helpers';

test('compact: pasek kart przewija się natywnie bez zmiany układu; operacje przyciskami', async ({ page }, info) => {
    test.skip(info.project.name !== 'compact', 'tylko compact');
    await openApp(page);
    await seedWorkspace(page);
    await setAngle(page, BACK);
    const table = page.getByRole('region', { name: 'Stół roboczy' });
    await expect(table.getByRole('article')).toHaveCount(3);
    const strip = table.locator(':scope > div.overflow-x-auto'); // pasek kart (nie wewnętrzny scroll tabeli)

    await test.step('natywny scroll poziomy paska nie zapisuje układu', async () => {
        const before = await layout(page);
        const box = (await strip.boundingBox())!;
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
        await page.mouse.wheel(400, 0);
        await expect.poll(() => strip.evaluate((el) => el.scrollLeft)).toBeGreaterThan(0);
        expect(await layout(page)).toEqual(before);
    });

    await test.step('karta w compact ma przyciski; „+” poszerza kartę w pasku', async () => {
        const card = table.getByRole('article', { name: 'Element kpis' });
        await card.scrollIntoViewIfNeeded();
        await expect(card.getByRole('button', { name: 'Na ekran' })).toBeVisible();
        const w0 = (await card.boundingBox())!.width;
        await card.getByRole('button', { name: 'Powiększ' }).click();
        await expect.poll(async () => (await card.boundingBox())!.width).toBeGreaterThan(w0);
        expect((await layout(page)).kpis.scale).toBeCloseTo(1.15, 5);
    });

    await test.step('„Na ekran” przenosi element na ekran (kamera na Front)', async () => {
        const card = table.getByRole('article', { name: 'Element kpis' });
        await card.getByRole('button', { name: 'Na ekran' }).click();
        expect((await layout(page)).kpis.presentation).toBe('screen');
        await expect.poll(() => page.evaluate(() =>
            (window as unknown as { __aiui: { getState(): { stage: { focus: string } } } }).__aiui.getState().stage.focus)).toBe('front');
    });
});
