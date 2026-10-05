// Propsy widoku z danych agenta → JSX. React traktuje część kluczy specjalnie (`key`, `ref`, a w dev
// `__self`/`__source`): np. string `ref` rzuca przy komponencie funkcyjnym i wywraca cały render.
// Walidatory katalogu nie odrzucają nieznanych kluczy, więc odcinamy je na granicy JSX.

const RESERVED = new Set(['key', 'ref', '__self', '__source']);

export function viewProps(props: Record<string, unknown>): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(props)) if (!RESERVED.has(k)) out[k] = v;
    return out;
}
