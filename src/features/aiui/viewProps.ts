// Propsy widoku z danych agenta → JSX. React traktuje część kluczy specjalnie (`key`, `ref`, a w dev
// `__self`/`__source`): np. string `ref` rzuca przy komponencie funkcyjnym i wywraca cały render.
// Walidatory katalogu nie odrzucają nieznanych kluczy, więc odcinamy je na granicy JSX.

const RESERVED = new Set(['key', 'ref', '__self', '__source']);

export function viewProps(props: Record<string, unknown>): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(props)) if (!RESERVED.has(k)) out[k] = v;
    return out;
}

/**
 * Płaski podpis propsów `[klucz, wartość, …]` porównywany płytko (Object.is) — tożsamość danych węzła bez
 * schodzenia w głąb (JSON.stringify głęboko zagnieżdżonych danych agenta przepełnia stos). Dzięki structural
 * sharing niezwiązana zmiana surface'u daje ten sam podpis.
 */
export function propsSignature(props: Record<string, unknown>): unknown[] {
    return Object.entries(props).flat();
}

export const sameSignature = (a: readonly unknown[], b: readonly unknown[]) =>
    a.length === b.length && a.every((v, i) => Object.is(v, b[i]));
