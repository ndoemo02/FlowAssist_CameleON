// Kontrakt agent ↔ renderer (katalog flowassist/v2, plan v1.2.1).
// Koperta zgodna z A2UI v0.9.1 (createSurface / updateComponents / updateDataModel /
// deleteSurface oraz action / error od klienta) + dwa rozszerzenia aplikacji (stage, narration).
// Agent nigdy nie podaje współrzędnych — tylko semantyczny fokus, zamknięte surfaceId
// i semantyczny hint prezentacji elementu (card / focus / screen).

import { parsePointer } from './jsonPointer';

export const A2UI_VERSION = 'v0.9.1' as const;
export const CATALOG_ID = 'flowassist/v2' as const;
/** Wersje koperty przyjmowane na wejściu (OBS-3, ADR 0002 oś 1); wychodzące zawsze A2UI_VERSION. Reguła profilu (P1.7a). */
export const ACCEPTED_VERSIONS = Object.freeze(['v0.9', 'v0.9.1'] as const);
const ACCEPTED = new Set<string>(ACCEPTED_VERSIONS);

/**
 * Limity zasobów protokołu (FU-3, ADR 0002): niezaufane zdarzenie musi mieć rozsądny rozmiar, ZANIM dotknie stanu.
 * Długość w PUNKTACH KODOWYCH Unicode — ta sama jednostka co `maxLength` w JSON Schema.
 * Scenariusz research używa 2–3 segmentów i ścieżek < 40 znaków; limit zostawia duży zapas, a odcina ścieżki,
 * które przepełniały stos w rekurencyjnym setAt (~10 tys. segmentów).
 */
export const PROTOCOL_LIMITS = {
    dataModelPathMaxLength: 512,
    dataModelPathMaxSegments: 32,
} as const;

export const SURFACE_IDS = ['workspace', 'tasks-drawer', 'hud'] as const;
export type SurfaceId = (typeof SURFACE_IDS)[number];

export const CATALOG_NAMES = ['Workspace', 'WorkspaceItem', 'TaskList', 'Approval'] as const;
export type CatalogName = (typeof CATALOG_NAMES)[number];

/** Rodzaje elementów stołu roboczego (v1.2). */
export const ITEM_KINDS = ['chart', 'kpi', 'table', 'map', 'slides'] as const;
export type ItemKind = (typeof ITEM_KINDS)[number];

/** Reprezentacje: precyzyjne (v1.2) i przestrzenne (v1.3 — w katalogu, jeszcze nieobsługiwane). */
export const REPRESENTATIONS = ['chart2d', 'cards2d', 'table2d', 'map2d', 'slides2d', 'liquid3d', 'ribbon3d', 'kpi3d'] as const;
export type Representation = (typeof REPRESENTATIONS)[number];

/** Hint prezentacji od agenta ('stash' → v1.3). 'dismissed' jest wyłącznie lokalne (użytkownik). */
export const PRESENTATIONS = ['card', 'focus', 'screen'] as const;
export type Presentation = (typeof PRESENTATIONS)[number];

export type Focus = 'front' | 'back';
export type DrawerState = 'open' | 'closed';

export type Binding = { path: string };

export interface A2Component {
    id: string;
    component: string;
    children?: string[];
    [prop: string]: unknown;
}

export type CreateSurfaceMsg = { version: string; createSurface: { surfaceId: SurfaceId; catalogId: typeof CATALOG_ID } };
export type UpdateComponentsMsg = { version: string; updateComponents: { surfaceId: SurfaceId; components: A2Component[] } };
export type UpdateDataModelMsg = { version: string; updateDataModel: { surfaceId: SurfaceId; path?: string; value?: unknown } };
export type DeleteSurfaceMsg = { version: string; deleteSurface: { surfaceId: SurfaceId } };
export type StageMsg = { stage: { focus?: Focus; drawer?: DrawerState } };
export type NarrationMsg = { narration: { text: string | null; speak?: boolean } };

export type AiUiEvent =
    | CreateSurfaceMsg
    | UpdateComponentsMsg
    | UpdateDataModelMsg
    | DeleteSurfaceMsg
    | StageMsg
    | NarrationMsg;

export type ClientError =
    | { code: 'VALIDATION_FAILED'; surfaceId: SurfaceId; path: string; message: string }
    | { code: string; surfaceId: SurfaceId; message: string };

export type ClientMessage =
    | {
        version: typeof A2UI_VERSION;
        action: {
            name: string;
            surfaceId: SurfaceId;
            sourceComponentId: string;
            timestamp: string;
            context: Record<string, unknown>;
        };
    }
    | { version: typeof A2UI_VERSION; error: ClientError };

// ── guards ─────────────────────────────────────────────────────────

