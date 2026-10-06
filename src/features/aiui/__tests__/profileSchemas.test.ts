// Schematy profilu flowassist-transport/1 (P1.7b): ramka, forwardedProps, diagnostyka, interrupt + resume, capabilities
// agenta. Schematy są pochodną specyfikacją dokumentu docs/protocol/flowassist-transport-1.md; runtime adaptera (P1.6)
// jeszcze nie istnieje, więc testy sprawdzają: (1) przykłady i wartości z dokumentu, (2) obiekty budowane dziś przez
// klienta (capabilities, buildAction, buildError), (3) parytet capabilities agenta z negotiate(), (4) kontrprzykłady.

import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import Ajv, { type ValidateFunction } from 'ajv';
import { describe, expect, it } from 'vitest';
import { buildAction, buildError, SURFACE_IDS } from '../contract';
import { clientCapabilities, negotiate, type ServerCapabilities } from '../transport/capabilities';
import { MOCK_SERVER_CAPABILITIES } from '../transport/mockTransport';
import { PROFILE_RULES, TRANSPORT_PROFILE } from '../transport/profile';

// ── schematy (jedna instancja Ajv: odwołania między plikami po $id) ─────────────

const SCHEMAS = fileURLToPath(new URL('../schemas/', import.meta.url));
const T1 = 'https://flowassist.local/schemas/flowassist-transport-1/';
// strictRequired off: `{ required: [...] }` w allOf zawęża schemat z innego pliku (jak w schema.test.ts)
const ajv = new Ajv({ strict: true, strictTypes: false, strictRequired: false, allowUnionTypes: true });
for (const dir of ['flowassist-v2/', 'flowassist-transport-1/']) {
    for (const f of readdirSync(SCHEMAS + dir).filter((n) => n.endsWith('.schema.json'))) {
        ajv.addSchema(JSON.parse(readFileSync(SCHEMAS + dir + f, 'utf-8')));
    }
}
const ref = (path: string): ValidateFunction => ajv.compile({ $ref: T1 + path });
const frame = ref('frame.schema.json');
const forwardedProps = ref('forwarded-props.schema.json');
const diagnostic = ref('diagnostic.schema.json');
const interrupt = ref('interrupt.schema.json');
const resumeEntry = ref('interrupt.schema.json#/$defs/resumeEntry');
const serverCaps = ref('server-capabilities.schema.json');
const readSchema = (name: string) => JSON.parse(readFileSync(SCHEMAS + 'flowassist-transport-1/' + name, 'utf-8'));

const errors = (v: ValidateFunction) => JSON.stringify(v.errors);
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));

// ── dokument profilu ──────────────────────────────────────────────

// CRLF → LF: kopia robocza na Windows może mieć CRLF (core.autocrlf)
const DOC = readFileSync(fileURLToPath(new URL('../../../../docs/protocol/flowassist-transport-1.md', import.meta.url)), 'utf-8')
    .replace(/\r\n/g, '\n');
// bloki także wcięte (przykład w elemencie listy)
const jsonBlocks = Array.from(DOC.matchAll(/^[ \t]*```json\n([\s\S]*?)\n[ \t]*```/gm), (m) => m[1]); // bez spread: target tsconfig
const rulesBlock = DOC.match(/<!-- profile-rules:begin -->\s*```json\n([\s\S]*?)\n```\s*<!-- profile-rules:end -->/);
const RULES = JSON.parse(rulesBlock![1]);

