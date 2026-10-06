# ADR 0006: Ustalenia harnessu przeglądarkowego (P0.1)

- **Status:** zaakceptowany 2026-10-05. **E2E-1:** zrealizowane — opcja (a). **E2E-2:** zrealizowane. **FLAKE-2: obserwowany** (podwójny tap pod obciążeniem). **FLAKE-1: OPEN** (bramka 9/10). **A11Y-1..3: naprawione w P0.5** (baseline axe = zero naruszeń).
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
- **Rekomendacja:** (a) w osobnym commicie „fix(aiui)”, ze zrzutem przed/po i z włączeniem `e2e/gestures.spec.ts`.
- **Realizacja (2026-10-05, decyzja właściciela: a):** `transformStyle: 'preserve-3d'` usunięte z kontenera stołu.
  - Zrzut Back (desktop 1440×900, canvas i wideo zamaskowane) przed/po: 0 różnych pikseli; baseline powtarzalny (2 przebiegi, 0 różnic).
  - `gestures.spec`: drag (raise + jeden commit), anulowanie przez zmianę od agenta i podwójny tap przechodzą. Test `pointercancel` ujawnił E2E-2.
  - Regresja desktop: smoke, anchor, compact, lifecycle, surfaces, a11y zielone. Dwa wcześniejsze przekroczenia czasu a11y (oczekiwanie na meshe ekranu 81 s) wynikały z pamięci maszyny zajętej w ponad 80%: przebieg kontrolny z `preserve-3d` i przebieg z poprawką po zwolnieniu pamięci przeszły.

## E2E-2 (zrealizowane): `pointercancel` w trakcie przeciągania zapisuje geometrię

- **Obserwacja:** po `pointercancel` (pointerId zgodny z gestem) pozycja karty jest zapisana już przed `pointerup` — sonda w przeglądarce: `x 0,8333 → 0,8671` w chwili anulowania.
- **Przyczyna:** `@use-gesture` 10.3.1 podpina `pointercancel` pod ten sam handler co `pointerup` (`DragEngine.pointerUp`), więc `onDrag` dostaje zwykły koniec gestu (`last`). `useCardGestures.onDrag` i `useResizeHandle` w `overlay/gestures.ts` przy `last` nie sprawdzają `event.type` i wysyłają `move` / `resize`.
- **Zasięg:** mysz praktycznie nie generuje `pointercancel`; dotyczy dotyku i pióra (przeglądarka przejmuje gest, utrata kontaktu) w układzie desktop, np. tablet w poziomie. Kontrakt gestów (I7: zapis tylko na końcu gestu, anulowanie bez zapisu) jest naruszony.
- **Właściciel:** warstwa gestów, `overlay/gestures.ts`. Nie kernel, nie protokół.
- **Realizacja (2026-10-05, decyzja właściciela):** `cancelledEnd` w `overlay/gestures.ts` — przy `last` z `pointercancel`/`touchcancel` gest przywraca `transform` i nie wysyła polecenia: drag karty (także ścieżka tap), pinch karty, uchwyt rozmiaru.
  - Testy e2e (najpierw czerwone, potem zielone): drag i zmiana rozmiaru z `pointercancel`; każdy sprawdza, że gest trwał (zmieniony `transform`), że stan się nie zmienił i że `transform` wrócił.
  - Pinch: ta sama przyczyna w bibliotece (`bind(...'cancel', pinchEnd)`), poprawiony tym samym warunkiem, ale **bez testu e2e** (pinch dotykowy nie jest wiarygodnie symulowany w desktopowym Chromium).

## FLAKE-2 (obserwowany): podwójny tap pod obciążeniem maszyny

- Jeden raz w pełnym przebiegu `gestures.spec` drugi klik zarejestrował się jako pojedynczy tap (focus zamiast screen). Okno podwójnego tapu to 350 ms (`DOUBLE_TAP_MS`), a test wykonuje dwa sekwencyjne `mouse.click` z rundami do przeglądarki. Ponowienie 3/3 i pełny `gestures.spec` 5/5 zielone.
- Prawdopodobnie artefakt testu pod obciążeniem, nie aplikacji. Bez zmian; jeśli wróci, rozważyć sprawdzenie odstępu między klikami w teście.
- **Nawrót (2026-10-06, P0.5):** pełny przebieg (9,6 min zamiast typowych 7) — „podwójny tap wysyła kartę na ekran” dał `focus`, zaraz po 120-sekundowym timeoucie poprzedniego testu (błąd selektora uchwytu po A11Y-1, poprawiony). Kontrolny `gestures.spec` desktop: 8/8. Zmieniony kod nie dotyka ścieżki tapu na desktopie. Warunek z punktu wyżej spełniony.
- **Strażnik ważności (decyzja właściciela 2026-10-06, zrealizowany):** `e2e/helpers.ts: recordPointerUps` + `requireDoubleTapWindow` mierzą odstęp `pointerup` w stronie. Odstęp ≥ `DOUBLE_TAP_MS` (350 ms, ten sam warunek co `overlay/gestures.ts`) kończy test błędem z etykietą **INCONCLUSIVE (środowisko, FLAKE-2)** i adnotacją — nigdy PASS. Próg bez poszerzania. Używają go oba testy podwójnego tapu w `gestures.spec.ts` (sprawdzenie przed asercją wyniku). Weryfikacja: tymczasowa sonda z odstępem 500 ms dała INCONCLUSIVE; `gestures.spec` desktop 8/8. W raportach taki wynik liczy się jako błąd środowiskowy, nie wynik testu.



