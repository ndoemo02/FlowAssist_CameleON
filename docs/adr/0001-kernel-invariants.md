# ADR 0001: Inwarianty kernela CameleON (I1–I10)

- **Status:** zaakceptowany (v1.3)
- **Kontekst:** v1.3 to wydanie utwardzające i adapterowe. Zewnętrzny audyt i review Astry
  wskazały, że zamrożenie samej listy plików nie chroni semantyki. Zmiana w `catalog.ts` albo
  w adapterze może zmienić zachowanie kernela bez dotykania jego plików.
- **Decyzja:** zamrażamy poniższe inwarianty. Pliki kernela nie są edytowane w v1.3.
  Każda propozycja ocenia też wpływ na I1–I10, nie tylko listę zmienionych plików.

## Pliki kernela

`reducer.ts`, `layout.ts`, koordynator w `store.ts` (`dispatch`, `layoutCommand`, `receiveStatus`,
`sendAction`, `tweenTo`/`tickCamera`), `workspace.ts`, `overlay/gestureLogic.ts`,
`scene/measureScreen.ts`, `scene/ScreenAnchor.tsx`, `scene/anchorRegistry.ts`.

## Inwarianty

### I1: treść jest niezależna od reprezentacji
Ten sam element (`WorkspaceItem` o danym `id`) przechodzi card ↔ focus ↔ screen bez kopiowania danych.
Treść pochodzi z bindingu `content` do data modelu surface'u `workspace`.
- **Kod:**
  - `workspace.ts: resolveItem` (jeden widok na `id`);
  - `overlay/ItemContent.tsx: useItemView`, `ItemBody` (memo po referencji `content`);
  - `WorkspaceLayer` i `ScreenLayer` używają tego samego `useItemView`.
- **Testy:**
  - `workspace.test.ts`: „aktualizacja danych zmienia treść, a niezmienione dane zachowują referencję”;
  - `scenario.test.ts`: „C6: element zaktualizowany na ekranie wraca na stół z aktualną treścią”.

### I2: podział własności
- **Agent:** treść, semantyka (`kind`, `title`), dozwolone reprezentacje, hint prezentacji `card`/`focus`/`screen`, priorytet, akcje semantyczne.
- **Klient:** `x`, `y`, `scale`, `z`, stan `dismissed`.
- **Kod:**
  - `layout.ts: LayoutEntry`, `reconcileLayout` (P4: hint tylko przy zmianie, P5: `dismissed` nadrzędne);
  - `catalog.ts: validators.WorkspaceItem` (`presentation` tylko z `PRESENTATIONS`, więc `dismissed` od agenta daje fallback elementu).
- **Testy:** `layout.test.ts`, czyli P4 i P5.

### I3: agent nie steruje geometrią układu
Współrzędne, rozmiar i kolejność warstw kart nigdy nie pochodzą od agenta, także pośrednio przez opcje bibliotek.
- **Stan faktyczny:**
  - Pola układu w propsach `WorkspaceItem` (np. `x`, `y`) **nie są odrzucane, tylko strukturalnie ignorowane**: `workspace.ts: workspaceMeta` czyta wyłącznie `presentation` i `priority`, a `reconcileLayout` bierze pozycję z `autoSlot`.
  - Walidacja nie zgłasza nieznanych propsów.
- **Granica pojęć:** `x`/`y` w treści `MapView` (`catalog.ts: views.MapView`, zakres 0..1) to **dane treści** (punkty na schemacie mapy), nie geometria układu. Są dozwolone.
- **Testy:**
  - `layout.test.ts`: „layoutSnapshot: bez współrzędnych” (kierunek klient → agent);
  - kierunek agent → klient (ignorowanie pól układu) **nie ma testu**; uzupełnia go korpus P0.2.

### I4: reguły prezentacji P1–P10
- P1: co najwyżej jeden element na ekranie.
- P2: co najwyżej jeden w focusie.
- P3: kamera według źródła komendy.
- P4: hint stosowany przy zmianie wartości.
- P5: `dismissed` nadrzędne.
- P6: członkostwo = `Workspace.children`; niedostarczony ≠ usunięty; ponowne dodanie = nowy wpis.
- P7: reset przy restarcie i `deleteSurface`.
- P8: kolejność koordynatora.
- P9: auto-layout i przeliczenie siatki dla kart nieprzesuniętych.
- P10: pierwsza **obsługiwana** reprezentacja z listy agenta. Reprezentacja niedozwolona dla rodzaju (`KIND_REPRESENTATIONS`) daje fallback.

**Konsekwencja P10:** rozszerzenie `catalog.ts: SUPPORTED_REPRESENTATIONS` zmienia wynik dla istniejących elementów, choć `workspace.ts` zostaje nietknięty. Patrz ADR 0002.
- **Kod:** `layout.ts`, `workspace.ts: resolveItem`, `store.ts` (P3, P8).
- **Testy:** `layout.test.ts` (P1, P2, P4–P7, P9), `workspace.test.ts` (P6, P10), `loop.test.ts` (P3, P7, P8).

