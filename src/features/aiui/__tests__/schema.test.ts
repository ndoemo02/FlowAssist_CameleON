// Warstwowa konformacja JSON Schema ↔ guardy runtime (plan v1.3.2, P0.3; Ajv tylko w testach).
// Autorytetem runtime pozostają contract.ts / catalog.ts; schematy w schemas/flowassist-v2/ są pochodną specyfikacją.
// Parytet sprawdzamy osobno na trzech warstwach + test sekwencji (przyjęta koperta może dać pending/fallback).
// Zielony parytet NIE dowodzi pełnej równoważności — tylko zgodność na korpusie i jego mutacjach.

import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import Ajv, { type ValidateFunction } from 'ajv';
import { describe, expect, it, vi } from 'vitest';
import { buildAction, buildError, isBinding, parseEvent, type CatalogName } from '../contract';
import { isSupportedRepresentation, validateContent, validateProps, type SupportedRepresentation } from '../catalog';
import { getAt } from '../jsonPointer';
import type { Surface } from '../reducer';
import { researchDemo } from '../scenarios/researchDemo';
import { speak } from '../tts';
import { replay, type Fixture } from './fixtures/replay';
import { researchFixture } from './fixtures/research';

vi.mock('../tts', () => ({ speak: vi.fn(), stopSpeaking: vi.fn() }));

// ── schematy ──────────────────────────────────────────────────────

const BASE = 'https://flowassist.local/schemas/flowassist-v2/';
const schemaDir = fileURLToPath(new URL('../schemas/flowassist-v2/', import.meta.url));
// strictRequired off: `if: { required: [...] }` i `oneOf: [{ required: [...] }]` to idiom wykrywania klucza typu komunikatu
const ajv = new Ajv({ strict: true, strictTypes: false, strictRequired: false, allowUnionTypes: true });
for (const f of readdirSync(schemaDir).filter((n) => n.endsWith('.schema.json'))) {
    ajv.addSchema(JSON.parse(readFileSync(schemaDir + f, 'utf-8')));
}
const ref = (path: string): ValidateFunction => ajv.compile({ $ref: BASE + path });
const agentEnvelope = ref('envelope.agent-to-client.schema.json');
const clientEnvelope = ref('envelope.client-to-agent.schema.json');
const componentSchema = (name: CatalogName) => ref(`components.schema.json#/$defs/${name}`);
const contentSchema = (rep: SupportedRepresentation) => ref(`content.schema.json#/$defs/${rep}`);

// ── korpus ────────────────────────────────────────────────────────

const corpusDir = fileURLToPath(new URL('./fixtures/corpus/', import.meta.url));
const corpus: Fixture[] = [
    researchFixture,
    ...readdirSync(corpusDir).filter((f) => f.endsWith('.json')).sort()
        .map((f) => JSON.parse(readFileSync(corpusDir + f, 'utf-8')) as Fixture),
];
const corpusEvents = corpus.flatMap((f) => f.steps.flatMap((s) => ('event' in s ? [s.event] : [])));
const researchEvents = [researchDemo.timeline, ...Object.values(researchDemo.responses).map((r) => r.steps)].flat().map((s) => s.event);

