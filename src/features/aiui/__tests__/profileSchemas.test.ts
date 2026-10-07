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
import { PROFILE_DOC_JSON_BLOCKS as jsonBlocks, PROFILE_DOC_RULES as RULES } from './fixtures/profileDoc';

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
const control = ref('control.schema.json');
// wiadomość profilu (warstwa 3, niefatalna): oś 1–2 + obiekty zamknięte profilu
const profileMessage = ajv.compile({ allOf: [
    { $ref: 'https://flowassist.local/schemas/flowassist-v2/envelope.agent-to-client.schema.json' },
    { $ref: T1 + 'message.schema.json' },
] });
const forwardedProps = ref('forwarded-props.schema.json');
const diagnostic = ref('diagnostic.schema.json');
const interrupt = ref('interrupt.schema.json');
const resumeEntry = ref('interrupt.schema.json#/$defs/resumeEntry');
const serverCaps = ref('server-capabilities.schema.json');
const readSchema = (name: string) => JSON.parse(readFileSync(SCHEMAS + 'flowassist-transport-1/' + name, 'utf-8'));

const errors = (v: ValidateFunction) => JSON.stringify(v.errors);
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));

// ── dokument profilu ──────────────────────────────────────────────


describe('dokument profilu: przykłady i reguły maszynowe', () => {
    it('blok reguł maszynowych istnieje i dotyczy profilu/1', () => {
        expect(RULES.profile).toBe(TRANSPORT_PROFILE);
    });

    it('przykład ramki z §4.5: koperta transportowa i wiadomość profilu poprawne', () => {
        const example = jsonBlocks.map((b) => { try { return JSON.parse(b); } catch { return null; } })
            .find((o) => o?.name === 'flowassist.frame');
        expect(example).toBeTruthy();
        expect(frame(example), errors(frame)).toBe(true);
        expect(profileMessage(example.value.message), errors(profileMessage)).toBe(true);
    });

    it('przykład transakcji resync z §7.7: begin → części → complete z poprawnym parts', () => {
        const example = jsonBlocks.map((b) => { try { return JSON.parse(b); } catch { return null; } })
            .find((o) => Array.isArray(o) && o[0]?.message?.resync?.phase === 'begin');
        expect(example).toBeTruthy();
        example.forEach((value: { seq: number; message: unknown }, i: number) => {
            expect(value.seq).toBe(i); // seq od 0, +1 na ramkę
            expect(frame({ type: 'CUSTOM', name: 'flowassist.frame', value }), errors(frame)).toBe(true);
        });
        const [first, ...rest] = example;
        const last = rest.pop();
        expect(control(first.message), errors(control)).toBe(true);
        expect(control(last.message), errors(control)).toBe(true);
        expect(last.message.resync).toEqual({ phase: 'complete', parts: rest.length });
        for (const part of rest) expect(profileMessage(part.message), errors(profileMessage)).toBe(true);
        // puste miejsce: null w podstawie, potem odtworzenie bez value (Astra 2)
        expect(rest.some((p: { message: { updateDataModel?: { path?: string; value?: unknown } } }) =>
            p.message.updateDataModel?.path !== undefined && !('value' in p.message.updateDataModel))).toBe(true);
    });

    it('przykład wejścia biegu akcji z §8.1: wpis resume spełnia schemat', () => {
        const example = jsonBlocks.map((b) => { try { return JSON.parse(b); } catch { return null; } })
            .find((o) => Array.isArray(o?.resume));
        expect(example).toBeTruthy();
        expect(example.resume).toHaveLength(1);
        expect(resumeEntry(example.resume[0]), errors(resumeEntry)).toBe(true);
    });

    it('stałe schematów = blok reguł (nazwa ramki, profil, reason interruptu, kody, limity, klucze, surface)', () => {
        const f = readSchema('frame.schema.json');
        expect(f.properties.name.const).toBe(RULES.agui.frameEventName);
        expect(f.properties.value.properties.profile.const).toBe(RULES.profile);
        expect(readSchema('interrupt.schema.json').properties.reason.const).toBe(RULES.agui.awaitingActionReason);
        expect(readSchema('diagnostic.schema.json').properties.code.enum).toEqual(RULES.codes.diagnostics);
        const a2uiErrorCodes = readSchema('forwarded-props.schema.json').properties.flowassist.properties.a2uiErrors.items.allOf[2];
        expect(a2uiErrorCodes.properties.error.properties.code.enum).toEqual(RULES.codes.a2uiErrors);
        expect(readSchema('message.schema.json').$defs.id.pattern).toBe(`^[^${RULES.idForbiddenChars.join('')}]+$`);
        const c = readSchema('control.schema.json');
        expect(c.required).toEqual([RULES.resync.controlKey]);
        expect(c.properties.resync.oneOf[1].properties.parts.maximum).toBe(RULES.resync.maxParts);
        const fp = readSchema('forwarded-props.schema.json').properties.flowassist.properties;
        expect(fp.profile.const).toBe(RULES.profile);
        expect(fp.a2uiErrors.maxItems).toBe(RULES.limits.pendingReportsMax);
        expect(fp.diagnostics.maxItems).toBe(RULES.limits.pendingReportsMax);
        expect(fp.resync.properties.surfaces.items.enum).toEqual([...SURFACE_IDS]);
        const kinds = readSchema('server-capabilities.schema.json').properties.flowassist.properties.kinds;
        expect(kinds.propertyNames.not.enum).toEqual(RULES.reservedKeys);
        expect(kinds.additionalProperties.items.not.enum).toEqual(RULES.reservedKeys);
    });

    it('D14: sieć nigdy nie kończy przebiegu — brak kodów błędu sieciowego w statusach', () => {
        const all = [...RULES.codes.runErrors, ...RULES.codes.runErrorPrefixes] as string[];
        expect(all.filter((c) => /NETWORK|CONNECTION|HTTP_|TIMEOUT/.test(c))).toEqual([]);
        expect(RULES.codes.runErrors).toContain('transport:INPUT_REJECTED'); // odrzucenie treści to nie sieć
    });

    it('pełny parytet: blok reguł dokumentu (§15) = PROFILE_RULES (kod)', () => {
        // JSON round-trip: porównanie wartości, nie zamrożonych referencji ani kolejności kluczy
        expect(JSON.parse(JSON.stringify(PROFILE_RULES))).toEqual(RULES);
    });
});

