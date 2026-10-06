// Handshake możliwości (P1.7a, ADR 0002 „Handshake możliwości”): kształt capabilities klienta i serwera,
// zamrożony snapshot klienta i negocjacja w STAŁEJ kolejności — pierwsza porażka wygrywa, nigdy cichy fallback.
// Kształt standardowej części wg normatywnych schematów A2UI (schemas/a2ui-v0.9/, obiekt pod kluczem "v0.9").

import { RESERVED_KEYS, type ItemKind } from '../contract';
import { catalogCapabilities, type CatalogKinds, type SupportedRepresentation } from '../catalog';
import { TRANSPORT_PROFILE } from './profile';

export interface ClientCapabilities {
    /** Standard A2UI (client_capabilities.json). */
    readonly a2uiClientCapabilities: { readonly 'v0.9': { readonly supportedCatalogIds: readonly string[] } };
    /** Rozszerzenie profilu, POZA obiektem A2UI: tylko to, co różni klientów (reguły profilu nie są wysyłane). */
    readonly flowassist: { readonly profile: typeof TRANSPORT_PROFILE; readonly kinds: CatalogKinds };
}

/** Capabilities serwera w profilu/1. Przychodzą spoza klienta, więc negotiate() sprawdza kształt w runtime. */
export interface ServerCapabilities {
    /** Profile transportowe, którymi serwer mówi (krok 1). */
    transportProfiles: string[];
    /** Standard A2UI (server_capabilities.json): supportedCatalogIds opcjonalne, acceptsInlineCatalogs domyślnie false. */
    a2uiServerCapabilities: { 'v0.9': { supportedCatalogIds?: string[]; acceptsInlineCatalogs?: boolean } };
    /** Wymagane w profilu/1 (krok 4): reprezentacje, które serwer potrafi generować, per rodzaj. Słownik otwarty. */
    flowassist?: { kinds: Record<string, string[]> };
}

/** Przyczyny porażki w kolejności kroków negocjacji (0–5). */
export const NEGOTIATION_FAILURES = [
    'SERVER_CAPABILITIES_UNKNOWN',      // 0: brak capabilities serwera przed startem (null)
    'PROFILE_UNSUPPORTED',              // 1: brak wspólnego profilu transportowego
    'SERVER_CAPABILITIES_INVALID',      // 2: kształt niezgodny z A2UI (brak "v0.9", złe typy)
    'SERVER_CATALOGS_UNDECLARED',       // 3: brak supportedCatalogIds (upstream pozwala, profil/1 wymaga)
    'NO_COMMON_CATALOG',                // 3: brak wspólnego catalogId
    'FLOWASSIST_CAPABILITIES_MISSING',  // 4: profil/1 bez rozszerzenia flowassist
    'FLOWASSIST_CAPABILITIES_INVALID',  // 4: zły kształt rozszerzenia albo klucz zarezerwowany
    'NO_COMMON_REPRESENTATION',         // 5: puste przecięcie reprezentacji dla wszystkich rodzajów
] as const;
export type NegotiationFailure = (typeof NEGOTIATION_FAILURES)[number];

export type Negotiation =
    | { readonly ok: true; readonly profile: typeof TRANSPORT_PROFILE; readonly catalogId: string; readonly kinds: CatalogKinds }
    | { readonly ok: false; readonly reason: NegotiationFailure };

// Wejścia są zawsze świeże (nowe obiekty), więc obiekt już zamrożony nie wymaga schodzenia w głąb.
function deepFreeze<T>(value: T): T {
    if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
        Object.freeze(value);
        for (const v of Object.values(value)) deepFreeze(v);
    }
    return value;
}

/**
 * Capabilities klienta jako NOWY, głęboko zamrożony snapshot. `startScenario` liczy go raz na przebieg i przekazuje
 * w `StartRequest`; transport nigdy nie buduje capabilities sam (tylko dołącza snapshot przebiegu do wywołań).
 */
export function clientCapabilities(): ClientCapabilities {
    const { catalogId, kinds } = catalogCapabilities();
    return deepFreeze({
        a2uiClientCapabilities: { 'v0.9': { supportedCatalogIds: [catalogId] } },
        flowassist: { profile: TRANSPORT_PROFILE, kinds },
    });
}