/** Ręczne przypadki brzegowe koperty (uzupełniają korpus i mutacje). */
const ENVELOPE_EDGES: unknown[] = [
    null, 42, 'tekst', [], {}, { version: 'v0.9.1' },
    { stage: {} }, { stage: { focus: 'left' } }, { stage: { focus: 'back', extra: 1 } }, { stage: null },
    { narration: {} }, { narration: { text: 5 } }, { narration: { text: null, speak: 'tak' } }, { narration: { text: 'a', extra: true } },
    { version: 'v1.0', createSurface: { surfaceId: 'workspace', catalogId: 'flowassist/v2' } },
    { version: 'v0.9.1', createSurface: { surfaceId: 'workspace', catalogId: 'flowassist/v2' }, deleteSurface: { surfaceId: 'hud' } },
    { version: 'v0.9.1', createSurface: [] },
    { version: 'v0.9.1', updateComponents: { surfaceId: 'hud', components: [{ id: '', component: 'X' }] } },
    { version: 'v0.9.1', updateComponents: { surfaceId: 'hud', components: [{ id: 'a', component: 'X', children: ['b', 3] }] } },
    { version: 'v0.9.1', updateDataModel: { surfaceId: 'hud', path: 'bez-slasha' } },
    { version: 'v0.9.1', updateDataModel: { surfaceId: 'hud', path: '' } },
    { version: 'v0.9.1', updateDataModel: { surfaceId: 'hud', path: null } },
    // FU-3: limity ścieżki (32 segmenty, 512 znaków) — dokładnie na progu i próg + 1
    { version: 'v0.9.1', updateDataModel: { surfaceId: 'hud', path: '/a'.repeat(32), value: 1 } },
    { version: 'v0.9.1', updateDataModel: { surfaceId: 'hud', path: '/a'.repeat(33), value: 1 } },
    { version: 'v0.9.1', updateDataModel: { surfaceId: 'hud', path: '/' + 'x'.repeat(511), value: 1 } },
    { version: 'v0.9.1', updateDataModel: { surfaceId: 'hud', path: '/' + 'x'.repeat(512), value: 1 } },
    { version: 'v0.9.1', updateDataModel: { surfaceId: 'hud', path: '/a'.repeat(10_000), value: 1 } },
    // FU-3: jednostka długości = punkty kodowe Unicode (jak maxLength w JSON Schema); 😀 = 2 jednostki UTF-16
    { version: 'v0.9.1', updateDataModel: { surfaceId: 'hud', path: '/' + '😀'.repeat(256), value: 1 } },
    { version: 'v0.9.1', updateDataModel: { surfaceId: 'hud', path: '/' + '😀'.repeat(511), value: 1 } },
    { version: 'v0.9.1', updateDataModel: { surfaceId: 'hud', path: '/' + '😀'.repeat(512), value: 1 } },
    { version: 'v0.9.1', deleteSurface: { surfaceId: 'nieznany' } },
    // FU-4: zarezerwowane klucze własne (JSON.parse: własne __proto__) na dowolnym poziomie, id, children, segment ścieżki
    JSON.parse('{"version":"v0.9.1","updateDataModel":{"surfaceId":"hud","path":"/x","value":{"a":[{"__proto__":1}]}}}'),
    JSON.parse('{"version":"v0.9.1","updateComponents":{"surfaceId":"hud","components":[{"id":"r","component":"Approval","m":{"constructor":{}}}]}}'),
    JSON.parse('{"version":"v0.9.1","deleteSurface":{"surfaceId":"hud"},"prototype":1}'),
    JSON.parse('{"stage":{"focus":"back","__proto__":{}}}'),
    { version: 'v0.9.1', updateComponents: { surfaceId: 'hud', components: [{ id: 'constructor', component: 'Approval' }] } },
    { version: 'v0.9.1', updateComponents: { surfaceId: 'hud', components: [{ id: 'r', component: 'Workspace', children: ['prototype'] }] } },
    { version: 'v0.9.1', updateDataModel: { surfaceId: 'hud', path: '/a/__proto__/b', value: 1 } },
    { version: 'v0.9.1', updateDataModel: { surfaceId: 'hud', path: '/constructor', value: 1 } },
    { version: 'v0.9.1', updateDataModel: { surfaceId: 'hud', path: '/constructorName', value: { prototypes: 1, label: '__proto__' } } },
    // OBS-4: mieszane koperty odrzucane w całości
    { stage: { drawer: 'open' }, version: 'v0.9.1', createSurface: { surfaceId: 'hud', catalogId: 'flowassist/v2' } },
    { narration: { text: 'a' }, version: 'v0.9.1', updateDataModel: { surfaceId: 'hud', path: '/x', value: 1 } },
    { stage: { focus: 'back' }, narration: { text: 'a' } },
    { stage: { focus: 'back' }, version: 'v0.9.1' }, // pole niebędące payloadem — przyjęte
];

// ── mutacje (deterministyczne) ────────────────────────────────────

const REPLACEMENTS: unknown[] = [null, 42, -1, 2, 'x', true, [], {}];

/** Wszystkie warianty `root` z jedną zmianą: usunięcie klucza, podmiana wartości, pusta / rozszerzona tablica. */
function mutations(root: unknown, maxDepth = 4): unknown[] {
    const out: unknown[] = [];
    const setAt = (path: (string | number)[], fn: (parent: Record<string, unknown> | unknown[], key: string | number) => void) => {
        const copy = structuredClone(root) as Record<string, unknown>;
        let cur: unknown = copy;
        for (const k of path.slice(0, -1)) cur = (cur as Record<string | number, unknown>)[k];
        fn(cur as Record<string, unknown>, path[path.length - 1]);
        out.push(copy);
    };
    const walk = (value: unknown, path: (string | number)[], depth: number) => {
        if (depth > maxDepth) return;
        if (Array.isArray(value)) {
            if (path.length) {
                setAt(path, (p, k) => { (p as Record<string | number, unknown>)[k] = []; });
                setAt(path, (p, k) => { ((p as Record<string | number, unknown>)[k] as unknown[]).push({}); });
            }
            if (value.length) walk(value[0], [...path, 0], depth + 1);
            return;
        }
        if (value !== null && typeof value === 'object') {
            for (const key of Object.keys(value)) {
                const p = [...path, key];
                setAt(p, (parent, k) => { delete (parent as Record<string | number, unknown>)[k]; });
                for (const r of REPLACEMENTS) setAt(p, (parent, k) => { (parent as Record<string | number, unknown>)[k] = r; });
                walk((value as Record<string, unknown>)[key], p, depth + 1);
            }
        }
    };
    walk(root, [], 0);
    return out;
}