const isObj = (v: unknown): v is Record<string, unknown> =>
    v !== null && typeof v === 'object' && !Array.isArray(v);

export const isSurfaceId = (v: unknown): v is SurfaceId =>
    typeof v === 'string' && (SURFACE_IDS as readonly string[]).includes(v);

export const isCatalogName = (v: unknown): v is CatalogName =>
    typeof v === 'string' && (CATALOG_NAMES as readonly string[]).includes(v);

export const isBinding = (v: unknown): v is Binding =>
    isObj(v) && typeof v.path === 'string' && Object.keys(v).length === 1;

const isPointer = (v: unknown) => typeof v === 'string' && (v === '' || v.startsWith('/'));

/**
 * Długość w punktach kodowych ≤ max (para surogatów = 1, jak `maxLength` w JSON Schema), z wczesnym wyjściem:
 * ≤ max jednostek UTF-16 → na pewno mieści się; > 2·max → na pewno nie (punkt kodowy to najwyżej 2 jednostki);
 * liczenie tylko pomiędzy, więc pętla ma ograniczoną długość niezależnie od rozmiaru wejścia.
 */
function codePointsAtMost(s: string, max: number): boolean {
    if (s.length <= max) return true;
    if (s.length > 2 * max) return false;
    let n = 0;
    for (let i = 0; i < s.length; i++) {
        const c = s.charCodeAt(i);
        if (c >= 0xd800 && c <= 0xdbff && i + 1 < s.length) {
            const d = s.charCodeAt(i + 1);
            if (d >= 0xdc00 && d <= 0xdfff) i++; // para surogatów = jeden punkt kodowy
        }
        if (++n > max) return false;
    }
    return true;
}

/**
 * FU-4 (decyzja właściciela 2026-10-06): nazwy zarezerwowane. Klucz własny o takiej nazwie (JSON.parse tworzy
 * własne `__proto__`) albo wartość, która później staje się kluczem obiektu (id komponentu, wpis children, segment
 * ścieżki data modelu), mogłaby zmienić prototyp map stanu (np. `reducer.ts`: `next[c.id] = c`) albo dać walidatorom
 * pola dziedziczone. Granica protokołu odrzuca cały komunikat — po cichu, jak OBS-1 (raport w adapterze P1.6).
 */
export const RESERVED_KEYS: ReadonlySet<string> = new Set(['__proto__', 'constructor', 'prototype']);
const isReserved = (k: string) => RESERVED_KEYS.has(k);

/** Zarezerwowany klucz własny gdziekolwiek w ładunku. Iteracyjnie (ładunki bywają bardzo głębokie), cykle pomijane. */
function hasReservedKey(root: unknown): boolean {
    const stack: unknown[] = [root];
    const seen = new Set<object>();
    while (stack.length) {
        const v = stack.pop();
        if (v === null || typeof v !== 'object' || seen.has(v)) continue;
        seen.add(v);
        if (Array.isArray(v)) { for (const item of v) stack.push(item); continue; }
        for (const k of Object.keys(v)) {
            if (isReserved(k)) return true;
            stack.push((v as Record<string, unknown>)[k]);
        }
    }
    return false;
}

/** Ścieżka data modelu w limitach: najpierw długość (ograniczona), dopiero potem segmenty krótkiego napisu. */
const isBoundedPointer = (v: unknown): v is string =>
    isPointer(v) && codePointsAtMost(v as string, PROTOCOL_LIMITS.dataModelPathMaxLength)
    && parsePointer(v as string).length <= PROTOCOL_LIMITS.dataModelPathMaxSegments
    && !parsePointer(v as string).some(isReserved); // FU-4: segment staje się kluczem w data modelu

const isComponent = (v: unknown): v is A2Component =>
    isObj(v) &&
    typeof v.id === 'string' && v.id.length > 0 && !isReserved(v.id) && // FU-4: id staje się kluczem mapy komponentów
    typeof v.component === 'string' && v.component.length > 0 &&
    (v.children === undefined || (Array.isArray(v.children) && v.children.every((c) => typeof c === 'string' && !isReserved(c))));

const A2UI_KEYS = ['createSurface', 'updateComponents', 'updateDataModel', 'deleteSurface'] as const;
const PAYLOAD_KEYS = ['stage', 'narration', ...A2UI_KEYS] as const;

// ── diagnostyka odrzucenia (D7, profil flowassist-transport/1 §11.5) ────────────

/**
 * Zamknięta lista przyczyn odrzucenia na granicy protokołu — dokładnie dzisiejsze gałęzie parseEvent.
 * Adapter P1.6 mapuje je na raport A2UI albo diagnostykę profilu (profil §11.2–§11.5); nie powiela walidacji.
 */
