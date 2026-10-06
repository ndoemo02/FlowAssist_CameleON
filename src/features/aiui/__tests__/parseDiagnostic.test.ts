// D7 (profil flowassist-transport/1 §11.5): parseEventDiagnostic mówi, DLACZEGO granica protokołu odrzuca komunikat.
// Refaktor bez zmiany zachowania: parseEvent jest opakowaniem, więc (1) przyjęcie/odrzucenie i zwracane zdarzenie są
// identyczne na korpusie, scenariuszu, przypadkach brzegowych i mutacjach; (2) każda przyczyna ma test ścieżki i surface;
// (3) lista przyczyn = tabela §11.5 dokumentu = PROFILE_RULES.codes.parseReasons.

import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { PARSE_REASONS, parseEvent, parseEventDiagnostic, type ParseReason } from '../contract';
import { PROFILE_RULES } from '../transport/profile';
import { researchDemo } from '../scenarios/researchDemo';
import { PROFILE_DOC_RULES, tableFirstColumn } from './fixtures/profileDoc';
import { researchFixture } from './fixtures/research';
import type { Fixture } from './fixtures/replay';

const corpusDir = fileURLToPath(new URL('./fixtures/corpus/', import.meta.url));
const corpus: Fixture[] = [
    researchFixture,
    ...readdirSync(corpusDir).filter((f) => f.endsWith('.json')).sort()
        .map((f) => JSON.parse(readFileSync(corpusDir + f, 'utf-8')) as Fixture),
];
const corpusEvents = corpus.flatMap((f) => f.steps.flatMap((s) => ('event' in s ? [s.event] : [])));
const researchEvents = [researchDemo.timeline, ...Object.values(researchDemo.responses).map((r) => r.steps)].flat().map((s) => s.event);
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));

const EDGES: unknown[] = [
    null, 42, 'tekst', [], {}, { version: 'v0.9.1' },
    { stage: {} }, { stage: { focus: 'left' } }, { stage: { drawer: 'half' } }, { stage: { focus: 'back', extra: 1 } }, { stage: null },
    { narration: {} }, { narration: { text: 5 } }, { narration: { text: null, speak: 'tak' } }, { narration: 'x' },
    { version: 'v1.0', createSurface: { surfaceId: 'workspace', catalogId: 'flowassist/v2' } },
    { createSurface: { surfaceId: 'workspace', catalogId: 'flowassist/v2' } },
    { version: 'v0.9.1', createSurface: { surfaceId: 'workspace', catalogId: 'flowassist/v2' }, deleteSurface: { surfaceId: 'hud' } },
    { version: 'v0.9.1', createSurface: [] },
    { version: 'v0.9.1', createSurface: { surfaceId: 'main', catalogId: 'flowassist/v2' } },
    { version: 'v0.9.1', createSurface: { surfaceId: 'hud', catalogId: 'basic' } },
    { version: 'v0.9.1', updateComponents: { surfaceId: 'hud', components: {} } },
    { version: 'v0.9.1', updateComponents: { surfaceId: 'hud', components: [{ id: '', component: 'X' }] } },
    { version: 'v0.9.1', updateComponents: { surfaceId: 'hud', components: [{ id: 'a', component: '' }] } },
    { version: 'v0.9.1', updateComponents: { surfaceId: 'hud', components: [{ id: 'a', component: 'X', children: ['b', 3] }] } },
    { version: 'v0.9.1', updateComponents: { surfaceId: 'hud', components: [{ id: 'prototype', component: 'X' }] } },
    { version: 'v0.9.1', updateComponents: { surfaceId: 'hud', components: [{ id: 'a', component: 'X', children: ['constructor'] }] } },
    { version: 'v0.9.1', updateDataModel: { surfaceId: 'hud', path: 'bez-slasha' } },
    { version: 'v0.9.1', updateDataModel: { surfaceId: 'hud', path: '' } },
    { version: 'v0.9.1', updateDataModel: { surfaceId: 'hud', path: null } },
    { version: 'v0.9.1', updateDataModel: { surfaceId: 'hud', path: '/a/__proto__' } },
    { version: 'v0.9.1', updateDataModel: { surfaceId: 'hud', path: '/x'.repeat(33) } },
    { version: 'v0.9.1', updateDataModel: { surfaceId: 'hud', path: '/' + 'a'.repeat(600) } },
    { version: 'v0.9.1', deleteSurface: { surfaceId: 'tasks-drawer' } },
    JSON.parse('{"version":"v0.9.1","updateDataModel":{"surfaceId":"workspace","path":"/m","value":{"rows":[{"constructor":1}]}}}'),
    JSON.parse('{"__proto__":{"x":1},"stage":{"focus":"back"}}'),
];

