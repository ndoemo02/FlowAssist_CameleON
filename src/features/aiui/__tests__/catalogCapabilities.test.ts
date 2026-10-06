// P1.7a: część katalogowa capabilities i deklaratywna lista propsów katalogu.
// catalogCapabilities() = KIND_REPRESENTATIONS ∩ SUPPORTED_REPRESENTATIONS (ADR 0002, oś 2: zmiana obsługi = capabilities).
// CATALOG_PROPS ↔ components.schema.json: parytet nazw propsów (reguła Q1 profilu potrzebuje jednego źródła).

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { ACCEPTED_VERSIONS, CATALOG_ID, CATALOG_NAMES, ITEM_KINDS, parseEvent } from '../contract';
import { CATALOG_PROPS, KIND_REPRESENTATIONS, SUPPORTED_REPRESENTATIONS, catalogCapabilities, isSupportedRepresentation } from '../catalog';

describe('catalogCapabilities()', () => {
    it('zawiera dokładnie obsługiwane reprezentacje dozwolone dla rodzaju, w kolejności KIND_REPRESENTATIONS', () => {
        const { catalogId, kinds } = catalogCapabilities();
        expect(catalogId).toBe(CATALOG_ID);
        for (const kind of ITEM_KINDS) {
            const expected = KIND_REPRESENTATIONS[kind].filter(isSupportedRepresentation);
            if (expected.length === 0) expect(kind in kinds, kind).toBe(false); // rodzaj bez obsługi pominięty
            else expect(kinds[kind], kind).toEqual(expected);
        }
        expect(Object.keys(kinds).every((k) => (ITEM_KINDS as readonly string[]).includes(k))).toBe(true);
    });

    it('każda obsługiwana reprezentacja występuje w co najmniej jednym rodzaju; żadna nieobsługiwana', () => {
        const all = Object.values(catalogCapabilities().kinds).flat();
        expect(new Set(all)).toEqual(new Set(Object.keys(SUPPORTED_REPRESENTATIONS)));
        expect(all.every(isSupportedRepresentation)).toBe(true);
    });

    it('zwraca nowy obiekt przy każdym wywołaniu (bez współdzielonego stanu)', () => {
        const a = catalogCapabilities();
        const b = catalogCapabilities();
        expect(a).toEqual(b);
        expect(a.kinds).not.toBe(b.kinds);
    });
});

describe('CATALOG_PROPS ↔ components.schema.json', () => {
    const schema = JSON.parse(readFileSync(
        fileURLToPath(new URL('../schemas/flowassist-v2/components.schema.json', import.meta.url)), 'utf-8',
    )) as { $defs: Record<string, { properties?: Record<string, unknown> }> };

    it('obejmuje dokładnie komponenty katalogu', () => {
        expect(Object.keys(CATALOG_PROPS).sort()).toEqual([...CATALOG_NAMES].sort());
    });

    it.each(CATALOG_NAMES)('%s: te same nazwy propsów co w schemacie', (name) => {
        const fromSchema = Object.keys(schema.$defs[name]?.properties ?? {}).sort();
        expect([...CATALOG_PROPS[name]].sort()).toEqual(fromSchema);
    });
});

describe('ACCEPTED_VERSIONS (eksport dla reguł profilu)', () => {
    const surface = (version: string) => ({ version, createSurface: { surfaceId: 'hud', catalogId: CATALOG_ID } });

    it('parseEvent przyjmuje każdą wersję z listy i odrzuca inne', () => {
        for (const v of ACCEPTED_VERSIONS) expect(parseEvent(surface(v)), v).not.toBeNull();
        for (const v of ['v0.8', 'v0.10', 'v1.0', '']) expect(parseEvent(surface(v)), v).toBeNull();
    });
});