describe('dokument profilu: przykłady i reguły maszynowe', () => {
    it('blok reguł maszynowych istnieje i dotyczy profilu/1', () => {
        expect(rulesBlock).not.toBeNull();
        expect(RULES.profile).toBe(TRANSPORT_PROFILE);
    });

    it('przykład ramki z §4.5 spełnia schemat ramki (razem z kopertą osi 1–2)', () => {
        const example = jsonBlocks.map((b) => { try { return JSON.parse(b); } catch { return null; } })
            .find((o) => o?.name === 'flowassist.frame');
        expect(example).toBeTruthy();
        expect(frame(example), errors(frame)).toBe(true);
    });

    it('stałe schematów = blok reguł (nazwa ramki, profil, reason interruptu, kody, limity, klucze, surface)', () => {
        const f = readSchema('frame.schema.json');
        expect(f.properties.name.const).toBe(RULES.agui.frameEventName);
        expect(f.properties.value.properties.profile.const).toBe(RULES.profile);
        expect(readSchema('interrupt.schema.json').properties.reason.const).toBe(RULES.agui.awaitingActionReason);
        expect(readSchema('diagnostic.schema.json').properties.code.enum).toEqual(RULES.codes.diagnostics);
        const fp = readSchema('forwarded-props.schema.json').properties.flowassist.properties;
        expect(fp.profile.const).toBe(RULES.profile);
        expect(fp.a2uiErrors.maxItems).toBe(RULES.limits.pendingReportsMax);
        expect(fp.diagnostics.maxItems).toBe(RULES.limits.pendingReportsMax);
        expect(fp.resync.properties.surfaces.items.enum).toEqual([...SURFACE_IDS]);
        const kinds = readSchema('server-capabilities.schema.json').properties.flowassist.properties.kinds;
        expect(kinds.propertyNames.not.enum).toEqual(RULES.reservedKeys);
        expect(kinds.additionalProperties.items.not.enum).toEqual(RULES.reservedKeys);
    });

    it('reguły już obecne w kodzie mają te same wartości w dokumencie (pełny parytet: następny commit)', () => {
        expect(RULES.envelope).toEqual({ send: PROFILE_RULES.envelope.send, accept: [...PROFILE_RULES.envelope.accept] });
        expect(RULES.presentations).toEqual([...PROFILE_RULES.presentations]);
        expect(RULES.reservedKeys).toEqual([...PROFILE_RULES.reservedKeys]);
        expect(RULES.limits.dataModelPathMaxLength).toBe(PROFILE_RULES.limits.dataModelPathMaxLength);
        expect(RULES.limits.dataModelPathMaxSegments).toBe(PROFILE_RULES.limits.dataModelPathMaxSegments);
    });
});

// ── ramka ─────────────────────────────────────────────────────────

const FRAME = {
    type: 'CUSTOM',
    name: 'flowassist.frame',
    value: { profile: 'flowassist-transport/1', seq: 0, message: { stage: { focus: 'back' } } },
};
const withValue = (patch: Record<string, unknown>) => ({ ...FRAME, value: { ...FRAME.value, ...patch } });

describe('schemat ramki', () => {
    it.each([
        ['stage', FRAME],
        ['narration', withValue({ message: { narration: { text: 'Gotowe.', speak: true } } })],
        ['updateDataModel', withValue({ seq: 7, message: { version: 'v0.9', updateDataModel: { surfaceId: 'workspace', path: '/rows', value: [] } } })],
        ['pola wspólne AG-UI', { ...FRAME, timestamp: 1759766400000, metadata: { trace: 'x' }, subagentRunId: 'sub-1' }],
        ['seq = 2^53 − 1', withValue({ seq: Number.MAX_SAFE_INTEGER })],
    ])('przyjmuje: %s', (_, f) => {
        expect(frame(f), errors(frame)).toBe(true);
    });

    it.each([
        ['inna nazwa CUSTOM', { ...FRAME, name: 'flowassist.other' }],
        ['inny typ zdarzenia', { ...FRAME, type: 'ACTIVITY_SNAPSHOT' }],
        ['brak seq', { ...FRAME, value: { profile: FRAME.value.profile, message: FRAME.value.message } }],
        ['seq ujemne', withValue({ seq: -1 })],
        ['seq ułamkowe', withValue({ seq: 1.5 })],
        ['seq jako tekst', withValue({ seq: '0' })],
        ['inny profil', withValue({ profile: 'flowassist-transport/2' })],
        ['dodatkowy klucz w value', withValue({ id: 'x' })],
        ['dodatkowe pole zdarzenia', { ...FRAME, extra: 1 }],
        ['wiadomość mieszana (OBS-4)', withValue({ message: { stage: { focus: 'back' }, narration: { text: null } } })],
        ['wiadomość z zarezerwowanym kluczem (FU-4)', withValue({ message: JSON.parse('{"stage":{"focus":"back","__proto__":{}}}') })],
        ['kilka wiadomości w jednej ramce', withValue({ message: [{ stage: { focus: 'back' } }] })],
    ])('odrzuca: %s', (_, f) => {
        expect(frame(f)).toBe(false);
    });
});

// ── forwardedProps ────────────────────────────────────────────────

const props = (extra: Record<string, unknown> = {}) =>
    clone({ flowassist: { profile: TRANSPORT_PROFILE, capabilities: clientCapabilities(), ...extra } });
const DIAG = { code: 'STAGE_REJECTED', message: 'nieznane pole', frame: { runId: 'run-1', seq: 3 }, path: '/stage/extra' };

