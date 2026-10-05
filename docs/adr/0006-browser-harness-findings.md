# ADR 0006: Ustalenia harnessu przeglądarkowego (P0.1)

- **Status:** zaakceptowany 2026-10-05. **E2E-1:** decyzja właściciela — opcja (a), realizacja w osobnym commicie. **FLAKE-1: OPEN** (bramka 9/10). A11Y-1..3 przechodzą do P0.5.
- **Kontekst:** P0.1 wprowadził Playwright + axe-core (devDependencies, tylko Chromium) z testami w `e2e/`.
  - Stan aplikacji ustawiamy przez dev-hook `window.__aiui`, bez osi czasu mocka.
  - WebGL w headless jest programowy (SwiftShader), więc testy nie mierzą FPS ani renderów.
  - Ustalenia potwierdzono sondami w przeglądarce; poniżej każde ma dowód i właściciela.

## E2E-1: `pointerdown` w karcie stołu trafia w kontener 3D, nie w kartę

- **Obserwacja (Chromium 153, desktop 1440×900):**
  - `pointerdown` w środku karty ma za cel bezimienny `DIV`, czyli kontener stołu z `transform: rotateX(6deg)` i `transform-style: preserve-3d` (`overlay/WorkspaceLayer.tsx`). Kolejne `pointermove`/`pointerup` w tym samym punkcie trafiają już w kartę.
  - `elementFromPoint` daje w tych samych punktach wyniki naprzemienne: na 10/25/75% wysokości karty kontener, na 50/90% karta.
  - Skutek: `@use-gesture` nie startuje gestu, więc nie działa ani drag, ani tap/focus, ani podwójny tap. Zero zapisów `layout`, nawet `raise`.
  - Klik, który trafi w kontener, uruchamia `blurOnBackground` (zdjęcie focusu) zamiast focusu karty.
- **Diagnoza:** karty są współpłaszczyznowe z kontenerem (brak `translateZ`) w jednym kontekście 3D (`preserve-3d`). Sortowanie głębokości przy hit-testingu jest wtedy niejednoznaczne.
  - Po ustawieniu w DOM strony testowej `transform-style: flat` wszystkie punkty karty trafiają w kartę, a klik daje `focus`. Kod nie był zmieniany.
- **Zasięg:** potwierdzone w headless Chromium 153. Hit-testing liczy CPU (Blink), nie GPU, więc prawdopodobnie dotyczy też zwykłego Chrome 153. **Nie potwierdzone** na przeglądarce właściciela. Wcześniejsze kontrole `agent-browser` (systemowy Chrome) przeciągały karty poprawnie.
- **Właściciel:** warstwa UI, `overlay/WorkspaceLayer.tsx` (style kontenera). Nie kernel, nie protokół.
- **Opcje:**
  - (a) usunąć `transformStyle: 'preserve-3d'` z kontenera. Karty nie mają `translateZ`, więc obraz powinien być identyczny (do potwierdzenia zrzutem przed/po);
  - (b) zostawić `preserve-3d`, a karty odsunąć od płaszczyzny kontenera (`translateZ(1px)`);
  - (c) zostawić.
- **Rekomendacja:** (a) w osobnym commicie „fix(aiui)”, ze zrzutem przed/po i z włączeniem `e2e/gestures.spec.ts`. Testy gestów są gotowe i dziś oznaczone `fixme` z odwołaniem do E2E-1.

## A11Y: baseline axe (WCAG 2.1 A/AA, zakres: overlay CameleON)

Baseline zapisany w `e2e/__snapshots__/a11y.spec.ts/axe-baseline-{desktop,compact}.json`. Nowe naruszenie albo zmiana liczby węzłów daje czerwony test. Do naprawy w **P0.5**:

| # | Reguła | Gdzie | Źródło |
|---|---|---|---|
| A11Y-1 | `aria-prohibited-attr` (serious), 3 węzły na Back | uchwyt „Zmień rozmiar” na każdej karcie | `WorkspaceLayer.tsx`: `div` z `aria-label` bez roli |
| A11Y-2 | `svg-img-alt` (serious) | wykres `chart2d` bez `title` w treści | `components/Chart.tsx`: `<svg role="img" aria-label={title}>`; `title` jest opcjonalny w katalogu, więc etykieta bywa pusta |
| A11Y-3 | `scrollable-region-focusable` (serious) | przewijana treść panelu ekranu (Front, HUD); na compact także treść karty w pasku (Back) | `ScreenLayer.tsx` i `WorkspaceLayer.tsx` (compact): `div.overflow-auto` bez możliwości fokusu |

## Stabilność harnessu: flaki znalezione i usunięte (bramka 10 przebiegów)

Pierwsza próba bramki ujawniła dwa niedeterministyczne miejsca w **teście** axe (nie w aplikacji):

1. **compact, etap Front:** skan startował przed rejestracją meshy ekranu i aktywacją kotwicy, więc panel był raz ukryty (axe go pomija), a raz aktywny. Poprawka: oczekiwanie na meshe i `active === true` przed skanem.
2. **etap HUD:**
   - rozwinięcie decyzji remountuje panel (`AnimatePresence`), a w trakcie animacji wyjścia istnieją dwa landmarki „Decyzja” (`landmark-unique`). Poprawka: oczekiwanie na jeden landmark i koniec animacji;
   - na compact `click()` Playwrighta przewijał przycisk do widoku, przewinięcie strony uruchamiało kadr „close” kamery i wyłączało kotwicę. Poprawka: `dispatchEvent('click')` i asercja `scrollY === 0` przed skanem.

Awaria pierwszej próby (`Target crashed`, kod `0xC0000142`) była środowiskowa: brak pamięci zadeklarowanej na maszynie. Nie był to błąd testów.

## FLAKE-1 (OPEN): scena nie rejestruje meshy ekranu w 90 s

- **Obserwacja:** bramka 10 pełnych przebiegów po restarcie Windows dała **9/10 zielonych**. W przebiegu 2 meshe ekranu nie zarejestrowały się w 90 s, więc model studia się nie zamontował i testy zależne od kotwicy padły na oczekiwaniu.
- **Hipoteza (niepotwierdzona):** zawieszone żądanie zakresowe `freeflow.mp4` (patrz „Wideo” niżej) blokuje granicę `Suspense` sceny. Artefakty przebiegu przepadły (`test-results/` czyszczony przy następnym uruchomieniu), więc brak trace.
- **Decyzja właściciela (2026-10-05):** P0.1 commitowany z FLAKE-1 jako znanym problemem. Bez ponowień w konfiguracji (flaki mają być widoczne).
- **Następny krok:** przy kolejnym wystąpieniu zachować `test-results/` (trace, konsola, żądania sieciowe) przed ponownym uruchomieniem; nie ruszać `freeflow.mp4` ani modelu studia do czasu diagnozy.

## Udokumentowane (bez decyzji)

- **ScreenAnchor (desktop 1440×900):** histereza działa w prawdziwej kamerze.
  - Przy 0,25 rad (≈14,3°, pokrycie ≈0,79) kotwica jest aktywna, gdy jedziemy od Frontu, a nieaktywna przy powrocie.
  - `inert` panelu zawsze odpowiada `!active`.
  - Etykieta `reason: angle` przy 17,2° jest poprawna: wyłączyło ją pokrycie, a przy ponownym włączaniu obowiązuje próg kąta 16°.
- **Wideo:** w headless Chromium `freeflow.mp4` daje żądania `ERR_ABORTED` przy pobieraniu zakresami. Mimo to scena się ładuje i meshe ekranu są rejestrowane; to nie jest błąd.
- **Czas:** skan axe przy `resultTypes: ['violations']` trwa 3–7 s; przy pełnych wynikach trwał minuty.