// ── ramka: trzy warstwy walidacji (profil §4.5, §5.4, §7.7; Astra 4) ─────────

const FRAME = {
    type: 'CUSTOM',
    name: 'flowassist.frame',
    value: { profile: 'flowassist-transport/1', seq: 0, message: { stage: { focus: 'back' } } },
};
const withValue = (patch: Record<string, unknown>) => ({ ...FRAME, value: { ...FRAME.value, ...patch } });

describe('warstwa 1: koperta transportowa ramki (fatalna bramka)', () => {
    it.each([
        ['stage', FRAME],
        ['narration', withValue({ message: { narration: { text: 'Gotowe.', speak: true } } })],
        ['updateDataModel', withValue({ seq: 7, message: { version: 'v0.9', updateDataModel: { surfaceId: 'workspace', path: '/rows', value: [] } } })],
        ['pola wspólne AG-UI', { ...FRAME, timestamp: 1759766400000, metadata: { trace: 'x' }, subagentRunId: 'sub-1' }],
        ['seq = 2^53 − 1', withValue({ seq: Number.MAX_SAFE_INTEGER })],
        ['wiadomość sterująca resync', withValue({ message: { resync: { phase: 'begin' } } })],
        // Astra 4: wada TREŚCI nie jest wadą ramki — koperta poprawna, wiadomość odrzucana niefatalnie (§11)
        ['message: null (treść wadliwa → niefatalnie)', withValue({ message: null })],
        ['message: tablica (treść wadliwa → niefatalnie)', withValue({ message: [{ stage: { focus: 'back' } }] })],
        ['message mieszana (treść wadliwa → niefatalnie)', withValue({ message: { stage: { focus: 'back' }, narration: { text: null } } })],
        ['message z nieznanym polem (treść wadliwa → niefatalnie)', withValue({ message: { narration: { text: 'a', extra: true } } })],
    ])('przyjmuje kopertę: %s', (_, f) => {
        expect(frame(f), errors(frame)).toBe(true);
    });

    it.each([
        ['inna nazwa CUSTOM', { ...FRAME, name: 'flowassist.other' }],
        ['inny typ zdarzenia', { ...FRAME, type: 'ACTIVITY_SNAPSHOT' }],
        ['brak seq', { ...FRAME, value: { profile: FRAME.value.profile, message: FRAME.value.message } }],
        ['brak message', { ...FRAME, value: { profile: FRAME.value.profile, seq: 0 } }],
        ['seq ujemne', withValue({ seq: -1 })],
        ['seq ułamkowe', withValue({ seq: 1.5 })],
        ['seq jako tekst', withValue({ seq: '0' })],
        ['inny profil', withValue({ profile: 'flowassist-transport/2' })],
        ['dodatkowy klucz w value', withValue({ id: 'x' })],
        ['value nie jest obiektem', { ...FRAME, value: 'x' }],
        ['dodatkowe pole zdarzenia (obowiązek agenta; w kliencie usuwa je wcześniej potok AG-UI)', { ...FRAME, extra: 1 }],
    ])('odrzuca kopertę: %s', (_, f) => {
        expect(frame(f)).toBe(false);
    });
});

