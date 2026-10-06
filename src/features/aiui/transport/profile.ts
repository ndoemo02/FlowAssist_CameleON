// Profil transportowy flowassist-transport/1 (ADR 0002, oś 3): reguły STAŁE dla wersji profilu.
// Nie są wysyłane w capabilities (nie podlegają negocjacji); opisuje je dokument profilu (P1.7b).
// Zmiana dowolnej reguły = świadoma zmiana literału w teście strażnika dryfu albo nowa wersja profilu.

import { A2UI_VERSION, ACCEPTED_VERSIONS, PRESENTATIONS, PROTOCOL_LIMITS, RESERVED_KEYS } from '../contract';

export const TRANSPORT_PROFILE = 'flowassist-transport/1' as const;

export const PROFILE_RULES = {
    profile: TRANSPORT_PROFILE,
    envelope: { send: A2UI_VERSION, accept: ACCEPTED_VERSIONS },
    presentations: PRESENTATIONS,
    limits: PROTOCOL_LIMITS,
    reservedKeys: Array.from(RESERVED_KEYS),
} as const;