describe('schemat forwardedProps', () => {
    it.each([
        ['bieg startu', props({ scenario: 'research' })],
        ['bieg akcji z raportami', props({ a2uiErrors: [buildError({ code: 'VALIDATION_FAILED', surfaceId: 'workspace', path: '/components/c1/kind', message: 'kind' })], diagnostics: [DIAG] })],
        ['bieg resync', props({ resync: { surfaces: ['workspace', 'hud'] } })],
        ['resync bez surface\'ów', props({ resync: { surfaces: [] } })],
        ['raport SURFACE_EXISTS (wariant ogólny A2UI)', props({ a2uiErrors: [buildError({ code: 'SURFACE_EXISTS', surfaceId: 'hud', message: 'istnieje' })] })],
    ])('przyjmuje: %s', (_, p) => {
        expect(forwardedProps(p), errors(forwardedProps)).toBe(true);
    });

    it.each([
        ['brak capabilities', clone({ flowassist: { profile: TRANSPORT_PROFILE } })],
        ['capabilities spoza schematu klienta', props({ capabilities: { a2uiClientCapabilities: {}, flowassist: { profile: TRANSPORT_PROFILE, kinds: {} } } })],
        ['nieznany surface w resync', props({ resync: { surfaces: ['main'] } })],
        ['powtórzony surface w resync', props({ resync: { surfaces: ['hud', 'hud'] } })],
        ['akcja w a2uiErrors (akcje jadą w resume)', props({ a2uiErrors: [buildAction('approve', 'hud', 'approval')] })],
        ['nieznany kod diagnostyki', props({ diagnostics: [{ ...DIAG, code: 'OTHER' }] })],
        ['33 raporty', props({ diagnostics: Array.from({ length: 33 }, () => DIAG) })],
        ['dodatkowe pole profilu', props({ limits: PROFILE_RULES.limits })],
        ['dodatkowy klucz forwardedProps', { ...props(), a2uiAction: {} }],
        ['pusty scenariusz', props({ scenario: '' })],
    ])('odrzuca: %s', (_, p) => {
        expect(forwardedProps(p)).toBe(false);
    });
});

// ── diagnostyka ───────────────────────────────────────────────────

describe('schemat diagnostyki', () => {
    it.each(RULES.codes.diagnostics as string[])('przyjmuje kod %s (z ramką i bez)', (code) => {
        expect(diagnostic({ code, message: 'm' }), errors(diagnostic)).toBe(true);
        expect(diagnostic({ code, message: 'm', frame: { runId: 'r', seq: 0 }, path: '/narration/extra' }), errors(diagnostic)).toBe(true);
    });

    it.each([
        ['kod raportu A2UI (ma surface → raport A2UI, nie diagnostyka)', { code: 'VALIDATION_FAILED', message: 'm' }],
        ['brak message', { code: 'ENVELOPE_REJECTED' }],
        ['seq ujemne', { ...DIAG, frame: { runId: 'r', seq: -1 } }],
        ['pusty runId', { ...DIAG, frame: { runId: '', seq: 0 } }],
        ['ścieżka bez wiodącego /', { ...DIAG, path: 'stage' }],
        ['surfaceId (diagnostyka nie ma surface)', { ...DIAG, surfaceId: 'hud' }],
    ])('odrzuca: %s', (_, d) => {
        expect(diagnostic(d)).toBe(false);
    });
});

// ── interrupt i resume ────────────────────────────────────────────

describe('schemat interruptu awaiting_action i odpowiedzi', () => {
    it('interrupt profilu (minimalny i z polami ignorowanymi)', () => {
        expect(interrupt({ id: 'int-1', reason: 'flowassist.awaiting_action' }), errors(interrupt)).toBe(true);
        expect(interrupt({ id: 'int-1', reason: 'flowassist.awaiting_action', message: 'Decyzja', metadata: {} }), errors(interrupt)).toBe(true);
    });

    it.each([
        ['inny reason', { id: 'i', reason: 'approval' }],
        ['expiresAt (zakazane w profilu/1)', { id: 'i', reason: 'flowassist.awaiting_action', expiresAt: '2026-10-07T00:00:00Z' }],
        ['pusty id', { id: '', reason: 'flowassist.awaiting_action' }],
    ])('interrupt odrzucony: %s', (_, i) => {
        expect(interrupt(i)).toBe(false);
    });

    const action = buildAction('approve', 'hud', 'approval', { itemId: 'c1', workspace: { screen: null, focus: null, dismissed: [] } });
    const actionBody = 'action' in action ? action.action : null;

    it('wpis resume z kopertą A2UI action zbudowaną przez klienta', () => {
        expect(resumeEntry({ interruptId: 'int-1', status: 'resolved', payload: action }), errors(resumeEntry)).toBe(true);
    });

    it.each([
        ['status cancelled (profil/1 zawsze odpowiada akcją)', { interruptId: 'i', status: 'cancelled', payload: action }],
        ['brak payload', { interruptId: 'i', status: 'resolved' }],
        ['payload z raportem zamiast akcji', { interruptId: 'i', status: 'resolved', payload: buildError({ code: 'SURFACE_NOT_FOUND', surfaceId: 'hud', message: 'm' }) }],
        ['payload w kształcie middleware (a2uiAction.userAction)', { interruptId: 'i', status: 'resolved', payload: { a2uiAction: { userAction: actionBody } } }],
    ])('wpis resume odrzucony: %s', (_, r) => {
        expect(resumeEntry(r)).toBe(false);
    });
});

