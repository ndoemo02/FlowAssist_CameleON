// Korpus konformacji i replay (plan v1.3.2, P0.2). Fixture'y DOKUMENTUJĄ obecne zachowanie koordynatora;
// ślady (stan + efekty + komunikaty wychodzące) są zapisane w fixtures/traces/*.trace.json.
// Zmiana śladu = zmiana zachowania → przegląd, nie automatyczna aktualizacja.

import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import { speak } from '../tts';
import { replay, type Fixture } from './fixtures/replay';
import { researchFixture } from './fixtures/research';

vi.mock('../tts', () => ({ speak: vi.fn(), stopSpeaking: vi.fn() }));

const corpusDir = fileURLToPath(new URL('./fixtures/corpus/', import.meta.url));
const corpus: Fixture[] = [
    researchFixture,
    ...readdirSync(corpusDir).filter((f) => f.endsWith('.json')).sort()
        .map((f) => JSON.parse(readFileSync(corpusDir + f, 'utf-8')) as Fixture),
];

const speakMock = vi.mocked(speak);

describe('korpus: ślady replay', () => {
    for (const fixture of corpus) {
        it(`${fixture.id}: ślad zgodny z zapisanym`, async () => {
            const trace = replay(fixture, speakMock);
            await expect(JSON.stringify({ id: fixture.id, description: fixture.description, trace }, null, 1) + '\n')
                .toMatchFileSnapshot(`./fixtures/traces/${fixture.id}.trace.json`);
        });
    }

    it('replay jest deterministyczny (dwa odtworzenia = ten sam ślad)', () => {
        for (const fixture of corpus) expect(replay(fixture, speakMock)).toEqual(replay(fixture, speakMock));
    });
});

// Jawne asercje kluczowych punktów śladów. „OBS-n” = zachowanie udokumentowane w docs/adr/0005 —
// przypięte JAKO OBECNE, decyzja właściciela otwarta; zmiana wymaga decyzji, nie poprawki testu.

type State = {
    scenario: { status: string; run: number };
    stage: { focus: string; drawer: string };
    camera: { angle: number; source: string; tween: { to: number } | null };
    surfaces: Record<string, unknown>;
    views: Record<string, { status: string; representation?: string; reason?: string }>;
    layout: Record<string, { presentation: string; instance: string; rev: number; lastHint: string | null; x: number; y: number; z: number; scale: number }>;
};
const fx = (id: string) => corpus.find((f) => f.id === id)!;
const point = (id: string, label: string) => {
    const c = replay(fx(id), speakMock).find((x) => x.label === label);
    if (!c) throw new Error(`Brak checkpointu ${id}/${label}`);
    return { ...c, s: c.state as State };
};

