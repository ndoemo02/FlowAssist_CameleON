// Profil transportowy flowassist-transport/1 (ADR 0002, oś 3): reguły STAŁE dla wersji profilu.
// Nie są wysyłane w capabilities (nie podlegają negocjacji); opisuje je dokument profilu (P1.7b).
// Zmiana dowolnej reguły = świadoma zmiana literału w teście strażnika dryfu albo nowa wersja profilu.

import { A2UI_VERSION, ACCEPTED_VERSIONS, PRESENTATIONS, PROTOCOL_LIMITS, RESERVED_KEYS } from '../contract';

export const TRANSPORT_PROFILE = 'flowassist-transport/1' as const;

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
    limits: PROTOCOL_LIMITS,
    reservedKeys: Array.from(RESERVED_KEYS),
} as const);
