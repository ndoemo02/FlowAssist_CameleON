// Kontrakt agent ↔ renderer (katalog flowassist/v2, plan v1.2.1).
// Koperta zgodna z A2UI v0.9.1 (createSurface / updateComponents / updateDataModel /
// deleteSurface oraz action / error od klienta) + dwa rozszerzenia aplikacji (stage, narration).
// Agent nigdy nie podaje współrzędnych — tylko semantyczny fokus, zamknięte surfaceId
// i semantyczny hint prezentacji elementu (card / focus / screen).

import { parsePointer } from './jsonPointer';

export const A2UI_VERSION = 'v0.9.1' as const;
export const CATALOG_ID = 'flowassist/v2' as const;
const ACCEPTED_VERSIONS = new Set(['v0.9', 'v0.9.1']);

/**
 * Limity zasobów protokołu (FU-3, ADR 0002): niezaufane zdarzenie musi mieć rozsądny rozmiar, ZANIM dotknie stanu.
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

/** Ścieżka data modelu w limitach: najpierw długość (O(1)), dopiero potem liczenie segmentów krótkiego napisu. */
const isBoundedPointer = (v: unknown): v is string =>
    isPointer(v) && (v as string).length <= PROTOCOL_LIMITS.dataModelPathMaxLength
    && parsePointer(v as string).length <= PROTOCOL_LIMITS.dataModelPathMaxSegments;

const isComponent = (v: unknown): v is A2Component =>
    isObj(v) &&
    typeof v.id === 'string' && v.id.length > 0 &&
    typeof v.component === 'string' && v.component.length > 0 &&
    (v.children === undefined || (Array.isArray(v.children) && v.children.every((c) => typeof c === 'string')));

const A2UI_KEYS = ['createSurface', 'updateComponents', 'updateDataModel', 'deleteSurface'] as const;
const PAYLOAD_KEYS = ['stage', 'narration', ...A2UI_KEYS] as const;

/** Waliduje surowy komunikat od agenta. Zwraca null dla wszystkiego, czego renderer nie obsłuży. */
export function parseEvent(raw: unknown): AiUiEvent | null {
    if (!isObj(raw)) return null;
    // Dokładnie jeden payload: mieszana koperta (np. stage + createSurface) jest odrzucana w całości,
    // a nie częściowo konsumowana (ADR 0005, OBS-4).
    if (PAYLOAD_KEYS.filter((k) => k in raw).length !== 1) return null;

    if ('stage' in raw) {
        const s = raw.stage;
        if (!isObj(s)) return null;
        const keys = Object.keys(s);
        if (keys.length === 0 || keys.some((k) => k !== 'focus' && k !== 'drawer')) return null;
        if (s.focus !== undefined && s.focus !== 'front' && s.focus !== 'back') return null;
        if (s.drawer !== undefined && s.drawer !== 'open' && s.drawer !== 'closed') return null;
        return { stage: s as StageMsg['stage'] };
    }

    if ('narration' in raw) {
        const n = raw.narration;
        if (!isObj(n)) return null;
        if (!(n.text === null || typeof n.text === 'string')) return null;
        if (n.speak !== undefined && typeof n.speak !== 'boolean') return null;
        return { narration: n as NarrationMsg['narration'] };
    }

    if (typeof raw.version !== 'string' || !ACCEPTED_VERSIONS.has(raw.version)) return null;
    const present = A2UI_KEYS.filter((k) => k in raw);
    if (present.length !== 1) return null;
    const kind = present[0];
    const body = raw[kind];
    if (!isObj(body) || !isSurfaceId(body.surfaceId)) return null;

    switch (kind) {
        case 'createSurface':
            return body.catalogId === CATALOG_ID ? (raw as CreateSurfaceMsg) : null;
        case 'updateComponents':
            return Array.isArray(body.components) && body.components.every(isComponent) ? (raw as UpdateComponentsMsg) : null;
        case 'updateDataModel':
            return body.path === undefined || isBoundedPointer(body.path) ? (raw as UpdateDataModelMsg) : null;
        case 'deleteSurface':
            return raw as DeleteSurfaceMsg;
    }
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
