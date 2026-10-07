// Kanoniczny plan resync (profil flowassist-transport/1 §7.8, A1): deterministyczny, liczony WYŁĄCZNIE ze stanu.
// Niezmiennik odtwarzalności: stan profilu/1 jest legalny tylko wtedy, gdy ten plan — łącznie z odtworzeniem pustych
// miejsc w tablicach — mieści się w limitach transakcji resync (PROFILE_RULES.resync) i limicie części (256 KiB).
// Plan jest górnym ograniczeniem: agent MOŻE odtworzyć stan mniejszą liczbą części; jeśli plan się mieści, poprawne
// odtworzenie istnieje. Dziś bez konsumenta w runtime — egzekwowanie przed zatwierdzeniem zmiany należy do P1.6.

import { A2UI_VERSION, SURFACE_IDS } from '../contract';
import type { CoreState } from '../reducer';
import { PROFILE_RULES } from './profile';

export type ResyncPlanFailure = 'PART_TOO_LARGE' | 'MAX_PARTS' | 'MAX_BYTES';
export type ResyncPlan =
    | { ok: true; parts: unknown[]; partCount: number; bytes: number }
    | { ok: false; reason: ResyncPlanFailure; partCount: number; bytes: number };

type PlanState = Pick<CoreState, 'surfaces' | 'stage' | 'narration'>;

const encoder = new TextEncoder();
/** Miara z profilu §10.8: bajty UTF-8 `JSON.stringify` wiadomości (puste miejsca tablic stają się `null`). */
export const messageBytes = (m: unknown) => encoder.encode(JSON.stringify(m)).length;

const escapeSegment = (s: string) => s.replace(/~/g, '~0').replace(/\//g, '~1');
const pointer = (segs: readonly string[]) => segs.map((s) => '/' + escapeSegment(s)).join('');
const isPlainObject = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v);

class Overflow extends Error {
    constructor(readonly reason: ResyncPlanFailure) { super(reason); }
}

/** Puste miejsca tablic (element nieobecny albo `undefined`) w kolejności DFS: klucze obiektu, indeksy rosnąco. */
function holes(node: unknown, path: string[], out: string[][]) {
    if (Array.isArray(node)) {
        for (let i = 0; i < node.length; i++) {
            if (!(i in node) || node[i] === undefined) out.push([...path, String(i)]);
            else holes(node[i], [...path, String(i)], out);
        }
    } else if (isPlainObject(node)) {
        for (const k of Object.keys(node)) holes(node[k], [...path, k], out);
    }
}

/**
 * Plan kanoniczny (profil §7.8). Dla każdego surface'u w kolejności SURFACE_IDS:
 * `createSurface`; każdy komponent osobnym `updateComponents`; dane: podstawa `updateDataModel` bez `path` — jeśli
 * nie mieści się w części, obiekt jest dzielony po kluczach (`{}` pod ścieżką, potem dzieci), a tablice i wartości
 * proste są niepodzielne; potem każde puste miejsce osobnym `updateDataModel` z `path` bez `value`.
 * Na końcu `stage` i `narration` (`speak: false`).
 */
export function resyncPlan(state: PlanState): ResyncPlan {
    const { messageMaxBytes } = PROFILE_RULES.limits;
    const { maxParts, maxBytes } = PROFILE_RULES.resync;
    const parts: unknown[] = [];
    let bytes = 0;
    const push = (m: unknown) => {
        const b = messageBytes(m);
        if (b > messageMaxBytes) throw new Overflow('PART_TOO_LARGE');
        parts.push(m);
        bytes += b;
        if (parts.length > maxParts) throw new Overflow('MAX_PARTS');
        if (bytes > maxBytes) throw new Overflow('MAX_BYTES');
    };
    const fits = (m: unknown) => messageBytes(m) <= messageMaxBytes;

    try {
        for (const surfaceId of SURFACE_IDS) {
            const surface = state.surfaces[surfaceId];
            if (!surface) continue;
            push({ version: A2UI_VERSION, createSurface: { surfaceId, catalogId: surface.catalogId } });
            for (const component of Object.values(surface.components)) {
                push({ version: A2UI_VERSION, updateComponents: { surfaceId, components: [component] } });
            }
            const data = (path: string[], node: unknown) => {
                const body = path.length === 0 ? { surfaceId, value: node } : { surfaceId, path: pointer(path), value: node };
                const message = { version: A2UI_VERSION, updateDataModel: body };
                if (fits(message)) { push(message); return; }
                if (!isPlainObject(node)) throw new Overflow('PART_TOO_LARGE'); // tablice i wartości proste są niepodzielne
                push({ version: A2UI_VERSION, updateDataModel: { ...body, value: {} } });
                for (const k of Object.keys(node)) data([...path, k], node[k]);
            };
            data([], surface.data);
            const found: string[][] = [];
            holes(surface.data, [], found);
            for (const h of found) push({ version: A2UI_VERSION, updateDataModel: { surfaceId, path: pointer(h) } });
        }
        push({ stage: { focus: state.stage.focus, drawer: state.stage.drawer } });
        push({ narration: { text: state.narration.text, speak: false } });
    } catch (e) {
        if (e instanceof Overflow) return { ok: false, reason: e.reason, partCount: parts.length, bytes };
        throw e;
    }
    return { ok: true, parts, partCount: parts.length, bytes };
}

/** Niezmiennik odtwarzalności (profil §7.8): czy stan jest legalnym stanem profilu/1. */
export const isResyncable = (state: PlanState) => resyncPlan(state).ok;
