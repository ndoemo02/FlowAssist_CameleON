// @vitest-environment jsdom
// P0.5 (ADR 0006, A11Y-2): wykres to `role="img"`, więc zawsze potrzebuje niepustej nazwy dostępnej —
// także gdy agent nie podał opcjonalnego `title`. Pozostałe naruszenia axe (A11Y-1, A11Y-3) pilnuje baseline e2e.

import { afterEach, describe, expect, it } from 'vitest';
import Chart from '../components/Chart';
import { render, type Rendered } from './fixtures/render';

let mounted: Rendered[] = [];
afterEach(() => { mounted.forEach((r) => r.unmount()); mounted = []; });
const mount = (el: Parameters<typeof render>[0]) => { const r = render(el); mounted.push(r); return r; };

const series = [
    { label: '2025', points: [{ x: 'Q1', y: 1 }, { x: 'Q2', y: 2 }] },
    { label: 'Plan 2026', points: [{ x: 'Q1', y: 2 }, { x: 'Q2', y: 3 }] },
];
const label = (r: Rendered) => r.container.querySelector('svg[role="img"]')?.getAttribute('aria-label') ?? '';

describe('A11Y-2: nazwa dostępna wykresu', () => {
    it('z tytułem: nazwa = tytuł', () => {
        expect(label(mount(<Chart kind="line" title="Zapytania" series={series} onAction={() => {}} />))).toBe('Zapytania');
    });

    it('bez tytułu: niepusta nazwa z rodzajem wykresu i etykietami serii', () => {
        const name = label(mount(<Chart kind="bar" series={series} onAction={() => {}} />));
        expect(name).toContain('słupkowy');
        expect(name).toContain('2025');
        expect(name).toContain('Plan 2026');
    });
});
