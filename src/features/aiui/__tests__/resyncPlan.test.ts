// Niezmiennik odtwarzalności (profil §7.8, A1): stan profilu/1 jest legalny tylko, gdy kanoniczny plan resync —
// łącznie z odtworzeniem pustych miejsc — mieści się w ≤ 1024 częściach, ≤ 16 MiB i ≤ 256 KiB na część.
// Kontrprzykład Astry (1025 pustych miejsc) i przypadki graniczne; plan bez pustych miejsc odtwarza stan reducerem.

import { describe, expect, it } from 'vitest';
import { CATALOG_ID, parseEvent, type A2Component } from '../contract';
import { initialCoreState, reduce, type CoreState, type Surface } from '../reducer';
import { PROFILE_RULES } from '../transport/profile';
import { isResyncable, messageBytes, resyncPlan } from '../transport/resyncPlan';

const surface = (data: Record<string, unknown>, components: A2Component[] = []): Surface => ({
    catalogId: CATALOG_ID,
    components: Object.fromEntries(components.map((c) => [c.id, c])),
    data,
});
const state = (surfaces: CoreState['surfaces']): CoreState => ({ ...initialCoreState(), surfaces });
const holesArray = (n: number) => Array.from({ length: n }, () => undefined);
// stałe narzuty planu dla jednego surface'u bez komponentów: createSurface + podstawa danych + stage + narration
const FIXED_PARTS = 4;

describe('niezmiennik odtwarzalności: liczba części', () => {
    it('kontrprzykład Astry: 1025 pustych miejsc — stan NIEodtwarzalny (MAX_PARTS)', () => {
        const plan = resyncPlan(state({ workspace: surface({ rows: holesArray(1025) }) }));
        expect(plan.ok).toBe(false);
        if (plan.ok) return;
        expect(plan.reason).toBe('MAX_PARTS');
        expect(isResyncable(state({ workspace: surface({ rows: holesArray(1025) }) }))).toBe(false);
    });

    it(`przypadek graniczny: dokładnie ${PROFILE_RULES.resync.maxParts} części — stan odtwarzalny`, () => {
        const holes = PROFILE_RULES.resync.maxParts - FIXED_PARTS; // 1020
        const plan = resyncPlan(state({ workspace: surface({ rows: holesArray(holes) }) }));
        expect(plan.ok).toBe(true);
        expect(plan.partCount).toBe(PROFILE_RULES.resync.maxParts);
    });

    it('o jedną część za dużo (1025) — MAX_PARTS', () => {
        const plan = resyncPlan(state({ workspace: surface({ rows: holesArray(PROFILE_RULES.resync.maxParts - FIXED_PARTS + 1) }) }));
        expect(plan.ok).toBe(false);
        if (!plan.ok) expect(plan.reason).toBe('MAX_PARTS');
    });

    it('puste miejsca: podstawa niesie null, a każde miejsce ma osobną część z path bez value (A2)', () => {
        const plan = resyncPlan(state({ workspace: surface({ rows: [10, undefined, 30, undefined] }) }));
        expect(plan.ok).toBe(true);
        if (!plan.ok) return;
        const data = plan.parts.filter((p) => (p as { updateDataModel?: unknown }).updateDataModel) as { updateDataModel: { path?: string; value?: unknown } }[];
        expect(JSON.parse(JSON.stringify(data[0].updateDataModel.value))).toEqual({ rows: [10, null, 30, null] });
        expect(data.slice(1).map((d) => d.updateDataModel)).toEqual([
            { surfaceId: 'workspace', path: '/rows/1' },
            { surfaceId: 'workspace', path: '/rows/3' },
        ]);
    });
});

