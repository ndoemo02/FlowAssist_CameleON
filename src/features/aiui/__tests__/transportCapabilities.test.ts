// P1.7a: capabilities klienta, reguły profilu flowassist-transport/1 i negocjacja (ADR 0002, „Handshake możliwości”).
// - strażnik dryfu: RĘCZNIE wpisane literały (bez toMatchSnapshot — `-u` byłoby nieświadomą aktualizacją);
// - zgodność z normatywnymi schematami A2UI (zvendorowane, Ajv 2020-12) i parytet guarda kroku 2 ze schematem serwera;
// - schemat rozszerzenia flowassist (draft-07) i parytet jego słownika z katalogiem;
// - negotiate(): każdy krok porażki, kolejność kroków, polityka słownika serwera (A2a).

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import Ajv from 'ajv';
import Ajv2020 from 'ajv/dist/2020';
import { describe, expect, it } from 'vitest';
import { ITEM_KINDS } from '../contract';
import { KIND_REPRESENTATIONS } from '../catalog';
import { clientCapabilities, negotiate, NEGOTIATION_FAILURES, type ServerCapabilities } from '../transport/capabilities';
import { PROFILE_RULES, TRANSPORT_PROFILE } from '../transport/profile';

const readJson = (rel: string) => JSON.parse(readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf-8'));
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));

// ── strażnik dryfu ────────────────────────────────────────────────

describe('strażnik dryfu profilu flowassist-transport/1', () => {
    it('clientCapabilities() — dokładny ładunek (zmiana = świadoma zmiana literału albo nowa wersja profilu)', () => {
        expect(clientCapabilities()).toEqual({
            a2uiClientCapabilities: { 'v0.9': { supportedCatalogIds: ['flowassist/v2'] } },
            flowassist: {
                profile: 'flowassist-transport/1',
                kinds: { chart: ['chart2d'], kpi: ['cards2d'], table: ['table2d'], map: ['map2d'], slides: ['slides2d'] },
            },
        });
    });

    it('PROFILE_RULES — reguły stałe dla profilu (nie wysyłane)', () => {
        expect(PROFILE_RULES).toEqual({
            profile: 'flowassist-transport/1',
            envelope: { send: 'v0.9.1', accept: ['v0.9', 'v0.9.1'] },
            presentations: ['card', 'focus', 'screen'],
            limits: { dataModelPathMaxLength: 512, dataModelPathMaxSegments: 32 },
            reservedKeys: ['__proto__', 'constructor', 'prototype'],
        });
    });
});

describe('clientCapabilities(): snapshot', () => {
    it('jest głęboko zamrożony — mutacja rzuca (ESM = tryb ścisły)', () => {
        const caps = clientCapabilities();
        expect(Object.isFrozen(caps)).toBe(true);
        expect(Object.isFrozen(caps.a2uiClientCapabilities['v0.9'].supportedCatalogIds)).toBe(true);
        expect(Object.isFrozen(caps.flowassist.kinds)).toBe(true);
        expect(() => { (caps.flowassist.kinds.chart as string[]).push('ribbon3d'); }).toThrow(TypeError);
        expect(() => { (caps.flowassist as { profile: string }).profile = 'x'; }).toThrow(TypeError);
        expect(clientCapabilities().flowassist.kinds.chart).toEqual(['chart2d']);
    });

    it('każde wywołanie daje nowy obiekt (snapshot per przebieg)', () => {
        expect(clientCapabilities()).not.toBe(clientCapabilities());
    });
});

// ── schematy ──────────────────────────────────────────────────────

const ajv2020 = new Ajv2020({ strict: true, strictTypes: false });
const upstreamClient = ajv2020.compile(readJson('../schemas/a2ui-v0.9/client_capabilities.json'));
const ajv2020b = new Ajv2020({ strict: true, strictTypes: false }); // osobna instancja: oba pliki mają ten sam styl $id
const upstreamServer = ajv2020b.compile(readJson('../schemas/a2ui-v0.9/server_capabilities.json'));
const ajv07 = new Ajv({ strict: true, strictTypes: false });
const flowassistClient = ajv07.compile(readJson('../schemas/flowassist-transport-1/client-capabilities.schema.json'));