/** Mutacje poprawnych komunikatów korpusu: każda trafia w inną gałąź odrzucenia. */
function mutations(ev: unknown): unknown[] {
    if (ev === null || typeof ev !== 'object') return [];
    const e = ev as Record<string, unknown>;
    const out: unknown[] = [{ ...clone(e), narration: { text: null } }, { ...clone(e), constructor: 1 }];
    if ('version' in e) out.push({ ...clone(e), version: 'v1.0' }, (({ version: _v, ...rest }) => rest)(clone(e)));
    for (const k of ['createSurface', 'updateComponents', 'updateDataModel', 'deleteSurface']) {
        if (k in e) {
            out.push({ ...clone(e), [k]: { ...(clone(e[k]) as object), surfaceId: 'nieznany' } });
            out.push({ ...clone(e), [k]: 'nie-obiekt' });
        }
    }
    return out;
}

const ALL = [...corpusEvents, ...researchEvents, ...EDGES, ...[...corpusEvents, ...researchEvents].flatMap(mutations)];

describe('parseEvent = opakowanie parseEventDiagnostic (bez zmiany zachowania)', () => {
    it(`na ${ALL.length} komunikatach: przyjęcie, odrzucenie i zwrócone zdarzenie identyczne`, () => {
        let accepted = 0, rejected = 0;
        for (const raw of ALL) {
            const d = parseEventDiagnostic(raw);
            const e = parseEvent(raw);
            if (d.ok) {
                accepted++;
                expect(e).toEqual(d.event);
                // koperty A2UI: zdarzenie to ten sam obiekt wejściowy (jak przed refaktorem; store trzyma referencje)
                if (!('stage' in d.event) && !('narration' in d.event)) expect(e).toBe(raw);
            } else {
                rejected++;
                expect(e).toBeNull();
                expect(PARSE_REASONS).toContain(d.reason);
            }
        }
        expect(accepted).toBeGreaterThan(20);
        expect(rejected).toBeGreaterThan(40);
    });
});