// ── capabilities agenta: parytet z negotiate() ────────────────────

const SHAPE_FAILURES = new Set([
    'PROFILE_UNSUPPORTED', 'SERVER_CAPABILITIES_INVALID', 'SERVER_CATALOGS_UNDECLARED',
    'FLOWASSIST_CAPABILITIES_MISSING', 'FLOWASSIST_CAPABILITIES_INVALID',
]);
const SERVER = clone(MOCK_SERVER_CAPABILITIES) as ServerCapabilities;
const server = (patch: Record<string, unknown>) => ({ ...clone(SERVER), ...patch });

describe('schemat capabilities agenta ⇔ negotiate() (porażki kształtu)', () => {
    it('capabilities mocka spełniają schemat', () => {
        expect(serverCaps(MOCK_SERVER_CAPABILITIES), errors(serverCaps)).toBe(true);
    });

    // Wszystkie przypadki mają wspólny katalog — inaczej krok 3 (NO_COMMON_CATALOG, nie kształt) wygrywa z krokiem 4.
    const cases: [string, unknown][] = [
        ['poprawne', SERVER],
        ['dodatkowe pola (dozwolone)', server({ extra: 1 })],
        ['nieznany rodzaj i reprezentacja (pomijane)', server({ flowassist: { kinds: { ...SERVER.flowassist!.kinds, pie: ['pie3d'] } } })],
        ['pusta lista reprezentacji', server({ flowassist: { kinds: { chart: [], table: ['table2d'] } } })],
        ['brak wspólnej reprezentacji (krok 5, nie kształt)', server({ flowassist: { kinds: { slides: ['slides3d'] } } })],
        ['acceptsInlineCatalogs', server({ a2uiServerCapabilities: { 'v0.9': { supportedCatalogIds: ['flowassist/v2'], acceptsInlineCatalogs: true } } })],
        ['brak transportProfiles', (() => { const s = server({}); delete (s as Record<string, unknown>).transportProfiles; return s; })()],
        ['inny profil', server({ transportProfiles: ['flowassist-transport/2'] })],
        ['transportProfiles z nie-stringiem', server({ transportProfiles: ['flowassist-transport/1', 1] })],
        ['brak klucza v0.9', server({ a2uiServerCapabilities: {} })],
        ['brak supportedCatalogIds (profil/1 wymaga)', server({ a2uiServerCapabilities: { 'v0.9': {} } })],
        ['acceptsInlineCatalogs nie-boolean', server({ a2uiServerCapabilities: { 'v0.9': { supportedCatalogIds: ['flowassist/v2'], acceptsInlineCatalogs: 'tak' } } })],
        ['brak rozszerzenia flowassist', (() => { const s = server({}); delete (s as Record<string, unknown>).flowassist; return s; })()],
        ['flowassist null', server({ flowassist: null })],
        ['kinds nie jest obiektem', server({ flowassist: { kinds: [] } })],
        ['wartość kinds nie jest tablicą', server({ flowassist: { kinds: { chart: 'chart2d' } } })],
        ['reprezentacja nie-string', server({ flowassist: { kinds: { chart: [1] } } })],
        ['zarezerwowany rodzaj', server({ flowassist: { kinds: JSON.parse('{"chart":["chart2d"],"constructor":["chart2d"]}') } })],
        ['zarezerwowana reprezentacja', server({ flowassist: { kinds: { chart: ['chart2d', 'prototype'] } } })],
    ];
    it.each(cases)('%s', (_, caps) => {
        const r = negotiate(caps, clientCapabilities());
        const guardRejectsShape = !r.ok && SHAPE_FAILURES.has(r.reason);
        expect(guardRejectsShape, `negotiate: ${r.ok ? 'OK' : r.reason}`).toBe(!serverCaps(caps));
    });
});