const SERVER: ServerCapabilities = {
    transportProfiles: [TRANSPORT_PROFILE],
    a2uiServerCapabilities: { 'v0.9': { supportedCatalogIds: ['flowassist/v2'] } },
    flowassist: { kinds: { chart: ['chart2d', 'ribbon3d'], kpi: ['cards2d'], table: ['table2d'], map: ['map2d'] } },
};

describe('zgodność z normatywnymi schematami A2UI (upstream, przypięte)', () => {
    it('a2uiClientCapabilities klienta spełnia client_capabilities.json', () => {
        expect(upstreamClient(clientCapabilities().a2uiClientCapabilities), JSON.stringify(upstreamClient.errors)).toBe(true);
    });

    it('kształt v1 planu (bez opakowania "v0.9") jest odrzucany przez upstream', () => {
        expect(upstreamClient({ supportedCatalogIds: ['flowassist/v2'] })).toBe(false);
    });

    it('a2uiServerCapabilities przykładowego serwera spełnia server_capabilities.json', () => {
        expect(upstreamServer(SERVER.a2uiServerCapabilities), JSON.stringify(upstreamServer.errors)).toBe(true);
    });

    // Parytet guarda kroku 2 ze schematem upstream: SERVER_CAPABILITIES_INVALID ⇔ schemat odrzuca.
    const a2uiCases: [string, unknown][] = [
        ['poprawny', { 'v0.9': { supportedCatalogIds: ['flowassist/v2'] } }],
        ['pusty v0.9 (katalogi opcjonalne)', { 'v0.9': {} }],
        ['acceptsInlineCatalogs true', { 'v0.9': { supportedCatalogIds: ['flowassist/v2'], acceptsInlineCatalogs: true } }],
        ['dodatkowe pole (upstream dopuszcza)', { 'v0.9': { supportedCatalogIds: ['flowassist/v2'], extra: 1 }, other: 2 }],
        ['brak klucza v0.9', {}],
        ['inny klucz wersji', { 'v0.8': { supportedCatalogIds: ['flowassist/v2'] } }],
        ['v0.9 nie jest obiektem', { 'v0.9': 1 }],
        ['supportedCatalogIds nie jest tablicą', { 'v0.9': { supportedCatalogIds: 'flowassist/v2' } }],
        ['supportedCatalogIds z nie-stringiem', { 'v0.9': { supportedCatalogIds: [1] } }],
        ['acceptsInlineCatalogs nie jest boolean', { 'v0.9': { acceptsInlineCatalogs: 'yes' } }],
        ['tablica zamiast obiektu', []],
    ];
    it.each(a2uiCases)('krok 2 ⇔ schemat serwera: %s', (_, a2ui) => {
        const r = negotiate({ ...SERVER, a2uiServerCapabilities: a2ui }, clientCapabilities());
        const guardRejects = !r.ok && r.reason === 'SERVER_CAPABILITIES_INVALID';
        expect(guardRejects).toBe(!upstreamServer(a2ui));
    });
});

describe('schemat rozszerzenia flowassist (klient)', () => {
    it('clientCapabilities() spełnia schemat', () => {
        expect(flowassistClient(clientCapabilities()), JSON.stringify(flowassistClient.errors)).toBe(true);
    });

    it('słownik schematu = katalog (rodzaje i dozwolone reprezentacje)', () => {
        const schema = readJson('../schemas/flowassist-transport-1/client-capabilities.schema.json');
        expect(Object.keys(schema.properties.flowassist.properties.kinds.properties).sort()).toEqual([...ITEM_KINDS].sort());
        for (const kind of ITEM_KINDS) expect(schema.$defs[kind].items.enum, kind).toEqual(KIND_REPRESENTATIONS[kind]);
    });

    it('reguły profilu w ładunku są odrzucane (M3: nie wysyłamy limitów ani wersji)', () => {
        const caps = clone(clientCapabilities()) as unknown as { flowassist: Record<string, unknown> };
        caps.flowassist.limits = PROFILE_RULES.limits;
        expect(flowassistClient(caps)).toBe(false);
    });

    it.each([
        ['reprezentacja niedozwolona dla rodzaju', { chart: ['map2d'] }],
        ['nieznany rodzaj', { pie: ['chart2d'] }],
        ['pusta lista', { chart: [] }],
        ['brak rodzajów', {}],
    ])('odrzuca kinds: %s', (_, kinds) => {
        const caps = clone(clientCapabilities()) as unknown as { flowassist: { kinds: unknown } };
        caps.flowassist.kinds = kinds;
        expect(flowassistClient(caps)).toBe(false);
    });
});