/** Zbiera rozbieżności zamiast przerywać na pierwszej — czytelny raport w razie regresji. */
function parity(samples: unknown[], guard: (v: unknown) => boolean, schema: ValidateFunction) {
    const mismatches: { sample: unknown; guard: boolean; schema: boolean }[] = [];
    for (const s of samples) {
        const g = guard(s);
        const v = schema(s) as boolean;
        if (g !== v) mismatches.push({ sample: s, guard: g, schema: v });
    }
    return mismatches;
}

// ── próbki propsów i treści ze stanu w każdym checkpoincie korpusu ──

const speakMock = vi.mocked(speak);
const surfaceSamples: Surface[] = corpus.flatMap((f) =>
    replay(f, speakMock).flatMap((c) => Object.values((c.state as { surfaces: Record<string, Surface> }).surfaces)));
const uniq = <T,>(xs: T[]) => Array.from(new Map(xs.map((x) => [JSON.stringify(x), x])).values());

/** Propsy po rozwiązaniu bindingów (jak resolveItem / resolveTree); null = binding jeszcze nierozwiązany (pending). */
function resolvedProps(surface: Surface, id: string): Record<string, unknown> | null {
    const props: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(surface.components[id])) {
        if (k === 'id' || k === 'component' || k === 'children') continue;
        const value = isBinding(v) ? getAt(surface.data, v.path) : v;
        if (value === undefined && isBinding(v)) return null;
        props[k] = value;
    }
    return props;
}

const propSamples: Partial<Record<CatalogName, Record<string, unknown>[]>> = {};
const contentSamples: Partial<Record<SupportedRepresentation, Record<string, unknown>[]>> = {};
for (const surface of surfaceSamples) {
    for (const [id, c] of Object.entries(surface.components)) {
        const props = resolvedProps(surface, id);
        if (!props) continue;
        const name = c.component as CatalogName;
        (propSamples[name] ??= []).push(props);
        if (name === 'WorkspaceItem' && Array.isArray(props.representations)) {
            const rep = props.representations.find(isSupportedRepresentation);
            if (rep && props.content && typeof props.content === 'object') (contentSamples[rep] ??= []).push(props.content as Record<string, unknown>);
        }
    }
}

// ── testy ─────────────────────────────────────────────────────────

describe('P0.3 warstwa 1: koperta agent → klient (parseEvent)', () => {
    const samples = [...corpusEvents, ...researchEvents, ...ENVELOPE_EDGES];
    const all = [...samples, ...samples.filter((s) => s && typeof s === 'object').flatMap((s) => mutations(s, 3))];

    it('korpus i scenariusz research są przyjmowane przez schemat i parseEvent', () => {
        // 03: obcy katalog i 12: mieszana koperta (OBS-4) — odrzucane przez oba (oczekiwane); reszta korpusu musi przejść
        const rejected = [...corpusEvents, ...researchEvents].filter((e) => parseEvent(e) === null);
        expect(rejected).toEqual([
            { version: 'v0.9.1', createSurface: { surfaceId: 'workspace', catalogId: 'other/v1' } },
            { stage: { drawer: 'open' }, version: 'v0.9.1', createSurface: { surfaceId: 'hud', catalogId: 'flowassist/v2' } },
        ]);
    });

    it(`parytet przyjęcia/odrzucenia na ${all.length} próbkach (korpus + brzegi + mutacje)`, () => {
        expect(parity(all, (s) => parseEvent(s) !== null, agentEnvelope)).toEqual([]);
    });
});