### I5: kolejność koordynatora
Zdarzenie agenta: `parseEvent` → `reduce` → `reconcileLayout` (tylko gdy zmienił się surface `workspace`) → jeden `set()` → efekty (kamera, TTS, raport błędów).
Komenda użytkownika: `presentationReducer` → jeden `set()` → kamera.
- **Kod:** `store.ts: dispatch`, `layoutCommand`.
- **Testy:** `loop.test.ts`: „kamera i referencje stanu”, „koordynator: ekran i kamera (P3)”.

### I6: izolacja przebiegów i trwałość stanu terminalnego
- Zdarzenia z innym `runId` są odrzucane.
- Po `done` lub `error` store ignoruje zdarzenia i statusy tego przebiegu.
- Akcje semantyczne są wysyłane tylko w `running` i `awaiting_action`.

Ochrona jest w store, niezależnie od transportu.
- **Kod:** `store.ts: dispatch`, `receiveStatus`, `sendAction`.
- **Testy:** `loop.test.ts`: „trwałe zakończenie przebiegu”, „restart odcina zdarzenia starego przebiegu”.
- **Uwaga:** chwilowa utrata połączenia nie może prowadzić do `done`/`error` (decyzja v1.3.2; adapter P1.6).

### I7: tożsamość gestu
Gest zapamiętuje `instance` i `rev` wpisu przy starcie. `rev` rośnie przy każdej zmianie spoza gestu: hint agenta, przeliczenie siatki, zrzucenie z focusu lub ekranu. Gest nieaktualny jest anulowany bez zapisu.
- **Bez tokenu:** `raise` (na starcie drag), `focus`, `toScreen`. Dodanie im tokenów to zmiana kernela.
- **Kod:** `overlay/gestureLogic.ts: gestureToken`, `isGestureStale`, `dragEndCommand`; `layout.ts: presentationReducer` (`move`/`resize`/`dismiss` z `rev`/`instance`).
- **Testy:** `gestureLogic.test.ts`: „tożsamość gestu”; `layout.test.ts`: „move: zapis tylko przy niezmienionym rev”.

### I8: arbitraż kamery i polityka ScreenAnchor
- **P3:** komenda użytkownika „na ekran” zawsze przenosi kamerę. Hint agenta `screen` przenosi ją tylko bez ręcznego obrotu w ostatnich `MANUAL_GRACE_MS` = 2000 ms. `stage.focus` zmienia się razem z ruchem kamery.
- **ScreenAnchor:**
  - unia meshy ekranu bez rekwizytu `Object003`;
  - histereza pokrycia 0,82 / 0,75;
  - histereza kąta 16° / 20°;
  - tryb wyśrodkowany przy proporcjach < 1,2 lub szerokości < 600 px.

Jawnie zatwierdzona kalibracja progów nie łamie inwariantu. Zmiana polityki (co oznacza „ekran widoczny”) już tak.
- **Kod:** `store.ts` (`MANUAL_GRACE_MS`, `tweenTo`), `scene/measureScreen.ts`, `scene/ScreenAnchor.tsx`, `scene/screenGeometry.ts`.
- **Testy:** `loop.test.ts` (P3), `measureScreen.test.ts` (geometria, histereza, tryb centered).

### I9: zmiany formy są lokalne
Drag, resize, focus, ukryj i przywróć nie trafiają do agenta. Akcja semantyczna niesie `itemId` i migawkę układu (`screen`, `focus`, `dismissed`) bez współrzędnych. Szczegóły: ADR 0003.
- **Kod:** `store.ts: sendAction`, `layout.ts: layoutSnapshot`.
- **Testy:** `loop.test.ts`: „zmiany formy… nie wysyłają nic do agenta”, „context niesie itemId i migawkę układu”.

### I10: zamknięty, zaufany katalog rendererów
Agent wybiera spośród zamkniętej listy komponentów (`CATALOG_NAMES`) i reprezentacji (`REPRESENTATIONS`). Klient rysuje je wyłącznie lokalnymi widokami z `registry.tsx`. Bez HTML, JS, CSS ani URL-i obrazów od agenta. Nieznany komponent lub złe propsy dają `FallbackCard` i raport `VALIDATION_FAILED`.
- **Kod:** `contract.ts: CATALOG_NAMES`, `isComponent`; `catalog.ts`; `registry.tsx: TREE_VIEWS`, `REPRESENTATION_VIEWS`.
- **Testy:** `resolveTree.test.ts` („nieznany komponent daje fallback”), `workspace.test.ts` (fallbacki).

## Konsekwencje

- Biblioteki wchodzą wyłącznie przez adaptery (ADR 0004).
- Zachowanie niepożądane ujawnione przez fixture'y naprawiamy na najwęższej warstwie, która jest właścicielem problemu.
  - Duplikat transportowy (ten sam identyfikator zdarzenia), replay i zła kolejność → adapter.
  - Niepożądany wynik kernela dla różnych, legalnych zdarzeń → osobna decyzja kernelowa.
  - Nigdy deduplikacja po identycznym payloadzie.