## A11Y: baseline axe (WCAG 2.1 A/AA, zakres: overlay CameleON)

Baseline zapisany w `e2e/__snapshots__/a11y.spec.ts/axe-baseline-{desktop,compact}.json`. Nowe naruszenie albo zmiana liczby węzłów daje czerwony test.

> **P0.5: A11Y-1..3 naprawione; baseline = zero naruszeń** na wszystkich etapach (Back, Front z ekranem, HUD) w obu projektach. Poprawki:
> - **A11Y-1:** uchwyt „Zmień rozmiar” ma `aria-hidden="true"` zamiast `aria-label` bez roli. To kontrolka tylko dla wskaźnika (nigdy nie była fokusowalna).
>   **Sprostowanie (review P0.5, 2026-10-06):** pierwotne uzasadnienie „klawiatura zmienia rozmiar przyciskami −/+ karty z fokusem” było nieprawdziwe: na desktopie klawiatura nie wprowadza karty w `focus` (`keyCommand` nie ma takiego klawisza; robi to tylko tap wskaźnikiem), a przyciski rysowały się tylko przy `focused || compact` — luka WCAG 2.1.1 istniejąca przed P0.5. Naprawione w overlayu (kernel bez zmian): `WorkspaceCard` pokazuje kontrolki („Na ekran”, „−/+”, „Ukryj”, „⋯”), gdy fokus **klawiatury** jest w karcie (`:focus-visible`); fokus myszą nie zmienia wyglądu. Testy: `__tests__/focus.test.tsx` („kontrolki karty przy fokusie w karcie”), e2e `surfaces.spec.ts` („fokus klawiatury na karcie pokazuje kontrolki”). Klawisz wprowadzający kartę w `focus` byłby zmianą kernela (`gestureLogic.ts`) — poza zakresem.
> - **A11Y-2:** `Chart.tsx` nadaje `role="img"` nazwę zawsze: tytuł albo „Wykres liniowy/słupkowy: <etykiety serii>” (`__tests__/a11yViews.test.tsx`).
> - **A11Y-3:** przewijana treść panelu ekranu (`ScreenLayer.tsx`) i karty w pasku compact (`WorkspaceLayer.tsx`) ma `tabIndex=0`, `role="group"` i nazwę „Treść: <tytuł>”. Poza zakresem znaleziska, nie wykryte przez skan: treść karty z fokusem na desktopie (`max-h-[340px] overflow-auto`) i szuflada tasków — **domknięte w P0.5 krok 3** (ta sama semantyka; szuflada: `inert` po zamknięciu na compact). Skan axe nie ma etapu z kartą w `focus` i przepełnioną treścią, więc „zero naruszeń” dotyczy sprawdzanych etapów; pokrycie tych miejsc dają testy jsdom (`focus.test.tsx`).
>   **Świadomy kompromis:** klik myszą w przewijaną treść (compact, karta z fokusem) przenosi fokus na treść, więc skróty karty (Enter, Delete, strzałki) działają dopiero po powrocie na kartę — Escape z wnętrza karty wraca na kartę (P0.5 krok 3). Alternatywa (`tabIndex` tylko przy faktycznym przepełnieniu) — do rozważenia, jeśli okaże się uciążliwe.
>
> Opis poniżej dotyczy baseline'u sprzed P0.5.

Do naprawy w **P0.5** (stan sprzed poprawek):

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
- **Nowy trop (2026-10-05):** przy pamięci maszyny zajętej w ponad 80% rejestracja meshy ekranu trwała 81 s (ślad a11y, ten sam objaw), a po zwolnieniu pamięci test przeszedł. Brak pamięci jest więc kandydatem na przyczynę, obok hipotezy wideo.
- **Następny krok:** przy kolejnym wystąpieniu zachować `test-results/` (trace, konsola, żądania sieciowe) przed ponownym uruchomieniem; nie ruszać `freeflow.mp4` ani modelu studia do czasu diagnozy.

## Udokumentowane (bez decyzji)

- **ScreenAnchor (desktop 1440×900):** histereza działa w prawdziwej kamerze.
  - Przy 0,25 rad (≈14,3°, pokrycie ≈0,79) kotwica jest aktywna, gdy jedziemy od Frontu, a nieaktywna przy powrocie.
  - `inert` panelu zawsze odpowiada `!active`.
  - Etykieta `reason: angle` przy 17,2° jest poprawna: wyłączyło ją pokrycie, a przy ponownym włączaniu obowiązuje próg kąta 16°.
- **Wideo:** w headless Chromium `freeflow.mp4` daje żądania `ERR_ABORTED` przy pobieraniu zakresami. Mimo to scena się ładuje i meshe ekranu są rejestrowane; to nie jest błąd.
- **Czas:** skan axe przy `resultTypes: ['violations']` trwa 3–7 s; przy pełnych wynikach trwał minuty.
