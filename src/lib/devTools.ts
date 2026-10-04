// Panel Leva i debug kamery: tylko w dev (albo z ?dev). ?demo wyłącza je także w dev.
export function devToolsEnabled(): boolean {
    if (typeof window === 'undefined') return false;
    const params = new URLSearchParams(window.location.search);
    if (params.has('dev')) return true;
    if (params.has('demo')) return false;
    return process.env.NODE_ENV !== 'production';
}
