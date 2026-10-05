# ADR 0003: Akcje lokalne vs semantyczne

- **Status:** zaakceptowany (v1.3)
- **Kontekst:** biblioteki (menu, dialogi, gesty, transport) nie rozróżniają, czy intencja jest lokalną zmianą formy, czy operacją, o której decyduje agent. To rozróżnienie jest produktowe i zostaje w CameleONie.
- **Decyzja:** każda intencja użytkownika ma jedno przeznaczenie z tabeli. Biblioteka może ją wywołać, ale nie zmienia jej klasy.

| Klasa | Przykłady | Przeznaczenie | Kod |
|---|---|---|---|
| Zmiana formy (lokalna) | focus, blur, toScreen, toCard, move, resize, raise, dismiss, restore | `store.layoutCommand(LayoutCommand)` → `layout.ts: presentationReducer`. **Nic nie trafia do agenta** | `layout.ts: LayoutCommand` |
| Kamera (lokalna) | suwak 360°, ręczny obrót | `store.setAngle` (`source: 'manual'`, okres łaski P3) | `store.ts` |
| Hint agenta (przychodzący) | `presentation`, `stage.focus` | walidowany hint; stosowany wg P3–P5 | `reducer.ts`, `layout.ts: reconcileLayout` |
| Operacja semantyczna | „Pogłęb”, „Zatwierdź”, „Odrzuć”, „Pokaż jako…”, akcje z `WorkspaceItem.actions` | `store.sendAction(name, surfaceId, sourceComponentId, context)` → A2UI `action` z `itemId` i migawką układu `{ screen, focus, dismissed }`; widok zmienia dopiero odpowiedź agenta | `store.ts: sendAction`, `layout.ts: layoutSnapshot`, `contract.ts: buildAction` |
| Stan efemeryczny UI | otwarcie menu, rozwinięcie decyzji, zoom treści ekranu | lokalny `useState` w komponencie; ani store, ani agent | `WorkspaceLayer` (`menu`), `ScreenLayer` (`menu`, `zoom`), `HudLayer` (`expanded`) |
| Błąd klienta | nieprawidłowe propsy lub treść, błąd renderu | A2UI `error` `VALIDATION_FAILED`, raz na wystąpienie problemu (nawrót po odzyskaniu = nowe zgłoszenie; odzyskanie = walidacja wraca do `ready` albo udany render tego samego wariantu renderowania (`card` / `screen` / `slot`, także po remoncie) — sama zmiana danych nim nie jest; wystąpienie kończy się, gdy nie zawodzi żaden wariant); granulacja wariantu opiera się na założeniu opisanym w nagłówku `validationReporting.ts`; tylko w tym samym, aktywnym przebiegu | `validationReporting.ts`, `store.reportClientError(error, { runId })` |

## Reguły

1. Zamknięcie menu lub dialogu nie jest zdarzeniem semantycznym. Wybór pozycji menu jest nim tylko wtedy, gdy pozycja pochodzi z `actions` elementu.
2. Akcja semantyczna jest wysyłana wyłącznie w `running` lub `awaiting_action` (ADR 0001, I6). Poza nimi jest ignorowana z ostrzeżeniem.
3. Migawka układu nigdy nie zawiera współrzędnych, rozmiaru ani `z`.
4. Zmiana reprezentacji przez użytkownika (gdy wejdzie) jest lokalna; może być raportowana w migawce, ale nie staje się poleceniem dla agenta.

## Testy

`loop.test.ts`:
- „akcja nie zmienia stołu, dopóki agent nie odeśle zdarzeń; context niesie itemId i migawkę układu”;
- „zmiany formy… nie wysyłają nic do agenta”.

`layout.test.ts`:
- „layoutSnapshot: bez współrzędnych”.