// Wejście pochodzi spoza klienta: tylko zwykłe obiekty (jak z JSON.parse), pola wyłącznie WŁASNE, tablice bez dziur.
const isObj = (v: unknown): v is Record<string, unknown> => {
    if (v === null || typeof v !== 'object' || Array.isArray(v)) return false;
    const proto = Object.getPrototypeOf(v);
    return proto === Object.prototype || proto === null;
};
const own = (o: object, k: string) => Object.prototype.hasOwnProperty.call(o, k);
const field = (o: Record<string, unknown>, k: string): unknown => (own(o, k) ? o[k] : undefined);
const isStrArray = (v: unknown): v is string[] => {
    if (!Array.isArray(v)) return false;
    for (let i = 0; i < v.length; i++) if (!own(v, String(i)) || typeof v[i] !== 'string') return false; // dziura = błąd
    return true;
};
const fail = (reason: NegotiationFailure): Negotiation => ({ ok: false, reason });

/**
 * Negocjacja profilu/1 (czysta funkcja). Kroki w stałej kolejności; pierwszy niespełniony kończy negocjację:
 * 0 capabilities znane → 1 wspólny profil → 2 kształt A2UI → 3 wspólny catalogId → 4 rozszerzenie flowassist →
 * 5 niepuste przecięcie reprezentacji per rodzaj. Nieznane, poprawnie utypowane rodzaje i reprezentacje serwera są
 * pomijane (zgodność w przód); pusta tablica jest poprawna. Wynik (sukces) jest zamrożony.
 */
export function negotiate(server: unknown, client: ClientCapabilities): Negotiation {
    // 0
    if (server === null || server === undefined) return fail('SERVER_CAPABILITIES_UNKNOWN');
    // 1
    const profiles = isObj(server) ? field(server, 'transportProfiles') : undefined;
    if (!isStrArray(profiles) || !profiles.includes(client.flowassist.profile)) return fail('PROFILE_UNSUPPORTED');
    const caps = server as Record<string, unknown>;
    // 2
    const a2ui = field(caps, 'a2uiServerCapabilities');
    const v09 = isObj(a2ui) ? field(a2ui, 'v0.9') : undefined;
    if (!isObj(v09)) return fail('SERVER_CAPABILITIES_INVALID');
    const serverCatalogs = field(v09, 'supportedCatalogIds');
    const inline = field(v09, 'acceptsInlineCatalogs');
    if (serverCatalogs !== undefined && !isStrArray(serverCatalogs)) return fail('SERVER_CAPABILITIES_INVALID');
    if (inline !== undefined && typeof inline !== 'boolean') return fail('SERVER_CAPABILITIES_INVALID');
    // 3 (katalogów inline nie wysyłamy — I10 — więc acceptsInlineCatalogs nie wpływa na wynik)
    if (serverCatalogs === undefined) return fail('SERVER_CATALOGS_UNDECLARED');
    const catalogId = client.a2uiClientCapabilities['v0.9'].supportedCatalogIds.find((id) => serverCatalogs.includes(id));
    if (catalogId === undefined) return fail('NO_COMMON_CATALOG');
    // 4
    const ext = field(caps, 'flowassist');
    if (ext === undefined) return fail('FLOWASSIST_CAPABILITIES_MISSING');
    const serverKinds = isObj(ext) ? field(ext, 'kinds') : undefined;
    if (!isObj(serverKinds)) return fail('FLOWASSIST_CAPABILITIES_INVALID');
    for (const [kind, reps] of Object.entries(serverKinds)) {
        if (RESERVED_KEYS.has(kind) || !isStrArray(reps) || reps.some((r) => RESERVED_KEYS.has(r))) {
            return fail('FLOWASSIST_CAPABILITIES_INVALID');
        }
    }
    // 5 (kolejność klienta; rodzaje z pustym przecięciem odpadają)
    const kinds: { [K in ItemKind]?: SupportedRepresentation[] } = {};
    for (const [kind, reps] of Object.entries(client.flowassist.kinds) as [ItemKind, readonly SupportedRepresentation[]][]) {
        const offered = own(serverKinds, kind) ? (serverKinds[kind] as string[]) : [];
        const common = reps.filter((r) => offered.includes(r));
        if (common.length > 0) kinds[kind] = common;
    }
    if (Object.keys(kinds).length === 0) return fail('NO_COMMON_REPRESENTATION');
    return deepFreeze({ ok: true, profile: client.flowassist.profile, catalogId, kinds });
}