describe('warstwa 3: wiadomość profilu (niefatalna; message.schema + oś 1–2)', () => {
    it.each([
        ['null', null],
        ['tablica (kilka wiadomości)', [{ stage: { focus: 'back' } }]],
        ['wiadomość mieszana (OBS-4)', { stage: { focus: 'back' }, narration: { text: null } }],
        ['wiadomość sterująca to nie wiadomość profilu', { resync: { phase: 'begin' } }],
        // FU-4: klucz zarezerwowany w danych, które poza nim są poprawne (sam klucz jest jedyną przyczyną odrzucenia)
        ['klucz zarezerwowany w wartości data modelu (FU-4)', JSON.parse('{"version":"v0.9.1","updateDataModel":{"surfaceId":"workspace","path":"/m","value":{"constructor":1}}}')],
        // D17: obiekty zamknięte (dziś runtime je przepuszcza — egzekwowanie w P1.6)
        ['narration z nieznanym kluczem (D17)', { narration: { text: 'a', extra: true } }],
        ['koperta z dodatkowym polem najwyższego poziomu (D17)', { version: 'v0.9.1', deleteSurface: { surfaceId: 'hud' }, trace: 1 }],
        ['payload z polem spoza upstream (D17)', { version: 'v0.9.1', createSurface: { surfaceId: 'hud', catalogId: 'flowassist/v2', extra: 1 } }],
        ['updateDataModel z polem spoza upstream (D17)', { version: 'v0.9.1', updateDataModel: { surfaceId: 'hud', path: '/a', value: 1, op: 'add' } }],
        // D19: znaki ścieżki w identyfikatorach
        ['id z "/" (D19)', { version: 'v0.9.1', updateComponents: { surfaceId: 'hud', components: [{ id: 'a/b', component: 'TaskList' }] } }],
        ['id z "~" (D19)', { version: 'v0.9.1', updateComponents: { surfaceId: 'hud', components: [{ id: 'a~1', component: 'TaskList' }] } }],
        ['wpis children z "/" (D19)', { version: 'v0.9.1', updateComponents: { surfaceId: 'hud', components: [{ id: 'root', component: 'TaskList', children: ['x/y'] }] } }],
    ])('odrzuca: %s', (_, message) => {
        expect(profileMessage(message)).toBe(false);
    });

    it.each([
        ['propsy komponentu otwarte (I3, OBS-6)', { version: 'v0.9.1', updateComponents: { surfaceId: 'workspace', components: [{ id: 'c1', component: 'WorkspaceItem', kind: 'chart', x: 3, custom: { a: 1 } }] } }],
        ['createSurface z theme i sendDataModel (upstream; klient ignoruje)', { version: 'v0.9.1', createSurface: { surfaceId: 'hud', catalogId: 'flowassist/v2', theme: {}, sendDataModel: false } }],
        ['updateDataModel bez path i value (upstream)', { version: 'v0.9.1', updateDataModel: { surfaceId: 'hud' } }],
        ['odtworzenie pustego miejsca: path bez value (Astra 2)', { version: 'v0.9.1', updateDataModel: { surfaceId: 'workspace', path: '/rows/0' } }],
        ['narration bez speak', { narration: { text: null } }],
        ['kontrola FU-4: ta sama wartość z kluczem podobnym (constructorName)', { version: 'v0.9.1', updateDataModel: { surfaceId: 'workspace', path: '/m', value: { constructorName: 1 } } }],
        ['id z innymi znakami (kropka, myślnik, unicode)', { version: 'v0.9.1', updateComponents: { surfaceId: 'hud', components: [{ id: 'zad-1.ą', component: 'TaskList', children: ['b.2'] }] } }],
    ])('znane otwarte — przyjmuje: %s', (_, message) => {
        expect(profileMessage(message), errors(profileMessage)).toBe(true);
    });
});

