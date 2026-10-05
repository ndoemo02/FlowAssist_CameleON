# Verification brief: poprawki po review CameleON v1.3 P0

Dla Astry (tylko odczyt). Cel: **zweryfikować poprawki** ustaleń z review `61209b8`, **bez ponownego pełnego audytu**.
Zakres: `61209b8..1f12885` (kod) + commity dokumentacji po nim. Pełny kontekst: [`REVIEW_BRIEF.md`](REVIEW_BRIEF.md).

Każde ustalenie to osobny commit z testem, który przed poprawką padał na scenariuszu błędu (RED obserwowany).
Złote ślady replay: **bez zmian** (13/13 zgodnych na każdym commicie).

## Do sprawdzenia

| # | Commit | Co zmieniono | Test błędu | Pytanie do weryfikacji |
|---|---|---|---|---|
| R#1 HIGH (I10) | `9367eb5` | `viewProps()` odcina `key`/`ref`/`__self`/`__source` przed spreadem propsów agenta; `RenderGuard` per karta i węzeł drzewa (fallback + raport, reset po zmianie danych); licznik tasków z `resolveTree`; `chartAxis()` | `hostileRender.test.tsx`, `chartAxis.test.ts` | Czy istnieje inna ścieżka danych agenta do JSX lub do renderu bez boundary? |
| R#2 MEDIUM (I7) | `5d46bc6` | `canceled` → wczesny powrót w drag / pinch / resize; `onClickCapture` biblioteki pomijany dla `[data-nodrag]` | `gestures.test.ts` (sekwencja biblioteki), e2e: drag z treści karty w focusie, klik z ruchem 4 px | Czy pominięcie click-capture dla `[data-nodrag]` nie przepuszcza kliku po prawdziwym dragu karty? |
| R#4 MEDIUM | `0aad0f3` | JSON Pointer: kanoniczny indeks tablicy; `-`, ujemne, niekanoniczne → ten sam dokument; odczyt tylko własnych właściwości; `__proto__` jako własna właściwość. Decyzja w ADR 0002 | `dataModelContract.test.ts` | Czy kontrakt w ADR 0002 jest kompletny (otwarte: indeks ≥ długości)? |
| R#5 MEDIUM (I6/I10) | `2f0dfcc` | `validationReporting.ts`: problemy liczone ze stanu, raz na wystąpienie, reset po odzyskaniu; błędy renderu po tożsamości danych; `reportClientError(error, { runId })` tylko w bieżącym, aktywnym przebiegu. Instaluje `AiUiOverlay` | `validationReporting.test.tsx` | Czy klucz wystąpienia (surface, węzeł, ścieżka, komunikat) nie scala różnych problemów ani nie dubluje jednego? |
| R#7 LOW | `544fb31` | sonda `?anchor=probe` tylko gdy `NODE_ENV !== 'production'` | `screenAnchorProbe.test.tsx`; bundel `next build` bez kodu sondy | — |
| R#3 kernel (P9) | `39af130` | siatka przeliczana przy zmianie zbioru id (nie tylko liczby); przesunięte karty zostają; `rev` tylko przesuniętym przez siatkę. Zgoda właściciela, ADR 0001 | `layout.test.ts` (podmiana `[a,b,c] → [a,c,d]`) | Czy regrid przy zmianie zbioru id nie unieważnia gestów bez potrzeby? |
| NEW-1 | `1f12885` | tap na przycisku karty (button, link, pole, `role=button`) nie liczy się do podwójnego tapu | `gestures.test.ts`, e2e: dwa szybkie „+” (odstęp mierzony w stronie) | Czy tap na treści karty w focusie nadal daje „na ekran” (test strażniczy)? |

## Decyzje do oceny (poza literą zlecenia)

- Nowa zależność dev `jsdom@^25`; `vitest.config.ts`: `*.test.tsx` i `esbuild.jsx: 'automatic'` (render DOM w jsdom, per plik).
- R#4: odrzucenie jest **ciche** (raport wymagałby zmiany reducera — kernel).
- R#5: problemy HUD i szuflady są zgłaszane bez otwierania paneli; raporty w `idle` i po `done`/`error` nie są wysyłane. Format na drucie bez zmian.
- R#2 obejmuje też naprawę połykania kliknięcia (Twoja uwaga z review), nie tylko zapisy po `canceled`.

## Świadomie poza zakresem

