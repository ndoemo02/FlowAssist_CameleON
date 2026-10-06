# ADR 0007: Taksonomia stanów elementu (P0.4)

- **Status:** taksonomia zaakceptowana w zakresie planu v1.3.2 (P0.4). Review Astry (2026-10-06): trzy doprecyzowania uwzględnione, ponowne sprawdzenie OK. Decyzje właściciela 2026-10-06: **ST-1 — (b), zrealizowane** (zmiana kernela w `resolveItem`); **ST-2, ST-3 — zostają**. **ST-4 — (a), decyzja właściciela 2026-10-06.** Q1–Q3 rozstrzygnięte 2026-10-06 (niżej).
- **Kontekst:** plan v1.3.2 (P0.4) wymaga dokumentu i testów **obecnych** stanów `WorkspaceItemView` bez zmiany kodu. Audyt chciał statusów `unsupported` i `failed`. Nowy status byłby zmianą `workspace.ts`, czyli pliku kernela (ADR 0001).
  - Taksonomię zapisano na kodzie z `33d3b06` (P0.4 bez zmian kodu). Tabela poniżej opisuje stan **po** ST-1(b); stan sprzed poprawki opisuje sekcja ST-1.
  - Testy: `src/features/aiui/__tests__/itemStates.test.ts` (dalej `itemStates`) oraz testy wskazane w tabelach.
- **Decyzja:**
  - element stołu ma trzy statusy walidacji: `pending`, `fallback`, `ready` (`workspace.ts: WorkspaceItemView`);
  - `unsupported` i `failed` z audytu to `fallback` z inną przyczyną;
  - kategorię fallbacku wyznacza `path` (JSON Pointer od `/components/{id}`). `reason` to tekst dla człowieka, bez kontraktu, i testy go nie sprawdzają. Wyjątki, w których `path` nie wystarcza, opisuje sekcja „Kategoria z `path`”.

## Cztery rozdzielne osie stanu

Status walidacji to tylko jedna z czterech osi. Pozostałe nie są częścią `WorkspaceItemView`.

| Oś | Wartości | Gdzie powstaje | Test |
|---|---|---|---|
| Członkostwo (P6) | id w `Workspace.children` albo nie | `workspace.ts: workspaceChildren` | `workspace.test.ts` („członkostwo = Workspace.children”) |
| Walidacja | `pending` / `fallback` / `ready` | `workspace.ts: resolveItem` | `itemStates`, `workspace.test.ts` |
| Render | udany albo błąd renderu, osobno w każdym wariancie (`card`, `screen`) | `overlay/ItemContent.tsx: ItemBody` (`RenderGuard`) | `validationReporting.test.tsx`, `hostileRender.test.tsx` |
| Prezentacja (lokalna) | `card` / `focus` / `screen` / `dismissed`, geometria | `layout.ts` (ADR 0003) | `layout.test.ts` |