describe('przyczyny, ścieżki i surface (profil §11.3, §11.5)', () => {
    const cases: [string, unknown, ParseReason, string, string | undefined][] = [
        ['nie obiekt', 'tekst', 'NOT_OBJECT', '', undefined],
        ['tablica', [], 'NOT_OBJECT', '', undefined],
        ['klucz zarezerwowany w kopercie', JSON.parse('{"__proto__":{},"stage":{"focus":"back"}}'), 'RESERVED_KEY', '/__proto__', undefined],
        ['klucz zarezerwowany w danych, surface znany', JSON.parse('{"version":"v0.9.1","updateDataModel":{"surfaceId":"workspace","path":"/m","value":{"a":{"constructor":1}}}}'), 'RESERVED_KEY', '/updateDataModel/value/a/constructor', 'workspace'],
        ['klucz zarezerwowany w tablicy danych: ścieżka kończy się na kolekcji', JSON.parse('{"version":"v0.9.1","updateDataModel":{"surfaceId":"hud","path":"/m","value":{"rows":[{"x":{"prototype":1}}]}}}'), 'RESERVED_KEY', '/updateDataModel/value/rows', 'hud'],
        ['klucz zarezerwowany w propsach komponentu: segment po id', JSON.parse('{"version":"v0.9.1","updateComponents":{"surfaceId":"workspace","components":[{"id":"c/1","component":"WorkspaceItem","content":{"__proto__":{}}}]}}'), 'RESERVED_KEY', '/updateComponents/components/c~11/content/__proto__', 'workspace'],
        ['klucz zarezerwowany w komponencie bez poprawnego id: kolekcja', JSON.parse('{"version":"v0.9.1","updateComponents":{"surfaceId":"hud","components":[{"component":"X","props":{"constructor":1}}]}}'), 'RESERVED_KEY', '/updateComponents/components', 'hud'],
        ['klucz z "/" i "~" escapowany', JSON.parse('{"version":"v0.9.1","updateDataModel":{"surfaceId":"hud","path":"/m","value":{"a/b~c":{"__proto__":1}}}}'), 'RESERVED_KEY', '/updateDataModel/value/a~1b~0c/__proto__', 'hud'],
        ['klucz zarezerwowany w wiadomości mieszanej: bez surface (to nie jest jedna koperta)', JSON.parse('{"__proto__":{},"stage":{"focus":"back"},"createSurface":{"surfaceId":"hud","catalogId":"flowassist/v2"},"version":"v0.9.1"}'), 'RESERVED_KEY', '/__proto__', undefined],
        ['dwa payloady (OBS-4)', { stage: { focus: 'back' }, narration: { text: null } }, 'PAYLOAD_COUNT', '', undefined],
        ['brak payloadu', { version: 'v0.9.1' }, 'PAYLOAD_COUNT', '', undefined],
        ['stage nie obiekt', { stage: null }, 'STAGE_INVALID', '/stage', undefined],
        ['stage pusty', { stage: {} }, 'STAGE_INVALID', '/stage', undefined],
        ['stage nieznany klucz', { stage: { focus: 'back', 'x/y': 1 } }, 'STAGE_INVALID', '/stage/x~1y', undefined],
        ['stage zły focus', { stage: { focus: 'left' } }, 'STAGE_INVALID', '/stage/focus', undefined],
        ['stage zły drawer', { stage: { drawer: 'half' } }, 'STAGE_INVALID', '/stage/drawer', undefined],
        ['narration nie obiekt', { narration: 'x' }, 'NARRATION_INVALID', '/narration', undefined],
        ['narration zły text', { narration: { text: 5 } }, 'NARRATION_INVALID', '/narration/text', undefined],
        ['narration zły speak', { narration: { text: 'a', speak: 'tak' } }, 'NARRATION_INVALID', '/narration/speak', undefined],
        ['A2UI v1.0, surface znany', { version: 'v1.0', createSurface: { surfaceId: 'hud', catalogId: 'flowassist/v2' } }, 'VERSION_UNSUPPORTED', '/version', 'hud'],
        ['brak version, surface nieznany', { deleteSurface: { surfaceId: 'main' } }, 'VERSION_UNSUPPORTED', '/version', undefined],
        ['payload nie obiekt', { version: 'v0.9.1', deleteSurface: 'hud' }, 'NOT_OBJECT', '/deleteSurface', undefined],
        ['nieznany surface', { version: 'v0.9.1', updateDataModel: { surfaceId: 'main', value: 1 } }, 'SURFACE_UNKNOWN', '/updateDataModel/surfaceId', undefined],
        ['obcy katalog', { version: 'v0.9.1', createSurface: { surfaceId: 'hud', catalogId: 'basic' } }, 'CATALOG_MISMATCH', '/createSurface/catalogId', 'hud'],
        ['components nie tablica', { version: 'v0.9.1', updateComponents: { surfaceId: 'hud', components: {} } }, 'COMPONENT_INVALID', '/updateComponents/components', 'hud'],
        ['komponent bez id: kolekcja', { version: 'v0.9.1', updateComponents: { surfaceId: 'hud', components: [{ id: 'ok', component: 'X' }, { component: 'X' }] } }, 'COMPONENT_INVALID', '/updateComponents/components', 'hud'],
        ['id zarezerwowane: kolekcja', { version: 'v0.9.1', updateComponents: { surfaceId: 'hud', components: [{ id: 'prototype', component: 'X' }] } }, 'COMPONENT_INVALID', '/updateComponents/components', 'hud'],
        ['pusty typ komponentu', { version: 'v0.9.1', updateComponents: { surfaceId: 'hud', components: [{ id: 'a', component: '' }] } }, 'COMPONENT_INVALID', '/updateComponents/components/a/component', 'hud'],
        ['złe children', { version: 'v0.9.1', updateComponents: { surfaceId: 'hud', components: [{ id: 'a', component: 'X', children: ['b', 3] }] } }, 'COMPONENT_INVALID', '/updateComponents/components/a/children', 'hud'],
        ['children zarezerwowane', { version: 'v0.9.1', updateComponents: { surfaceId: 'hud', components: [{ id: 'a', component: 'X', children: ['constructor'] }] } }, 'COMPONENT_INVALID', '/updateComponents/components/a/children', 'hud'],
        ['ścieżka bez "/"', { version: 'v0.9.1', updateDataModel: { surfaceId: 'hud', path: 'a' } }, 'PATH_INVALID', '/updateDataModel/path', 'hud'],
        ['ścieżka nie-napis', { version: 'v0.9.1', updateDataModel: { surfaceId: 'hud', path: null } }, 'PATH_INVALID', '/updateDataModel/path', 'hud'],
        ['segment zarezerwowany', { version: 'v0.9.1', updateDataModel: { surfaceId: 'hud', path: '/a/__proto__' } }, 'PATH_INVALID', '/updateDataModel/path', 'hud'],
        ['33 segmenty', { version: 'v0.9.1', updateDataModel: { surfaceId: 'hud', path: '/x'.repeat(33) } }, 'PATH_LIMIT', '/updateDataModel/path', 'hud'],
        ['513 punktów kodowych', { version: 'v0.9.1', updateDataModel: { surfaceId: 'hud', path: '/' + 'a'.repeat(512) } }, 'PATH_LIMIT', '/updateDataModel/path', 'hud'],
    ];
    it.each(cases)('%s', (_, raw, reason, path, surfaceId) => {
        const d = parseEventDiagnostic(raw);
        expect(d.ok).toBe(false);
        if (d.ok) return;
        expect(d.reason).toBe(reason);
        expect(d.path).toBe(path);
        expect(d.surfaceId).toBe(surfaceId);
        expect(parseEvent(raw)).toBeNull();
    });

    it('każda przyczyna z listy ma co najmniej jeden przypadek', () => {
        expect(new Set(cases.map((c) => c[2]))).toEqual(new Set(PARSE_REASONS));
    });

    it('tablica z dziurami (tylko obiekty z JS, nie z JSON.parse): przyjęcie jak przed D7 (every pomija dziury)', () => {
        const raw = { version: 'v0.9.1', updateComponents: { surfaceId: 'hud', components: [, { id: 'a', component: 'TaskList' }] } };
        const d = parseEventDiagnostic(raw);
        expect(d.ok).toBe(true);
        expect(parseEvent(raw)).toBe(raw);
    });

    it('bardzo głębokie zagnieżdżenie (12 000 poziomów) z kluczem na dnie: przyczyna i ścieżka bez przepełnienia stosu', () => {
        let value: Record<string, unknown> = JSON.parse('{"__proto__":1}');
        for (let i = 0; i < 12_000; i++) value = { n: value };
        const d = parseEventDiagnostic({ version: 'v0.9.1', updateDataModel: { surfaceId: 'hud', path: '/m', value } });
        expect(d.ok).toBe(false);
        if (d.ok) return;
        expect(d.reason).toBe('RESERVED_KEY');
        expect(d.path.startsWith('/updateDataModel/value/n/n/')).toBe(true);
        expect(d.path.endsWith('/n/__proto__')).toBe(true);
    });
});

describe('lista przyczyn = dokument profilu (§11.5, §15) = PROFILE_RULES', () => {
    it('tabela §11.5 wymienia dokładnie PARSE_REASONS', () => {
        const fromTable = tableFirstColumn('- **11.5 Wariant diagnostyczny').flatMap((cell) => cell.match(/[A-Z_]{4,}/g) ?? []);
        expect(new Set(fromTable)).toEqual(new Set(PARSE_REASONS));
        expect(fromTable).toHaveLength(PARSE_REASONS.length);
    });

    it('blok reguł i PROFILE_RULES niosą tę samą listę', () => {
        expect(PROFILE_DOC_RULES.codes.parseReasons).toEqual([...PARSE_REASONS]);
        expect([...PROFILE_RULES.codes.parseReasons]).toEqual([...PARSE_REASONS]);
    });
});
