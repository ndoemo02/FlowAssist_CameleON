// Stałe gestów wspólne dla overlayu i testów e2e — moduł bez importów, więc Playwright może go załadować
// bez store'u, TTS i @use-gesture. Jedno źródło progu: strażnik FLAKE-2 (e2e/helpers.ts) nie może się rozjechać z aplikacją.

/** Okno podwójnego tapu: podwójny tap ⇔ odstęp między tapami < DOUBLE_TAP_MS (`overlay/gestures.ts`). */
export const DOUBLE_TAP_MS = 350;