describe('warstwa 2: wiadomość sterująca transakcji resync (fatalna, §7.7)', () => {
    it.each([
        ['begin', { resync: { phase: 'begin' } }],
        ['complete', { resync: { phase: 'complete', parts: 3 } }],
        ['complete z zerem części', { resync: { phase: 'complete', parts: 0 } }],
        ['complete z maksimum części', { resync: { phase: 'complete', parts: 1024 } }],
    ])('przyjmuje: %s', (_, m) => {
        expect(control(m), errors(control)).toBe(true);
    });

    it.each([
        ['nieznana faza', { resync: { phase: 'abort' } }],
        ['complete bez parts', { resync: { phase: 'complete' } }],
        ['parts ujemne', { resync: { phase: 'complete', parts: -1 } }],
        ['parts ponad limit', { resync: { phase: 'complete', parts: 1025 } }],
        ['parts ułamkowe', { resync: { phase: 'complete', parts: 1.5 } }],
        ['begin z parts', { resync: { phase: 'begin', parts: 1 } }],
        ['dodatkowy klucz obok resync', { resync: { phase: 'begin' }, stage: { focus: 'back' } }],
        ['dodatkowe pole w resync', { resync: { phase: 'begin', id: 'x' } }],
    ])('odrzuca: %s', (_, m) => {
        expect(control(m)).toBe(false);
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
        ['raport A2UI z kodem spoza zamkniętej listy (§11.2)', props({ a2uiErrors: [buildError({ code: 'RENDER_CRASHED', surfaceId: 'hud', message: 'm' })] })],
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
        ['expiresAt (obowiązek agenta: nie wysyłać; klient je ignoruje, §6.4)', { id: 'i', reason: 'flowassist.awaiting_action', expiresAt: '2026-10-07T00:00:00Z' }],
        ['pusty id', { id: '', reason: 'flowassist.awaiting_action' }],
    ])('interrupt odrzucony: %s', (_, i) => {
        expect(interrupt(i)).toBe(false);
    });

    const action = buildAction('approve', 'hud', 'approval', { itemId: 'c1', workspace: { screen: null, focus: null, dismissed: [] } });
    const actionBody = 'action' in action ? action.action : null;

    it('wpis resume z kopertą A2UI action zbudowaną przez klienta (bieg akcji)', () => {
        expect(resumeEntry({ interruptId: 'int-1', status: 'resolved', payload: action }), errors(resumeEntry)).toBe(true);
    });

    it('porzucenie niepokrytego interruptu w resync: cancelled bez payload (§7.2)', () => {
        expect(resumeEntry({ interruptId: 'int-1', status: 'cancelled' }), errors(resumeEntry)).toBe(true);
    });

    it.each([
        ['cancelled z akcją (porzucenie nie niesie akcji — brak replay, §8.4)', { interruptId: 'i', status: 'cancelled', payload: action }],
        ['cancelled bez interruptId', { status: 'cancelled' }],
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