- **FU-1** (reszta R#5): fallback „komponent niedostępny w tym slocie” i root `workspace` niebędący `Workspace` — bez raportu. Przed P1.6.
- **FU-2** (R#6): `dispatch(raw)` bez `runId` — przy P1.6.
- Pinch bez testu e2e (E2E-2), FLAKE-1/2, A11Y (P0.5), reduced motion (P0.6).

## Weryfikacja (stan na `1f12885`)

- `npm test`: 214/214. `npx tsc --noEmit`: tylko znany błąd `safelayer/Lanyard.tsx`. `npx next build`: PASS.
- `npm run test:e2e`: 19 passed / 11 skipped / 0 failed na `39af130` (pełny zestaw); `gestures.spec` desktop 8/8 na `1f12885`.

## Runda 2: poprawki po weryfikacji Astry (2026-10-05)

Weryfikacja rundy 1: R#2, R#3, R#4, R#7, NEW-1 — CONFIRMED; R#1 i R#5 — ISSUE. Zakres rundy 2: `1f12885..9d3e901` (kod)
+ `0f71c72` (FU-3) i commit dokumentacji po nim.

| # | Commit | Co zmieniono | Test błędu | Pytanie do weryfikacji |
|---|---|---|---|---|
| V-R#1 HIGH | `e20be49` | Regresja z `2f0dfcc`: zamiast `JSON.stringify(node.props)` przed boundary — płytki podpis propsów (`propsSignature`, Object.is); `RenderGuard.resetKeys`; przygotowanie widoku (`viewProps` + widok) w `TreeNodeView` pod boundary | `hostileRender`: `Approval` z polem o głębokości 12 000 | Czy pozostała jakakolwiek głęboka trawersacja danych agenta przed boundary? |
| V-R#5 MEDIUM | `9d3e901` | Odzyskanie (decyzja właściciela) = walidacja wraca do `ready` albo udany render po ponowieniu (`RenderGuard.onRecover`). Zmiana danych węzła, który dalej jest zły, to to samo wystąpienie. Zniknięcie węzła / nowy przebieg kończą wystąpienie | `validationReporting.test.tsx`: zmiana danych nadal złe → 1; złe → dobre → te same złe → 2 (HUD i karta); walidacja fallback → pending → fallback → 1 | Czy zakończenie wystąpienia przy zniknięciu węzła jest akceptowalne (poza literą reguły)? |

Weryfikacja rundy 2: vitest 219/219; tsc tylko Lanyard; E2E celowane `surfaces` + `gestures` (oba projekty) na `0f71c72`:
13 passed / 9 skipped / 0 failed. Pełne E2E i `next build` nie były powtarzane po rundzie 2.

## Runda 3: poprawki po weryfikacji rundy 2 (2026-10-05)

Weryfikacja rundy 2: `propsSignature` — OK; FU-3 — OK jako follow-up (dodane kryterium akceptacji, `a7b3a67`);
R#5 — 2 ISSUE. Zakres rundy 3: `1c741b1..e820e0d` (kod) + `a7b3a67` i commit dokumentacji po nim.

| # | Commit | Co zmieniono | Test błędu | Pytanie do weryfikacji |
|---|---|---|---|---|
| V2-R#5a MEDIUM | `df55d09` | `RenderGuard` zgłasza też zatwierdzony udany pierwszy render nowej instancji (`componentDidMount` bez błędu); `resolveRenderProblem` niesie `runId` z chwili renderu i ignoruje inny przebieg. Samo odmontowanie i zmiana danych bez udanego renderu nie kończą wystąpienia | złe → zwinięcie HUD → poprawne dane → rozwinięcie z udanym renderem → złe → 2; strażnik: odmontowanie + dane nadal złe → remount → 1 | Czy udany render jednej instancji (np. ekran) przy błędzie drugiej (karta, inna gęstość) może zamknąć wystąpienie za wcześnie w praktyce? |
| V2-R#5b MEDIUM | `e820e0d` | Obecność węzła w drzewach slotów = członkostwo w grafie definicji (`root` → `children`, iteracyjnie, odporne na cykle); nierozwiązany członek (np. pod rodzicem w pending) = `unavailable`: ani odzyskany, ani usunięty | dziecko w fallbacku → rodzic pending → rodzic gotowy, dziecko nadal złe → 1; strażnik: usunięcie z `children` i ponowne dodanie → 2 | Czy członkostwo z grafu definicji pokrywa wszystkie przypadki „chwilowej niedostępności” (np. węzeł poza `MAX_DEPTH`)? |

Weryfikacja rundy 3: vitest 223/223; pełny tsc: 1 znany błąd (Lanyard). E2E celowane `surfaces` + `gestures` (oba projekty)
na `a7b3a67`: 11 passed / 9 skipped / 2 failed — obie porażki środowiskowe (pamięć ~2,7 GB wolnego): „+ +” zatrzymany przez
własny strażnik ważności testu (odstęp tapów 646 ms > 350 ms, test niekonkluzywny) i `waitScreenMeshes` 90 s (FLAKE-1);
jednorazowe ponowienie tych dwóch testów (desktop): 2/2 passed.

## Runda 4: poprawka po weryfikacji rundy 3 (2026-10-05)

Weryfikacja rundy 3: członkostwo z grafu definicji — OK (także węzeł poza `MAX_DEPTH`, graf z cyklem); FU-3 — OK;
odzyskanie po remoncie — 1 ISSUE (udany render innej instancji zamykał trwający błąd). Zakres rundy 4: `2d73cb4..84096ff`
(kod) + commit dokumentacji po nim.

| # | Commit | Co zmieniono | Test błędu | Pytanie do weryfikacji |
|---|---|---|---|---|
| V3-R#5 MEDIUM | `84096ff` | Decyzja właściciela: odzyskanie i deduplikacja per wariant renderowania (`card` / `screen` dla elementu stołu, `slot` dla węzła drzewa) przy wspólnym wystąpieniu problemu. Pierwszy zawodzący wariant raportuje, kolejne dołączają; udany render wariantu usuwa tylko ten wariant; wystąpienie kończy się, gdy nie zawodzi żaden wariant (albo węzeł / przebieg się kończy). Akceptowane: niewyrenderowany ponownie uszkodzony wariant zostaje otwarty, dopóki sam nie przejdzie poprawnego renderu | karta zawodzi, ekran zdrowy, ponowienie karty nadal zawodzi → 1; ekran zawodzi → karta zdrowa → ekran znowu zawodzi → 1; strażnik: oba warianty zawodzą → poprawne dane → złe → 2 | Czy wariant = gęstość (stabilny przez remount) jest właściwą granulacją — czy istnieje drugi widok tego samego wariantu, który mógłby się wzajemnie „odzyskiwać”? |

Weryfikacja rundy 4: vitest 226/226; pełny tsc: 1 znany błąd (Lanyard); E2E celowane `surfaces` + `gestures`
(oba projekty) na `84096ff`: 13 passed / 9 skipped / 0 failed.

## Runda 5: poprawka po weryfikacji rundy 4 (2026-10-06)

Weryfikacja rundy 4: wspólne wystąpienie per wariant — OK; 1 ISSUE na poziomie komponentu (zmiana gęstości w zamontowanym
`ItemBody`). Zakres rundy 5: `c8138db..88e7af4` (kod) + commit dokumentacji po nim.

| # | Commit | Co zmieniono | Test błędu | Pytanie do weryfikacji |
|---|---|---|---|---|
| V4-R#5 MEDIUM | `88e7af4` | `ItemBody`: `resetKeys={[view.content, density]}` — zmiana wariantu ponawia render. `RenderGuard`: zatwierdzony udany render po zmianie `resetKeys` (nowe dane albo nowy wariant) zgłasza odzyskanie wyłącznie BIEŻĄCEGO wariantu; inne warianty, wspólne wystąpienie i deduplikacja bez zmian | jedna instancja: card zawodzi → screen → poprawne dane → card z udanym renderem → złe → 2 raporty; strażnik: card zawodzi → zdrowy screen → card nigdy poprawnie → wystąpienie card otwarte (1 raport) | Czy jakakolwiek ścieżka traktuje samą zmianę wariantu jako odzyskanie poprzedniego wariantu? |

Założenie granulacji (decyzja właściciela): dla jednego elementu najwyżej jedna aktywna instancja danego wariantu
(card, screen, slot); dwie instancje tej samej gęstości wymagałyby identyfikatora miejsca montowania w kluczu wariantu.
Definicja główna: nagłówek `src/features/aiui/validationReporting.ts`; ADR 0003 tylko odsyła.

Weryfikacja rundy 5: vitest 228/228; pełny tsc: 1 znany błąd (Lanyard); E2E celowane `surfaces` + `gestures`
(oba projekty) na `88e7af4`: 13 passed / 9 skipped / 0 failed.

**Wynik rundy 5 (Astra, 2026-10-06): GO** — poprawka zamyka ustalenie z rundy 4. Niezależne sondy DOM Astry:
- sekwencja z rundy 4 (jedna instancja, zmiana gęstości): 2 raporty, oba udane rendery rzeczywiście występują;
- strażnik właściciela: 1 raport, błąd `card` pozostaje otwarty;
- oba warianty zawodzą: odzyskanie samego `screen` zachowuje wspólne wystąpienie; nawrót jest zgłaszany dopiero po odzyskaniu obu.

## Zamknięcie

**P0 review hardening complete. Astra final verification: GO** (kod `88e7af4`; remote HEAD w chwili werdyktu `d53a2d4`).
Pętla review zamknięta — kolejne rundy tych samych ustaleń nie są planowane.
Pozostaje przed live transportem: FU-1, FU-2, FU-3 (AGENTS.md) oraz P0.5 dostępność i reduced motion.

## Prompt startowy

> Verify the review fixes on `feat/aiui-prototype` as a read-only reviewer. Start with `docs/review/VERIFICATION_BRIEF.md`.
> Scope: the commits listed there (`61209b8..1f12885` + docs; round 2: `1f12885..9d3e901`). Do not re-audit the whole branch.
> For each finding: confirm the test reproduces the original scenario, the fix addresses the root cause without
> side effects on I1–I10, and answer the question in its row. Report only: CONFIRMED / ISSUE (with file, scenario, fix
> direction) per finding, then anything newly broken by these commits. End with GO / GO WITH FIXES / NO-GO.