Stan surface'u stołu (przed elementami, `validationReporting.ts: scanSurfaces`):
- brak roota: brak elementów, bez błędu (`validationReporting.test.tsx`: „brak roota to pending, nie błąd struktury”);
- root inny niż `Workspace`: `workspaceChildren` zwraca `null`, więc stół nie pokazuje elementów. Problem struktury jest raportowany ze ścieżką `/components/root/component` (FU-1; `validationReporting.test.tsx`: „root surface'u workspace niebędący Workspace”).

## Statusy walidacji elementu stołu

Wiersze w kolejności sprawdzania w `resolveItem`. Pierwszy spełniony warunek wyznacza status.

| # | Status | Kategoria | Warunek | `path` | Widok | Raport `VALIDATION_FAILED` | Test |
|---|---|---|---|---|---|---|---|
| 1 | `pending` | komponent niedostarczony | brak definicji `id` | — | nagłówek „Ładowanie…”, treść `PendingCard`; w układzie `delivered: false` | nie | `itemStates`: „pending: komponent niedostarczony”, „niedostarczony element jest w układzie jako szkielet” |
| 2 | `fallback` | zły typ komponentu | `component !== 'WorkspaceItem'` (bez względu na dane) | `/component` | `FallbackCard` | tak | `itemStates`: „fallback: zły typ komponentu”, „zły typ komponentu jest rozpoznawany przed treścią” |
| 3 | `pending` | dane w drodze | któryś binding (`{path}`) nie ma jeszcze danych, w tym `content` (ST-1(b)) | — | `PendingCard` z tytułem (ST-3) | nie | `itemStates`: „pending: treść (binding content) w drodze”, „ST-1(b): …” |
| 4 | `fallback` | złe propsy | `catalog.ts: validateProps('WorkspaceItem')`: `kind`, `title`, `representations` (lista), `presentation`, `priority`, `actions/…`, `content` (brak albo nie obiekt, np. `null`). Brak wymaganego propsa dosłownego i binding rozwiązany do złej wartości też tu trafiają | `/{prop}…` | `FallbackCard` | tak | `itemStates`: „fallback: złe propsy (presentation od agenta = dismissed)”, „fallback: pusta lista reprezentacji”, „fallback: treść niebędąca obiektem (content: null)”, „WorkspaceItem bez propsa content”, „binding rozwiązany do złej wartości” |
| 4a | `fallback` | reprezentacja niedozwolona dla rodzaju | to samo, `KIND_REPRESENTATIONS` | `/representations/{i}` | `FallbackCard` | tak | `itemStates`, `workspace.test.ts` |
| 5 | `fallback` | brak obsługiwanej reprezentacji (*unsupported*) | żadna z listy nie jest w `SUPPORTED_REPRESENTATIONS` (P10) | `/representations` | `FallbackCard` | tak | `itemStates`, `workspace.test.ts` |
| 6 | `fallback` | zła treść | `catalog.ts: validateContent` dla wybranej reprezentacji | `/content/…` | `FallbackCard` | tak | `itemStates`: „fallback: zła treść dla reprezentacji” |
| 7 | `ready` | — | wszystko poprawne | — | widok reprezentacji pod `RenderGuard` | nie | `itemStates`: „ready” |

Ścieżki w tabeli są względne do `/components/{id}`.

**Reguła wiersza 3:** propsy nie są walidowane, dopóki któryś binding czeka na dane. Zły `kind` przy treści w drodze daje `pending` bez raportu. Raport pojawia się dopiero po nadejściu danych (`itemStates`: „propsy sprawdzane dopiero po dotarciu treści”). Tak samo opisuje to warstwa schematu (`schemas/flowassist-v2/components.schema.json`: propsy sprawdzane po rozwiązaniu bindingów) i tak działa `resolveTree`. Wyjątkiem jest zły typ (wiersz 2). „Brak danych” znaczy `undefined` pod ścieżką bindingu; `null` to już dane i podlega walidacji (wiersz 4).
- **Co jest bindingiem:** każdy prop **najwyższego poziomu** w kształcie `{path}` (`contract.ts: isBinding`: obiekt z jednym kluczem `path` typu string; `path` nie musi być poprawnym JSON Pointerem), **także prop spoza katalogu**, np. pole układu `x` (wyjątek od I3, ADR 0001). Zagnieżdżony `{path}` w dosłownej treści nie jest rozwiązywany. Testy: `itemStates`: „binding na dowolnym propsie najwyższego poziomu…”.
- **Maskowanie:** dosłowny błąd propsa (np. `kind: 'pie'`) przy bindingu bez danych daje `pending` bez raportu, dopóki dane nie dojdą; dopiero potem `fallback`. Tak samo działa drzewo slotu. Binding, którego dane nigdy nie dojdą, zostawia więc element w trwałym `pending` bez raportu (`itemStates`: „maskowanie: …”).
- **Przejście `ready` → `pending`:** usunięcie danych któregokolwiek bindingu wraca element do `pending` i odmontowuje widok reprezentacji (`overlay/ItemContent.tsx: ItemBody`, komparator `memo` wymaga dwóch widoków `ready`), więc lokalny stan widoku przepada, choć `content` się nie zmienił. Przed ST-1(b) dotyczyło to tylko `content` (i wymaganych propsów przez fallback). `pending` nie kończy wystąpienia raportu (`validationReporting.ts: sync`), więc ten sam błąd przed i po nim to jeden raport (`itemStates`: „ready → pending po usunięciu danych bindingu tytułu…”).

**Raportowanie:** status fallbacku w tabeli przekłada się 1:1 na problem w `validationReporting.ts: scanSurfaces`, z tą samą ścieżką. Cykl wystąpienia (raz na wystąpienie, koniec przy powrocie do `ready` albo zniknięciu członka) opisuje nagłówek `validationReporting.ts`. `itemStates` sprawdza dla każdego wiersza: raport tylko dla `fallback`, z tą samą ścieżką, a stan węzła w raportowaniu równy statusowi widoku.

### Błąd renderu: czwarty obserwowalny stan

Element w statusie `ready`, którego widok rzuci wyjątek na danych agenta, pokazuje `FallbackCard` z przyczyną „błąd renderowania: …” i ścieżką `/components/{id}/content`.
- Nie ma go w `WorkspaceItemView`. Dla walidacji element pozostaje `ready` (`scanSurfaces`).
- Raport idzie z `RenderGuard.onError` przez `reportRenderProblem`, raz na wystąpienie. Odzyskanie liczone jest osobno dla każdego wariantu (`card`, `screen`). Założenie o granulacji wariantu opisuje nagłówek `validationReporting.ts`, ADR 0003 tylko do niego odsyła.
- Ponowienie renderu następuje po zmianie `content` albo gęstości (`resetKeys`).
- Testy: `validationReporting.test.tsx` („błąd renderu…”, „odzyskanie per wariant renderowania”), `hostileRender.test.tsx` („ItemBody: błąd widoku daje FallbackCard + VALIDATION_FAILED…”).

### Kategoria z `path`: granice

- `/representations` oznacza dwie przyczyny: listę pustą lub z nieznaną wartością (wiersz 4) albo brak obsługiwanej reprezentacji (wiersz 5). Rozróżnia je tylko `reason` (`itemStates`: „pusta lista reprezentacji” i „brak obsługiwanej reprezentacji”).
- `/content…` oznacza trzy przyczyny:
  - treść niebędącą obiektem (wiersz 4, np. `content: null`, ścieżka dokładnie `/content`), odrzuconą już w walidacji propsów, przed `validateContent`;
  - złą treść dla reprezentacji (wiersz 6, `/content/…`);
  - błąd renderu (dokładnie `/content`, prefiks `reason` „błąd renderowania:”).

  Testy: `itemStates`: „fallback: treść niebędąca obiektem (content: null)”, „fallback: zła treść dla reprezentacji”; błąd renderu jak wyżej.
- Jeśli adapter (P1.6) albo agent będzie potrzebował kodu przyczyny niezależnego od tekstu, trzeba dodać pole do `WorkspaceItemView`. To zmiana `workspace.ts`, czyli kernela, i wymaga osobnej decyzji. P0.4 jej nie wprowadza.

## Drzewa slotów (HUD, szuflada) dla porównania

W slotach są dwa niezależne źródła stanu. Trzeba je czytać osobno.

**1. Wynik resolvera** (`resolveTree.ts: ResolvedNode`, to rysuje `SurfaceRenderer`):

| Rodzaj | Kiedy | Raport błędu walidacji | Test |
|---|---|---|---|
| `pending` | dowolny binding węzła bez danych | nie (brak danych to nie błąd) | `resolveTree.test.ts` („brakujące dane z bindingu dają pending”), `itemStates` (ST-1) |
| `fallback`: cykl, głębokość, komponent spoza katalogu | `resolveTree.ts: resolveNode` | tak | `resolveTree.test.ts` |
| `fallback`: złe propsy | `validateProps` po rozwiązaniu bindingów; brak wymaganego propsa dosłownego to fallback | tak | `resolveTree.test.ts` („złe propsy dają fallback”) |
| `component` | wszystko poprawne; widok z `registry.tsx: TREE_VIEWS` pod `RenderGuard` (wariant `slot`). Błąd renderu daje fallback i raport | tylko błąd renderu | `validationReporting.test.tsx` |

Komponent katalogu bez widoku w slocie (`TREE_VIEWS`) resolver zwraca jako `component`, a `SurfaceRenderer` rysuje dla niego `FallbackCard` z `registry.tsx: SLOT_UNAVAILABLE_REASON`.

**2. Błąd struktury z definicji** (`validationReporting.ts: scanSurfaces`, FU-1). Typ niedozwolony w slocie jest wyznaczany z grafu definicji (root → children), **przed** bindingami i niezależnie od wyniku resolvera. Taki węzeł ma w raportowaniu stan `fallback` i raport `/components/{id}/component`, nawet gdy resolver zwraca dla niego `pending` albo nie rozwiązuje go wcale.
- **`pending` nie raportuje braku danych, ale nie wyłącza niezależnego raportu strukturalnego.** Przykład: `Workspace` w HUD z nierozwiązanym bindingiem to `pending` u resolvera i jednocześnie raport `/components/root/component` (`itemStates`: „Workspace w HUD z nierozwiązanym bindingiem…”; `validationReporting.test.tsx`: „typ niedozwolony w slocie jest zgłaszany mimo nierozwiązanego bindingu”).
- **`unavailable`** (stan wewnętrzny raportowania) to członek grafu, którego resolver nie rozwiązał, np. pod rodzicem w `pending`. Sam nie raportuje i nie kończy trwającego wystąpienia. Tak samo nie wyłącza raportu strukturalnego: dziecko z typem niedozwolonym pod rodzicem w `pending` jest zgłaszane (`validationReporting.test.tsx`: „dziecko z typem niedozwolonym w slocie pod rodzicem w pending jest zgłaszane”, „pending rodzica to nie usunięcie dziecka”).

## Ustalenia

### ST-1: o `pending` stołu decyduje wartość `content`, nie rozwiązanie bindingów (stan sprzed ST-1(b))

> **Zrealizowane (b)** — decyzja właściciela 2026-10-06, zmiana kernela w `workspace.ts: resolveItem`: `pending` wtedy i tylko wtedy, gdy któryś binding nie ma danych (`undefined`); brak wymaganego propsa dosłownego, także `content`, daje `fallback` z raportem. Granice zachowane: brak definicji to nadal `pending`, zły typ nadal fallback przed bindingami. Ślady replay bez zmian (mock binduje tylko `content`). Testy: `itemStates`: „ST-1(b): …”. Opis poniżej dotyczy stanu **sprzed** poprawki.

- **Obserwacja (`workspace.ts: resolveItem`, wiersz 3, stan sprzed poprawki):**
  - (a) Binding **wymaganego** propsa innego niż `content` (`kind`, `title`, `representations`) bez danych przy obecnej treści daje `fallback` z raportem `VALIDATION_FAILED`, np. `/components/{id}/title`. Po nadejściu danych element przechodzi w `ready`. Agent strumieniujący tytuł osobno dostanie więc raport błędu w trakcie poprawnego strumieniowania.
  - Binding **opcjonalnego** propsa (`presentation`, `priority`, `actions`) bez danych daje dziś `ready` z wartością domyślną (`hint: null`, `priority: 0`, `actions: []`), bo walidator dopuszcza `undefined` (`catalog.ts: validators.WorkspaceItem`). Gdy dane dojdą, wartość się zmienia.
  - (b) `WorkspaceItem` bez propsa `content` (bez bindingu) zostaje trwałym szkieletem bez raportu, choć walidator wymaga `content`.
  - W drzewie slotu `pending` oznacza dokładnie binding bez danych, a brak wymaganego propsa dosłownego daje `fallback`.
  - **W ramach kontraktu:** koperta przyjmuje oba przypadki. `contract.ts: isComponent` i `envelope.agent-to-client.schema.json` (`$defs.component`) wymagają tylko `id` i `component`, a resztę propsów przepuszczają bez ograniczeń. `resolveItem` rozwiązuje binding `{path}` na każdym propsie, nie tylko na `content`.
  - Testy przypinające ten stan zastąpiono testami „ST-1(b): …” (wymagany i opcjonalny binding, binding rozwiązany do `null`, brak `content`, granice, drzewo).
- **Właściciel:** `workspace.ts` (kernel, ADR 0001). Dzisiejszy mock binduje tylko `content`, więc objaw ujawni dopiero prawdziwy agent (P1.6).
- **Opcje:**
  - (a) zostawić i opisać w profilu transportowym, że bindowany może być tylko `content`. To usuwa tylko przypadek (a); trwały szkielet przy braku dosłownego `content` (b) zostaje;
  - (b) ujednolicić z drzewem: `pending` wtedy i tylko wtedy, gdy któryś binding nie ma danych; brak dosłownego `content` daje `fallback` `/content`. To zmiana kernela w `resolveItem` (kilka linii) plus testy;
  - (c) adapter nie rozwiąże tego sam, bo to semantyka stanu po stronie klienta.
- **Granice opcji (b):**
  - reguła dotyczy tylko istniejącego `WorkspaceItem`: brak definicji nadal daje `pending` (wiersz 1), a zły typ nadal jest błędem przed bindingami (wiersz 2);
  - zmienia też dzisiejsze `ready` na `pending`, gdy zadeklarowany binding opcjonalnego propsa pozostaje bez danych.
- **Rekomendacja:** (b) przed P1.6, jako osobna zmiana zatwierdzona przez właściciela. P0.4 tylko przypina obecne zachowanie. Astra popiera (b) (review P0.4, 2026-10-06).

### ST-2: niedostarczony członek: na stole szkielet, w drzewie pominięty

- **Obserwacja:**
  - stół: id w `Workspace.children` bez komponentu to `pending` (`PendingCard`, w układzie `delivered: false`);
  - drzewo: `resolveTree.ts: resolveNode` filtruje dzieci bez definicji. Nie ma węzła ani stanu w raportowaniu.
  - Testy: `itemStates`: „ST-2: …”.
- **Skutek dziś:** brak skutku **wizualnego w obecnych widokach**: `TaskList` i `Approval` nie rysują `children`, a `Workspace` w slocie jest błędem struktury, więc w slotach nie ma kontenera, który pokazałby różnicę. Semantycznie oba przypadki nie są równoważne: na stole członek ma stan i miejsce w układzie, w drzewie nie istnieje.
- **Opcje:**
  - (a) zostawić i opisać;
  - (b) ujednolicić, gdy pojawi się kontener w slocie.
- **Decyzja (właściciel, 2026-10-06):** (a), zostaje.

### ST-3: tytuł w `pending` i `fallback` tylko jako tekst dosłowny

- **Obserwacja:** `resolveItem` bierze `title` do `pending` i `fallback` z definicji (`typeof def.title === 'string'`). Tytuł z bindingu nie trafia do szkieletu ani karty błędu, nawet gdy jego dane już są. W `ready` tytuł jest rozwiązany. Test: `itemStates`: „ST-3: …”.
- **Skutek:** kosmetyczny. Szkielet ma wtedy nagłówek „Ładowanie…” (`overlay/WorkspaceLayer.tsx`, `overlay/ScreenLayer.tsx`), a karta błędu pokazuje `id` elementu zamiast tytułu.
- **Opcje:**
  - (a) zostawić;
  - (b) użyć rozwiązanego tytułu, jeśli jest tekstem. To zmiana `resolveItem` (kernel).
- **Decyzja (właściciel, 2026-10-06):** (a), zostaje. Po ST-1(b) dotyczy to też szkieletu elementu, który czeka na dane tytułu.

### ST-4: układ czyta hint prezentacji i priorytet tylko z dosłownej definicji

- **Obserwacja (ujawniona przy ST-1(b)):**
  - `workspace.ts: workspaceMeta` bierze `presentation` i `priority` z surowej definicji (`typeof c.presentation === 'string'`, `typeof c.priority === 'number'`). Binding tych propsów daje w układzie `hint: null` i `priority: 0`, także gdy jego dane już są.
  - `resolveItem` rozwiązuje je w widoku `ready` (`hint`, `priority`), ale te pola widoku nie są nigdzie czytane: układ (`layout.ts: reconcileLayout`, P4, P5, P9) korzysta tylko z `workspaceMeta`.
  - Skutek: agent, który zbinduje poprawną wartość `presentation` (np. `'screen'`) albo `priority`, nie zmieni układu i nie dostanie raportu. Po ST-1(b) taki binding nadal wstrzymuje gotowość elementu (`pending` do nadejścia danych) i podlega walidacji: zła wartość, np. `'dismissed'`, daje fallback `/presentation` z raportem. Ignoruje go wyłącznie układ.
  - Test: `itemStates`: „ST-4: …”.
- **Właściciel:** `workspace.ts: workspaceMeta` (kernel) i polityka hintów P4/P5 (`layout.ts`, ADR 0001).
- **Opcje:**
  - (a) profil transportowy (P1.7) zapisuje, że `presentation` i `priority` są tylko dosłowne; binding jest poza profilem: układ go ignoruje, ale wstrzymuje gotowość i jest walidowany;
  - (b) `workspaceMeta` rozwiązuje bindingi tych propsów. Hint zmieniałby się wtedy razem z danymi, czyli zmiana danych mogłaby przenieść kartę na ekran. To zmiana semantyki P4/P5 (kernel);
  - (c) binding `presentation`/`priority` jako błąd walidacji z raportem. Zmiana kernela i kontraktu.
- **Rekomendacja:** (a) w v1.3. Hint to polecenie układu, nie dana; (b) otwiera nową klasę zmian układu sterowanych danymi.
- **Decyzja (właściciel, 2026-10-06):** (a). W v1.3 `presentation` i `priority` tylko dosłownie, bez bindingów; opisać w profilu
  transportowym przy P1.7. Kod bez zmian (binding nadal wstrzymuje gotowość i jest walidowany, układ go ignoruje).

## Otwarte po review ST-1(b) — rozstrzygnięte 2026-10-06

Recenzja niezależna w świeżym kontekście (2026-10-06), werdykt GO WITH FIXES; poprawki w kodzie, ADR i testach wprowadzone. Bez decyzji zostają:
- **Q1: zawęzić `pending` do bindingów propsów z katalogu?** Dziś (jak w drzewie slotu) binding na polu spoza katalogu, np. `x` albo `source: {path: 'report.pdf'}`, wstrzymuje element; binding, którego dane nigdy nie dojdą, maskuje dosłowny błąd bez raportu. Zawężenie usuwa pierwszy przypadek (nie drugi) i łamie parytet z `resolveTree`. To nowa decyzja kernelowa.
  **Decyzja:** bez zmiany kernela. Profil transportowy (P1.7) dopuszcza bindingi tylko w propsach katalogu; adapter
  (P1.6) odrzuca binding w nieznanym polu z `VALIDATION_FAILED` (ścieżka OBS-1). Dane, które nigdy nie dochodzą —
  temat lifecycle P1.6.
- **Q2 (ST-4):** pola `hint` i `priority` widoku `ready` nie są nigdzie czytane, układ korzysta z `workspaceMeta`. Usunąć je z `WorkspaceItemView` albo oznaczyć jako nieautorytatywne, zanim ktoś zacznie ich używać (zmiana `workspace.ts`).
  **Decyzja:** usunąć jako osobny kernel cleanup w P1.7 (razem z opisem ST-4 w profilu).
- **Q3 (przed P1.6, istniejące wcześniej):** `resolveItem` i `resolveTree` budują propsy w zwykłym obiekcie, więc klucz `__proto__` od agenta zmienia jego prototyp (dziedziczone pola trafiają do walidatorów). Nie dotyczy `Object.prototype` (brak globalnego skażenia). Kandydat na utwardzenie granicy danych razem z adapterem: `Object.create(null)` albo odrzucenie klucza w `parseEvent`.
  **Decyzja → FU-4, zrealizowane:** granica protokołu odrzuca zarezerwowane klucze własne `__proto__`, `constructor`,
  `prototype` na każdym poziomie ładunku oraz te nazwy jako `id`, wpis `children` i segment ścieżki (ADR 0002).

## Poza zakresem

- Stany prezentacji (`card`/`focus`/`screen`/`dismissed`) i geometria są lokalne dla klienta (ADR 0003, `layout.ts`).
- Ogłaszanie stanów czytnikowi ekranu (nowy element `ready`, błąd) należy do P0.5.