describe('korpus: udokumentowane zachowanie', () => {
    it('00 research: akcje niosą migawkę układu; done dopiero po decyzji terminalnej', () => {
        const deep = point('00-research-full', 'deepened');
        expect(deep.effects.outgoing).toEqual([expect.objectContaining({
            action: expect.objectContaining({ name: 'deepen', context: { itemId: 'districts', workspace: { screen: 'districts', focus: null, dismissed: [] } } }),
        })]);
        expect(deep.s.scenario.status).toBe('awaiting_action');
        expect(deep.s.layout['district-map']).toMatchObject({ presentation: 'card', instance: '#4' });
        expect(point('00-research-full', 'approved').s.scenario.status).toBe('done');
    });

    it('01/02 streaming: brak komponentu lub danych = pending, wpis układu zarezerwowany (P6)', () => {
        expect(point('01-component-before-data', 'component-only').s.views.a.status).toBe('pending');
        expect(point('01-component-before-data', 'data-arrived').s.views.a).toEqual({ status: 'ready', representation: 'chart2d' });
        const reserved = point('02-data-before-component', 'child-not-delivered').s;
        expect(reserved.layout.a).toMatchObject({ presentation: 'card', lastHint: null });
        expect(point('02-data-before-component', 'delivered').s.layout.a).toMatchObject({ presentation: 'focus', instance: '#1', rev: 1 });
    });

    it('03 OBS-1: obcy katalog odrzucony po cichu (tylko console.warn, bez błędu do agenta)', () => {
        const c = point('03-unknown-catalog', 'foreign-catalog');
        expect(c.s.surfaces).toEqual({});
        expect(c.effects.outgoing).toEqual([]);
        expect(c.effects.warnings).toEqual(['[aiui] odrzucony komunikat (niezgodny z kontraktem):']);
        expect(point('03-unknown-catalog', 'update-without-surface').effects.outgoing)
            .toEqual([{ version: 'v0.9.1', error: expect.objectContaining({ code: 'SURFACE_NOT_FOUND' }) }]);
    });

    it('04 nieobsługiwana reprezentacja: wpis układu + fallback; koordynator nie raportuje (robi to warstwa UI)', () => {
        const c = point('04-unsupported-representation', 'unsupported');
        expect(c.s.layout.a.presentation).toBe('card');
        expect(c.s.views.a.status).toBe('fallback');
        expect(c.effects.outgoing).toEqual([]);
    });

    it('05 usunięcie i ponowne dodanie id: nowa instancja bez dismissed (P6)', () => {
        expect(point('05-delete-recreate', 'a-dismissed').s.layout.a).toMatchObject({ presentation: 'dismissed', instance: '#1' });
        expect(point('05-delete-recreate', 'a-removed').s.layout.a).toBeUndefined();
        expect(point('05-delete-recreate', 'a-recreated').s.layout.a).toMatchObject({ presentation: 'card', instance: '#3', rev: 0 });
    });

    it('06 OBS-5: hint dla ukrytego zapamiętany; przywrócenie daje card (zapamiętany hint nie jest stosowany)', () => {
        expect(point('06-dismissed-new-hint', 'hint-while-dismissed').s.layout.a).toMatchObject({ presentation: 'dismissed', lastHint: 'screen' });
        expect(point('06-dismissed-new-hint', 'restored').s.layout.a).toMatchObject({ presentation: 'card', lastHint: 'screen' });
    });

    it('07 P3: hint screen w okresie łaski nie rusza kamery; po okresie łaski rusza', () => {
        const during = point('07-manual-orbit-vs-screen-hint', 'screen-hint-during-grace');
        expect(during.s.layout.a.presentation).toBe('screen');
        expect(during.effects.tweens).toEqual([]);
        expect(during.s.camera).toMatchObject({ angle: 2, source: 'manual' });
        expect(point('07-manual-orbit-vs-screen-hint', 'screen-hint-after-grace').effects.tweens).toEqual([{ to: 0 }]);
    });

    it('08 duplikaty: createSurface → SURFACE_EXISTS bez resetu; updateDataModel bez efektów; narration+speak mówi ponownie', () => {
        expect(point('08-duplicates', 'duplicate-create').effects.outgoing)
            .toEqual([{ version: 'v0.9.1', error: expect.objectContaining({ code: 'SURFACE_EXISTS' }) }]);
        const data = point('08-duplicates', 'duplicate-data');
        expect([data.effects.tweens, data.effects.speak, data.effects.outgoing]).toEqual([[], [], []]);
        expect(point('08-duplicates', 'duplicate-narration').effects.speak).toEqual(['Witaj']);
    });

    it('08 OBS-2: stage.focus agenta przerywa ręczny obrót bez okresu łaski — także gdy nie zmienia stage', () => {
        const c = point('08-duplicates', 'stage-back-after-manual-orbit');
        expect(c.s.stage.focus).toBe('back'); // stan bez zmiany (już było 'back')…
        expect(c.effects.tweens).toEqual([{ to: 3.1416 }]); // …ale efekt kamery uruchomiony mimo ręcznego obrotu
        expect(c.s.camera.source).toBe('director');
    });

    it('09/10 I6: stary przebieg i ruch po done są ignorowane', () => {
        const old = point('09-old-run', 'old-run-traffic');
        expect(old.s.surfaces).toEqual({});
        expect(old.s.scenario).toMatchObject({ status: 'running', run: 2 });
        const late = point('10-after-terminal', 'late-traffic');
        expect(late.s.scenario.status).toBe('done');
        expect(late.effects.outgoing).toEqual([]);
        expect(late.effects.warnings).toEqual(['[aiui] akcja "deepen" zignorowana — brak aktywnego przebiegu (done).']);
    });

    it('11 odpowiedź → decyzja → kontynuacja → zakończenie', () => {
        expect(point('11-response-decision-continuation', 'deepen-sent').effects.outgoing).toHaveLength(1);
        expect(point('11-response-decision-continuation', 'continued').s.scenario.status).toBe('awaiting_action');
        expect(point('11-response-decision-continuation', 'completed').s.scenario.status).toBe('done');
    });

    it('12 OBS-3: koperta v0.9 przyjmowana (polityka wersji otwarta, ADR 0002)', () => {
        expect(point('12-envelope-edges', 'v0.9-create').s.surfaces).toHaveProperty('workspace');
    });

    it('12 OBS-4 (naprawione): mieszana koperta stage + createSurface odrzucona w całości', () => {
        const c = point('12-envelope-edges', 'mixed-stage-and-create');
        expect(c.s.stage.drawer).toBe('closed'); // stage NIE został częściowo skonsumowany
        expect(c.s.surfaces).not.toHaveProperty('hud');
        expect(c.effects.outgoing).toEqual([]);
        expect(c.effects.warnings).toEqual(['[aiui] odrzucony komunikat (niezgodny z kontraktem):']);
    });

    it('12 I3 / OBS-6: pola układu od agenta ignorowane; presentation "dismissed" od agenta = fallback elementu', () => {
        const c = point('12-envelope-edges', 'agent-layout-fields');
        expect(c.s.layout.a).toMatchObject({ x: 0.25, y: 0.5, scale: 1, z: 1 }); // auto-layout, nie x/y/scale/z agenta
        expect(c.s.views.b.status).toBe('fallback');
        expect(c.s.layout.b).toMatchObject({ presentation: 'card', lastHint: null });
    });
});
