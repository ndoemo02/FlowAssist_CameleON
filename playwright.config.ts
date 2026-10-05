// Harness przeglądarkowy CameleON (plan v1.3.2, P0.1). Tylko Chromium; deterministyczne testy DOM
// uzupełniające vitest (logika) — operator przeglądarki (agent-browser) służy tylko do eksploracji.
// Stan aplikacji ustawiany przez dev-hook window.__aiui (dostępny wyłącznie poza produkcją → next dev).

import { defineConfig, devices } from '@playwright/test';

const PORT = Number(process.env.E2E_PORT ?? 3100);

export default defineConfig({
    testDir: './e2e',
    outputDir: './test-results/e2e',
    // baseline bez sufiksu platformy (jedna maszyna referencyjna; Chromium)
    snapshotPathTemplate: '{testDir}/__snapshots__/{testFileName}/{arg}-{projectName}{ext}',
    fullyParallel: false,
    workers: 1, // jedna scena WebGL naraz (pamięć, SwiftShader)
    retries: 0, // flaki mają być widoczne, nie maskowane
    timeout: 120_000,
    expect: { timeout: 15_000 },
    reporter: [['list'], ['html', { outputFolder: './test-results/e2e-report', open: 'never' }]],
    use: {
        baseURL: `http://localhost:${PORT}`,
        trace: 'retain-on-failure',
        screenshot: 'only-on-failure',
        reducedMotion: 'no-preference',
        colorScheme: 'dark',
        launchOptions: {
            // WebGL w headless: programowy renderer (logika i kliknięcia, NIE pomiary FPS)
            args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
        },
    },
    projects: [
        { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
        { name: 'compact', use: { ...devices['Desktop Chrome'], viewport: { width: 844, height: 390 }, hasTouch: true } },
    ],
    webServer: {
        command: `npx next dev -p ${PORT}`,
        url: `http://localhost:${PORT}`,
        reuseExistingServer: true,
        timeout: 180_000,
    },
});
