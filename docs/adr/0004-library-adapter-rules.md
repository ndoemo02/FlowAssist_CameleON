# ADR 0004: Reguły adapterów bibliotek

- **Status:** zaakceptowany (v1.3)
- **Kontekst:** największe ryzyko integracji (audyt zewnętrzny, review Astry) to **podwójne źródło prawdy**. Biblioteka zaczyna po cichu posiadać współrzędne, tożsamość, selekcję, historię lub prezentację, podczas gdy store sądzi, że posiada je sam.
- **Decyzja:** biblioteka wchodzi wyłącznie przez adapter o jawnej granicy. Adapter tłumaczy, ale nie posiada stanu domeny.

## Reguły

1. **Wejście** adaptera to zwalidowana treść albo zdarzenia wejściowe (pointer, sieć), **nigdy** surowe opcje biblioteki od agenta.
2. **Wyjście** adaptera ma jedną z czterech form:
   - `LayoutCommand` przez `store.layoutCommand`;
   - akcja przez `store.sendAction`;
   - surowe zdarzenie lub status przez interfejs `AgentTransport`;
   - zmiany DOM (podgląd, styl).
3. Biblioteka **nie zapisuje do store'u** bezpośrednio i nie trzyma kopii stanu domeny. Pozycje, selekcja i historia wewnątrz biblioteki są stanem efemerycznym widoku.
4. Tożsamość elementu = `id` CameleON. Identyfikatory biblioteki (kształty, węzły, serie) są lokalne dla widoku.
5. Agent nie przekazuje współrzędnych układu ani konfiguracji biblioteki, także pośrednio.
6. Jedna biblioteka na rolę. Spike porównuje kandydatów, a do kodu trafia najwyżej jeden.
7. Adapter musi przejść korpus fixture'ów (P0.2) bez zmian w testach kernela.

## Istniejące granice

| Rola | Granica | Wejście → wyjście | Właściciel stanu |
|---|---|---|---|
| Transport | `transport/types.ts: AgentTransport` | sieć → `onEvent(runId, raw)` / `onStatus(runId, status)`; `parseEvent` to pierwsza bramka po stronie store'u | `store.scenario`; deduplikacja, kolejność i reconnect należą do adaptera |
| Renderery reprezentacji | `registry.tsx: REPRESENTATION_VIEWS` | treść zwalidowana przez `catalog.validateContent` + `density` → DOM/SVG; biblioteka zaczyna się wewnątrz widoku | data model w `store.surfaces.workspace.data` |
| Widoki drzewa HUD i tasków | `registry.tsx: TREE_VIEWS` | propsy po `resolveTree` → DOM; `onAction` → `sendAction` | `store.surfaces` |
| Gesty | `overlay/gestures.ts` (dziś `@use-gesture/react`) | pointer/touch → podgląd `style.transform` → `LayoutCommand` przez `gestureLogic.ts` | `store.layout` |
| Projekcja ekranu | `scene/anchorRegistry.ts` | meshe Three.js → `AnchorState` (prostokąt w px, `active`, `mode`); poza adapterem nie ma referencji Three.js | stan kotwicy (nie w store A2UI) |
| Prymitywy dostępności (przyszłe, P1.2) | wnętrze menu i dialogów w `overlay/*` | lista `actions` → `onSelect(name)` → `sendAction`; biblioteka posiada fokus i Escape | lokalny `useState` (otwarcie) |

## Znane ograniczenie

Ścieżka reprezentacji przekazuje widokom pusty `onAction` (`overlay/ItemContent.tsx: RepresentationView`). Widok reprezentacji nie może dziś sam wysyłać akcji. Akcje elementu idą przez menu karty i ekranu. Każda reprezentacja z wewnętrzną interakcją semantyczną (np. `embedded-app`, v1.4) wymaga nowej, kontrolowanej granicy, a nie ominięcia tej.