export const PARSE_REASONS = [
    'NOT_OBJECT', 'RESERVED_KEY', 'PAYLOAD_COUNT', 'STAGE_INVALID', 'NARRATION_INVALID', 'VERSION_UNSUPPORTED',
    'SURFACE_UNKNOWN', 'CATALOG_MISMATCH', 'COMPONENT_INVALID', 'PATH_INVALID', 'PATH_LIMIT',
] as const;
export type ParseReason = (typeof PARSE_REASONS)[number];

export type ParseRejection = {
    ok: false;
    reason: ParseReason;
    /** Wskaźnik JSON w kopercie (profil §11.3): segmenty po id, nigdy po indeksie; '' = cała wiadomość. */
    path: string;
    /** Surface, jeśli da się go ustalić z koperty (wtedy raport A2UI, inaczej diagnostyka profilu). */
    surfaceId?: SurfaceId;
};
export type ParseResult = { ok: true; event: AiUiEvent } | ParseRejection;

/** Segment wskaźnika JSON (RFC 6901): `~` → `~0`, `/` → `~1`. */
const escapeSegment = (s: string) => s.replace(/~/g, '~0').replace(/\//g, '~1');
const pointer = (segs: readonly string[]) => segs.map((s) => '/' + escapeSegment(s)).join('');

type PathNode = { seg: string; parent: PathNode | null } | null;
const segsOf = (node: PathNode): string[] => {
    const out: string[] = [];
    for (let n = node; n; n = n.parent) out.push(n.seg);
    return out.reverse();
};

/**
 * Ścieżka do pierwszego zarezerwowanego klucza (to samo przejście co hasReservedKey; wołane tylko przy odrzuceniu,
 * więc koszt przyjętej wiadomości się nie zmienia). Profil §11.3: wewnątrz tablicy ścieżka kończy się na kolekcji,
 * z wyjątkiem `updateComponents.components`, gdzie segmentem jest poprawne `id` komponentu.
 */
function reservedKeyPath(root: Record<string, unknown>): string {
    const components = isObj(root.updateComponents) && Array.isArray(root.updateComponents.components)
        ? root.updateComponents.components : null;
    const stack: [unknown, PathNode, boolean][] = [[root, null, false]]; // [wartość, ścieżka, wewnątrz kolekcji]
    const seen = new Set<object>();
    while (stack.length) {
        const [v, node, collapsed] = stack.pop()!;
        if (v === null || typeof v !== 'object' || seen.has(v)) continue;
        seen.add(v);
        if (Array.isArray(v)) {
            for (const item of v) {
                const id = v === components && isObj(item) && typeof item.id === 'string' && item.id.length > 0 && !isReserved(item.id)
                    ? item.id : null;
                stack.push(id !== null && !collapsed ? [item, { seg: id, parent: node }, false] : [item, node, true]);
            }
            continue;
        }
        for (const k of Object.keys(v)) {
            const child: PathNode = collapsed ? node : { seg: k, parent: node };
            if (isReserved(k)) return pointer(segsOf(child));
            stack.push([(v as Record<string, unknown>)[k], child, collapsed]);
        }
    }
    return '';
}

/** Surface z jedynej koperty A2UI, jeśli da się go ustalić (do raportu A2UI zamiast diagnostyki). */
function surfaceOf(raw: Record<string, unknown>): SurfaceId | undefined {
    const present = A2UI_KEYS.filter((k) => k in raw);
    if (present.length !== 1) return undefined;
    const body = raw[present[0]];
    return isObj(body) && isSurfaceId(body.surfaceId) ? body.surfaceId : undefined;
}

const reject = (reason: ParseReason, path: string, surfaceId?: SurfaceId): ParseRejection =>
    surfaceId === undefined ? { ok: false, reason, path } : { ok: false, reason, path, surfaceId };

/** Pierwsza wada komponentu (ta sama kolejność co isComponent): ścieżka po id albo na kolekcji. */
function componentPath(c: unknown): string {
    const base = ['updateComponents', 'components'];
    if (!isObj(c) || typeof c.id !== 'string' || c.id.length === 0 || isReserved(c.id)) return pointer(base);
    const field = typeof c.component === 'string' && c.component.length > 0 ? 'children' : 'component';
    return pointer([...base, c.id, field]);
}

/**
 * Waliduje surowy komunikat od agenta i mówi, DLACZEGO go odrzuca (D7). Kolejność kontroli i wynik
 * przyjęcia/odrzucenia są identyczne z parseEvent (parseEvent jest jej opakowaniem).
 */
export function parseEventDiagnostic(raw: unknown): ParseResult {
    if (!isObj(raw)) return reject('NOT_OBJECT', '');
    // FU-4: zarezerwowany klucz własny na dowolnym poziomie ładunku (ścieżka liczona tylko przy odrzuceniu)
    if (hasReservedKey(raw)) return reject('RESERVED_KEY', reservedKeyPath(raw), surfaceOf(raw));
    // Dokładnie jeden payload: mieszana koperta (np. stage + createSurface) jest odrzucana w całości,
    // a nie częściowo konsumowana (ADR 0005, OBS-4).
    if (PAYLOAD_KEYS.filter((k) => k in raw).length !== 1) return reject('PAYLOAD_COUNT', '');

    if ('stage' in raw) {
        const s = raw.stage;
        if (!isObj(s)) return reject('STAGE_INVALID', '/stage');
        const keys = Object.keys(s);
        if (keys.length === 0) return reject('STAGE_INVALID', '/stage');
        const unknown = keys.find((k) => k !== 'focus' && k !== 'drawer');
        if (unknown !== undefined) return reject('STAGE_INVALID', pointer(['stage', unknown]));
        if (s.focus !== undefined && s.focus !== 'front' && s.focus !== 'back') return reject('STAGE_INVALID', '/stage/focus');
        if (s.drawer !== undefined && s.drawer !== 'open' && s.drawer !== 'closed') return reject('STAGE_INVALID', '/stage/drawer');
        return { ok: true, event: { stage: s as StageMsg['stage'] } };
    }

    if ('narration' in raw) {
        const n = raw.narration;
        if (!isObj(n)) return reject('NARRATION_INVALID', '/narration');
        if (!(n.text === null || typeof n.text === 'string')) return reject('NARRATION_INVALID', '/narration/text');
        if (n.speak !== undefined && typeof n.speak !== 'boolean') return reject('NARRATION_INVALID', '/narration/speak');
        return { ok: true, event: { narration: n as NarrationMsg['narration'] } };
    }

    if (typeof raw.version !== 'string' || !ACCEPTED.has(raw.version)) return reject('VERSION_UNSUPPORTED', '/version', surfaceOf(raw));
    const present = A2UI_KEYS.filter((k) => k in raw);
    if (present.length !== 1) return reject('PAYLOAD_COUNT', ''); // nieosiągalne po kontroli PAYLOAD_KEYS; zachowane jak w parseEvent
    const kind = present[0];
    const body = raw[kind];
    if (!isObj(body)) return reject('NOT_OBJECT', pointer([kind]));
    if (!isSurfaceId(body.surfaceId)) return reject('SURFACE_UNKNOWN', pointer([kind, 'surfaceId']));
    const surfaceId = body.surfaceId;

    switch (kind) {
        case 'createSurface':
            return body.catalogId === CATALOG_ID
                ? { ok: true, event: raw as CreateSurfaceMsg }
                : reject('CATALOG_MISMATCH', '/createSurface/catalogId', surfaceId);
        case 'updateComponents': {
            if (!Array.isArray(body.components)) return reject('COMPONENT_INVALID', '/updateComponents/components', surfaceId);
            const bad = body.components.findIndex((c) => !isComponent(c)); // = !every(isComponent)
            return bad === -1
                ? { ok: true, event: raw as UpdateComponentsMsg }
                : reject('COMPONENT_INVALID', componentPath(body.components[bad]), surfaceId);
        }
        case 'updateDataModel': {
            const path = body.path;
            if (path === undefined || isBoundedPointer(path)) return { ok: true, event: raw as UpdateDataModelMsg };
            const inLimits = isPointer(path) && codePointsAtMost(path as string, PROTOCOL_LIMITS.dataModelPathMaxLength)
                && parsePointer(path as string).length <= PROTOCOL_LIMITS.dataModelPathMaxSegments;
            const reason: ParseReason = isPointer(path) && !inLimits ? 'PATH_LIMIT' : 'PATH_INVALID'; // zły kształt albo segment zarezerwowany
            return reject(reason, '/updateDataModel/path', surfaceId);
        }
        case 'deleteSurface':
            return { ok: true, event: raw as DeleteSurfaceMsg };
    }
}

/** Waliduje surowy komunikat od agenta. Zwraca null dla wszystkiego, czego renderer nie obsłuży. */
export function parseEvent(raw: unknown): AiUiEvent | null {
    const r = parseEventDiagnostic(raw);
    return r.ok ? r.event : null;
}

// ── koperty klient → agent ────────────────────────────────────────

export function buildAction(
    name: string,
    surfaceId: SurfaceId,
    sourceComponentId: string,
    context: Record<string, unknown> = {},
    now: Date = new Date(),
): ClientMessage {
    return {
        version: A2UI_VERSION,
        action: { name, surfaceId, sourceComponentId, timestamp: now.toISOString(), context },
    };
}

export function buildError(error: ClientError): ClientMessage {
    return { version: A2UI_VERSION, error };
}
