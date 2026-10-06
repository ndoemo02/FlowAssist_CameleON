// Profil transportowy flowassist-transport/1 (ADR 0002, oś 3): reguły STAŁE dla wersji profilu.
// Nie są wysyłane w capabilities (nie podlegają negocjacji). Normatywnym źródłem jest blok reguł maszynowych
// dokumentu docs/protocol/flowassist-transport-1.md (§15); test parytetu porównuje go z PROFILE_RULES.
// Zmiana dowolnej reguły = świadoma zmiana dokumentu i tego pliku albo nowa wersja profilu.
// Stałe adaptera (limity bajtów i czasu, reconnect, akcje, kody) nie mają jeszcze konsumenta w runtime — użyje ich
// adapter P1.6; dziś pilnuje ich wyłącznie parytet z dokumentem (bez zmiany zachowania).

import { A2UI_VERSION, ACCEPTED_VERSIONS, PRESENTATIONS, PROTOCOL_LIMITS, RESERVED_KEYS, type CatalogName } from '../contract';
import type { CATALOG_PROPS } from '../catalog';

export const TRANSPORT_PROFILE = 'flowassist-transport/1' as const;

/** Profil §2.4, §4.5, §6.4: stałe wiązania z AG-UI. */
export const AGUI_BINDING = {
    protocolVersion: '1.0',
    protocolVersionPattern: '^1\\.(0|[1-9][0-9]*)$',
    frameEventName: 'flowassist.frame',
    awaitingActionReason: 'flowassist.awaiting_action',
} as const;

/** Profil §6.2, §7.2 (H1). */
export const TRANSPORT_TIMEOUTS = {
    keepAliveMaxIntervalMs: 15_000,
    idleTimeoutMs: 45_000,
    headersTimeoutMs: 30_000,
    terminalGraceMs: 5_000,
} as const;

/** Profil §7.1, §7.3 (D14, M2). */
export const RECONNECT_POLICY = {
    delaysMs: [1_000, 2_000, 4_000],
    retryableHttpStatus: [408, 429, 502, 503, 504],
    retryAfterMaxMs: 60_000,
} as const;

/** Profil §8.3 (D12, M1, N1, N2): jedno miejsce na akcję i warunki wysłania akcji oczekującej. */
export const ACTION_POLICY = {
    slots: 1,
    pendingMatch: ['interruptId', 'surfaceId', 'sourceComponentId', 'itemInstance'],
} as const;

/** Profil §10.5 (ST-4 (a)): propsy tylko dosłowne — każdy musi być propsem katalogu (sprawdza typ). */
export const LITERAL_ONLY_PROPS = {
    WorkspaceItem: ['presentation', 'priority'],
} as const satisfies { [C in CatalogName]?: readonly (typeof CATALOG_PROPS)[C][number][] };

/** Profil §10.6 (D19). */
export const ID_FORBIDDEN_CHARS = ['/', '~'] as const;

/** Profil §11.2: zamknięte listy kodów raportów, diagnostyki i statusów `error`. */
export const PROFILE_CODES = {
    a2uiErrors: ['VALIDATION_FAILED', 'SURFACE_EXISTS', 'SURFACE_NOT_FOUND'],
    diagnostics: ['ENVELOPE_REJECTED', 'STAGE_REJECTED', 'NARRATION_REJECTED', 'MESSAGE_TOO_LARGE'],
    runErrors: [
        'profile:FRAME_INVALID', 'profile:FRAME_SEQUENCE', 'profile:EVENT_TOO_LARGE', 'profile:AGUI_VERSION',
        'profile:UNSUPPORTED_INTERRUPTS', 'profile:UNEXPECTED_TOOL_CALLS', 'agui:PROTOCOL_VIOLATION',
        'transport:AUTH_REJECTED', 'transport:INPUT_REJECTED', 'transport:SERVER_ERROR', 'transport:UNEXPECTED_RESPONSE',
    ],
    runErrorPrefixes: ['negotiation:', 'agent:'],
} as const;

// Zamrożone także w runtime (`as const` działa tylko na typach): mutacja reguły rozjechałaby profil z guardami.
// Zamraża też współdzielone stałe kontraktu (PRESENTATIONS, PROTOCOL_LIMITS, ACCEPTED_VERSIONS) — są tylko do odczytu.
const freezeDeep = <T>(v: T): T => {
    if (v !== null && typeof v === 'object') {
        Object.freeze(v);
        for (const x of Object.values(v)) freezeDeep(x);
    }
    return v;
};

export const PROFILE_RULES = freezeDeep({
    profile: TRANSPORT_PROFILE,
    envelope: { send: A2UI_VERSION, accept: ACCEPTED_VERSIONS },
    presentations: PRESENTATIONS,
    limits: {
        ...freezeDeep(PROTOCOL_LIMITS),
        eventMaxBytes: 1_048_576,
        messageMaxBytes: 262_144,
        pendingReportsMax: 32,
    },
    reservedKeys: Array.from(RESERVED_KEYS),
    agui: AGUI_BINDING,
    timeouts: TRANSPORT_TIMEOUTS,
    reconnect: RECONNECT_POLICY,
    actions: ACTION_POLICY,
    literalOnlyProps: LITERAL_ONLY_PROPS,
    idForbiddenChars: ID_FORBIDDEN_CHARS,
    codes: PROFILE_CODES,
} as const);