describe('P0.3 koperta klient → agent (buildAction / buildError)', () => {
    it('koperty budowane przez klienta i komunikaty wychodzące z korpusu spełniają schemat', () => {
        const built = [
            buildAction('deepen', 'workspace', 'a', { itemId: 'a', workspace: { screen: null, focus: null, dismissed: [] } }),
            buildAction('approve', 'hud', 'root'),
            buildError({ code: 'VALIDATION_FAILED', surfaceId: 'workspace', path: '/components/a/kind', message: 'x' }),
            buildError({ code: 'SURFACE_EXISTS', surfaceId: 'hud', message: 'x' }),
        ];
        const outgoing = corpus.flatMap((f) => replay(f, speakMock).flatMap((c) => c.effects.outgoing as Record<string, unknown>[]))
            .map((m) => ('action' in m ? { ...m, action: { ...(m.action as object), timestamp: '2026-10-05T00:00:00.000Z' } } : m));
        expect(outgoing.length).toBeGreaterThan(0);
        for (const m of [...built, ...outgoing]) expect(clientEnvelope(m), JSON.stringify(m)).toBe(true);
    });
});

describe('P0.3 warstwa 2: rozwiązane propsy (validateProps)', () => {
    for (const name of ['WorkspaceItem', 'TaskList', 'Approval', 'Workspace'] as CatalogName[]) {
        it(`${name}: parytet na korpusie i mutacjach`, () => {
            const base = uniq(propSamples[name] ?? []);
            expect(base.length, `brak próbek ${name} w korpusie`).toBeGreaterThan(0);
            const all = [...base, ...base.flatMap((p) => mutations(p))];
            expect(parity(all, (s) => validateProps(name, s as Record<string, unknown>) === null, componentSchema(name))).toEqual([]);
        });
    }
});

describe('P0.3 warstwa 3: treść reprezentacji (validateContent)', () => {
    for (const rep of ['chart2d', 'cards2d', 'table2d', 'map2d'] as SupportedRepresentation[]) {
        it(`${rep}: parytet na korpusie i mutacjach`, () => {
            const base = uniq(contentSamples[rep] ?? []);
            expect(base.length, `brak próbek ${rep} w korpusie`).toBeGreaterThan(0);
            const all = [...base, ...base.flatMap((c) => mutations(c))];
            expect(parity(all, (s) => validateContent(rep, s as Record<string, unknown>) === null, contentSchema(rep))).toEqual([]);
        });
    }

    it('slides2d (brak w korpusie): parytet na próbce syntetycznej i mutacjach', () => {
        const base = [{ slides: [{ title: 'Wnioski', bullets: ['a', 'b'] }] }];
        const all = [...base, ...base.flatMap((c) => mutations(c))];
        expect(parity(all, (s) => validateContent('slides2d', s as Record<string, unknown>) === null, contentSchema('slides2d'))).toEqual([]);
    });
});

describe('P0.3 warstwa 4: sekwencje — przyjęta koperta może legalnie dać pending lub fallback', () => {
    const viewsAt = (id: string, label: string) => {
        const c = replay(corpus.find((f) => f.id === id)!, speakMock).find((x) => x.label === label)!;
        return (c.state as { views: Record<string, { status: string }> }).views;
    };
    const eventsOf = (id: string) => corpus.find((f) => f.id === id)!.steps.flatMap((s) => ('event' in s ? [s.event] : []));

    it('01: komponent bez danych → pending; wszystkie koperty fixture przyjęte', () => {
        expect(eventsOf('01-component-before-data').every((e) => agentEnvelope(e))).toBe(true);
        expect(viewsAt('01-component-before-data', 'component-only').a.status).toBe('pending');
    });

    it('04: nieobsługiwana reprezentacja → fallback mimo poprawnej koperty', () => {
        expect(eventsOf('04-unsupported-representation').every((e) => agentEnvelope(e))).toBe(true);
        expect(viewsAt('04-unsupported-representation', 'unsupported').a.status).toBe('fallback');
    });

    it('12: presentation "dismissed" od agenta → fallback elementu mimo poprawnej koperty', () => {
        expect(viewsAt('12-envelope-edges', 'agent-layout-fields').b.status).toBe('fallback');
        // jedyna odrzucona koperta fixture'u to celowo mieszana (OBS-4); koperta elementu b jest poprawna
        const rejected = eventsOf('12-envelope-edges').filter((e) => !agentEnvelope(e));
        expect(rejected).toEqual([expect.objectContaining({ stage: { drawer: 'open' }, createSurface: expect.anything() })]);
    });

    it('Workspace.children może wskazywać niedostarczony komponent (P6) — schemat tego nie zabrania', () => {
        expect(componentSchema('Workspace')({ children: ['nie-ma-jeszcze'] })).toBe(true);
    });
});