// ── negocjacja ────────────────────────────────────────────────────

const without = (o: Record<string, unknown>, key: string) => { const c = { ...o }; delete c[key]; return c; };
const client = clientCapabilities();
const reason = (server: unknown) => { const r = negotiate(server, client); return r.ok ? 'OK' : r.reason; };

describe('negotiate(): kroki 0–5', () => {
    it('sukces: profil, wspólny katalog, przecięcie per rodzaj w kolejności klienta; wynik zamrożony', () => {
        const r = negotiate(SERVER, client);
        expect(r).toEqual({
            ok: true, profile: 'flowassist-transport/1', catalogId: 'flowassist/v2',
            kinds: { chart: ['chart2d'], kpi: ['cards2d'], table: ['table2d'], map: ['map2d'] }, // slides: serwer nie oferuje
        });
        expect(Object.isFrozen(r)).toBe(true);
        if (r.ok) expect(Object.isFrozen(r.kinds.chart)).toBe(true);
    });

    it.each<[string, unknown, string]>([
        ['0: null', null, 'SERVER_CAPABILITIES_UNKNOWN'],
        ['0: undefined', undefined, 'SERVER_CAPABILITIES_UNKNOWN'],
        ['1: nie-obiekt', 'flowassist-transport/1', 'PROFILE_UNSUPPORTED'],
        ['1: brak transportProfiles', without(SERVER as never, 'transportProfiles'), 'PROFILE_UNSUPPORTED'],
        ['1: transportProfiles nie jest tablicą', { ...SERVER, transportProfiles: TRANSPORT_PROFILE }, 'PROFILE_UNSUPPORTED'],
        ['1: tylko inny profil', { ...SERVER, transportProfiles: ['a2ui-baseline/1', 'flowassist-transport/2'] }, 'PROFILE_UNSUPPORTED'],
        ['2: brak a2uiServerCapabilities', without(SERVER as never, 'a2uiServerCapabilities'), 'SERVER_CAPABILITIES_INVALID'],
        ['3: brak supportedCatalogIds', { ...SERVER, a2uiServerCapabilities: { 'v0.9': {} } }, 'SERVER_CATALOGS_UNDECLARED'],
        ['3: brak wspólnego katalogu', { ...SERVER, a2uiServerCapabilities: { 'v0.9': { supportedCatalogIds: ['basic/v1'] } } }, 'NO_COMMON_CATALOG'],
        ['4: brak rozszerzenia (agent A2UI z samym katalogiem)', without(SERVER as never, 'flowassist'), 'FLOWASSIST_CAPABILITIES_MISSING'],
        ['4: flowassist undefined', { ...SERVER, flowassist: undefined }, 'FLOWASSIST_CAPABILITIES_MISSING'],
        ['4: flowassist nie jest obiektem', { ...SERVER, flowassist: true }, 'FLOWASSIST_CAPABILITIES_INVALID'],
        ['4: brak kinds', { ...SERVER, flowassist: {} }, 'FLOWASSIST_CAPABILITIES_INVALID'],
        ['4: kinds jako tablica', { ...SERVER, flowassist: { kinds: [] } }, 'FLOWASSIST_CAPABILITIES_INVALID'],
        ['4: wartość nie jest tablicą', { ...SERVER, flowassist: { kinds: { chart: 'chart2d' } } }, 'FLOWASSIST_CAPABILITIES_INVALID'],
        ['4: nie-string w tablicy', { ...SERVER, flowassist: { kinds: { chart: ['chart2d', 1] } } }, 'FLOWASSIST_CAPABILITIES_INVALID'],
        ['4: nieznany rodzaj z nie-tablicą', { ...SERVER, flowassist: { kinds: { pie: {} } } }, 'FLOWASSIST_CAPABILITIES_INVALID'],
        ['5: puste przecięcie', { ...SERVER, flowassist: { kinds: { chart: ['ribbon3d'], kpi: ['kpi3d'] } } }, 'NO_COMMON_REPRESENTATION'],
        ['5: same puste tablice', { ...SERVER, flowassist: { kinds: { chart: [], table: [] } } }, 'NO_COMMON_REPRESENTATION'],
        ['5: puste kinds', { ...SERVER, flowassist: { kinds: {} } }, 'NO_COMMON_REPRESENTATION'],
    ])('%s → %s', (_, server, expected) => {
        expect(reason(server)).toBe(expected);
    });

    it('klucz zarezerwowany w kinds (własny __proto__ z JSON.parse) albo jako reprezentacja → INVALID', () => {
        const proto = JSON.parse('{"__proto__":["chart2d"],"chart":["chart2d"]}');
        expect(Object.prototype.hasOwnProperty.call(proto, '__proto__')).toBe(true);
        expect(reason({ ...SERVER, flowassist: { kinds: proto } })).toBe('FLOWASSIST_CAPABILITIES_INVALID');
        expect(reason({ ...SERVER, flowassist: { kinds: { chart: ['chart2d', 'constructor'] } } })).toBe('FLOWASSIST_CAPABILITIES_INVALID');
    });

    it('kolejność: przy kilku wadach naraz raportowany jest najwcześniejszy krok', () => {
        const allBad = { transportProfiles: ['other/1'], a2uiServerCapabilities: {}, flowassist: 7 };
        expect(reason(allBad)).toBe('PROFILE_UNSUPPORTED');
        expect(reason({ ...allBad, transportProfiles: [TRANSPORT_PROFILE] })).toBe('SERVER_CAPABILITIES_INVALID');
        expect(reason({ ...SERVER, a2uiServerCapabilities: { 'v0.9': {} }, flowassist: 7 })).toBe('SERVER_CATALOGS_UNDECLARED');
        expect(reason({ ...SERVER, a2uiServerCapabilities: { 'v0.9': { supportedCatalogIds: ['x'] } }, flowassist: 7 })).toBe('NO_COMMON_CATALOG');
        expect(reason({ ...SERVER, flowassist: { kinds: { chart: 1, table: [] } } })).toBe('FLOWASSIST_CAPABILITIES_INVALID');
    });

    it('A2a: nieznane, poprawnie utypowane rodzaje i reprezentacje są pomijane; pusta tablica nic nie wnosi', () => {
        const r = negotiate({ ...SERVER, flowassist: { kinds: { hologram: ['holo3d'], chart: ['chart9d', 'chart2d'], kpi: [] } } }, client);
        expect(r).toEqual({ ok: true, profile: TRANSPORT_PROFILE, catalogId: 'flowassist/v2', kinds: { chart: ['chart2d'] } });
    });

    it('przecięcie liczone per rodzaj: reprezentacja zadeklarowana pod innym rodzajem się nie liczy', () => {
        expect(reason({ ...SERVER, flowassist: { kinds: { table: ['chart2d'], kpi: ['map2d'] } } })).toBe('NO_COMMON_REPRESENTATION');
        const r = negotiate({ ...SERVER, flowassist: { kinds: { table: ['chart2d', 'table2d'] } } }, client);
        expect(r.ok && r.kinds).toEqual({ table: ['table2d'] });
    });

    it('acceptsInlineCatalogs: true nie zmienia wyniku (katalogów inline nie wysyłamy, I10)', () => {
        const inline = { ...SERVER, a2uiServerCapabilities: { 'v0.9': { supportedCatalogIds: ['flowassist/v2'], acceptsInlineCatalogs: true } } };
        expect(negotiate(inline, client)).toEqual(negotiate(SERVER, client));
    });

    it('wiele katalogów serwera i wiele profili: wybór wspólnego, niezależnie od kolejności serwera', () => {
        const many = { ...SERVER, transportProfiles: ['a2ui-baseline/1', TRANSPORT_PROFILE], a2uiServerCapabilities: { 'v0.9': { supportedCatalogIds: ['basic/v1', 'flowassist/v2'] } } };
        const r = negotiate(many, client);
        expect(r.ok && r.catalogId).toBe('flowassist/v2');
    });

    it('przyczyny porażek są zamkniętą listą w kolejności kroków', () => {
        expect(NEGOTIATION_FAILURES).toEqual([
            'SERVER_CAPABILITIES_UNKNOWN', 'PROFILE_UNSUPPORTED', 'SERVER_CAPABILITIES_INVALID', 'SERVER_CATALOGS_UNDECLARED',
            'NO_COMMON_CATALOG', 'FLOWASSIST_CAPABILITIES_MISSING', 'FLOWASSIST_CAPABILITIES_INVALID', 'NO_COMMON_REPRESENTATION',
        ]);
    });
});