describe('niezmiennik odtwarzalności: rozmiar', () => {
    const big = (kib: number) => 'x'.repeat(kib * 1024);

    it('przykład Astry 2 × 150 KiB: stan większy niż jedna część jest odtwarzalny (podział po kluczach)', () => {
        const plan = resyncPlan(state({ workspace: surface({ a: big(150), b: big(150) }) }));
        expect(plan.ok).toBe(true);
        if (!plan.ok) return;
        const paths = plan.parts.flatMap((p) => {
            const u = (p as { updateDataModel?: { path?: string; value?: unknown } }).updateDataModel;
            return u ? [u.path ?? '(podstawa)'] : [];
        });
        expect(paths).toEqual(['(podstawa)', '/a', '/b']);
        for (const p of plan.parts) expect(messageBytes(p)).toBeLessThanOrEqual(PROFILE_RULES.limits.messageMaxBytes);
    });

    it('łącznie > 16 MiB (70 × 250 KiB) — MAX_BYTES mimo małej liczby części', () => {
        const data = Object.fromEntries(Array.from({ length: 70 }, (_, i) => [`k${i}`, big(250)]));
        const plan = resyncPlan(state({ workspace: surface(data) }));
        expect(plan.ok).toBe(false);
        if (plan.ok) return;
        expect(plan.reason).toBe('MAX_BYTES');
        expect(plan.partCount).toBeLessThan(PROFILE_RULES.resync.maxParts);
    });

    it('64 × 250 KiB mieści się w 16 MiB — odtwarzalny', () => {
        const data = Object.fromEntries(Array.from({ length: 64 }, (_, i) => [`k${i}`, big(250)]));
        const plan = resyncPlan(state({ workspace: surface(data) }));
        expect(plan.ok).toBe(true);
        expect(plan.bytes).toBeLessThanOrEqual(PROFILE_RULES.resync.maxBytes);
    });

    it('niepodzielna wartość > 256 KiB (tablica) — PART_TOO_LARGE', () => {
        const plan = resyncPlan(state({ workspace: surface({ rows: Array.from({ length: 3 }, () => big(100)) }) }));
        expect(plan.ok).toBe(false);
        if (!plan.ok) expect(plan.reason).toBe('PART_TOO_LARGE');
    });
});

describe('plan kanoniczny odtwarza stan (bez pustych miejsc)', () => {
    it('zastosowany reducerem na pustym stanie daje te same surface\'y, stage i narration', () => {
        const components: A2Component[] = [
            { id: 'root', component: 'Workspace', children: ['c1'] },
            { id: 'c1', component: 'WorkspaceItem', kind: 'chart', title: 'T', representations: ['chart2d'], presentation: 'card', content: { path: '/c1' } },
        ];
        const original: CoreState = {
            surfaces: {
                workspace: surface({ c1: { series: [{ name: 'a', points: [1, 2] }] }, big: { x: 'y'.repeat(200 * 1024), z: 'w'.repeat(100 * 1024) } }, components),
                hud: surface({}, [{ id: 'root', component: 'TaskList', tasks: [] }]),
            },
            stage: { focus: 'back', drawer: 'open' },
            narration: { text: 'Gotowe.', speaker: 'amber' },
        };
        const plan = resyncPlan(original);
        expect(plan.ok).toBe(true);
        if (!plan.ok) return;
        let s: CoreState = initialCoreState();
        for (const raw of plan.parts) {
            const ev = parseEvent(JSON.parse(JSON.stringify(raw))); // każda część przechodzi granicę protokołu
            expect(ev).not.toBeNull();
            s = reduce(s, ev!).state;
        }
        expect(s.surfaces).toEqual(original.surfaces);
        expect(s.stage).toEqual(original.stage);
        expect(s.narration.text).toBe(original.narration.text);
    });

    it('deterministyczny: ten sam stan daje identyczny plan', () => {
        const st = state({ workspace: surface({ a: 1, rows: [1, undefined] }), hud: surface({ t: 'x' }) });
        expect(JSON.stringify(resyncPlan(st))).toBe(JSON.stringify(resyncPlan(st)));
    });
});
