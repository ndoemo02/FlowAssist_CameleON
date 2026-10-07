# Review P1.7b (zamknięcie profilu) — Astra (openai/gpt-6-astra, inference.sh)

> 2026-10-07, task `7een09wqrnaweht291yktzzz0g`, koszt $1.2876. Wejście: brief, decyzje §9 planu, wyniki, dokument profilu (HEAD 8ff3762), diffy 6cca2dc..adb0f70 i adb0f70..8ff3762 (bez dokumentu), pełne contract.ts i transport/profile.ts. Tokeny: 53622 wejście / 15027 wyjście. Pytanie: czy P1.7b jest zamkniętym kontraktem i czy P1.6 może powstać bez nowych reguł transportowych.

## Werdykt: ISSUE

### 1. HIGH — wymagany resync może być niemożliwy dla legalnie zbudowanego stanu
**§7.5, l. 228–230:** „`updateComponents` ze wszystkimi komponentami”, następnie „`updateDataModel` bez `path` (całość)”. **§10.8, l. 325:** wiadomość ≤ 256 KiB.

- **Scenariusz:** dwa poprawne `updateDataModel`, pod `/a` i `/b`, zapisują po 150 KiB danych. Każda wiadomość mieści się w limicie. Po zerwaniu pełna wiadomość odtwarzająca model ma ponad 300 KiB i musi zostać odrzucona. Analogiczny problem dotyczy komponentów dodawanych osobnymi wiadomościami.
- **Luka:** limit pojedynczej wiadomości nie ogranicza rozmiaru zgromadzonego stanu. Agent nie może jednocześnie wykonać pełnego resync według §7.5 i przestrzegać §10.8. Implementujący musiałby dopisać porcjowanie albo ograniczenie stanu.
- **Proponowana reguła minimalna, bez nowego formatu:** agent MUSI po każdej operacji utrzymywać stan surface’u tak mały, żeby wymagane pełne wiadomości resync mieściły się w 256 KiB. Jeżeli takie ograniczenie jest nieakceptowalne, przed P1.6 trzeba normatywnie zdefiniować porcjowanie i kolejność rekonstrukcji — nie pozostawiać tego adapterowi.

### 2. MEDIUM — pełny snapshot JSON nie odtwarza usuniętych elementów tablic
**§10.7, l. 320:** usunięcie zachowuje długość, element staje się `undefined`. **§7.5:** resync odtwarza pełne dane wiadomością bez `path`.

- **Scenariusz:** model zawiera `{"rows":[10,20]}`. Usunięcie `/rows/0` pozostawia `[undefined,20]`. Następuje resync.
- **Luka:** JSON nie przenosi `undefined`. Snapshot z `[null,20]` daje inny stan, a skrócenie tablicy łamie zachowanie indeksów. Dokument nie ustanawia równoważności `null` i braku wartości ani sposobu odtworzenia tych miejsc.
- **Proponowana reguła:** snapshot resync reprezentuje usunięte miejsca jako `null`, po czym agent MUSI wysłać dla każdego z nich `updateDataModel` z właściwym `path`, bez `value`. Dopiero po tych korektach rekonstrukcja jest zakończona i wolno emitować wynik lifecycle. Trzeba jawnie dopuścić tę sekwencję w §7.5.

### 3. MEDIUM — sprzeczne polecenia dotyczące usuwania surface’u podczas resync
**§7.5, l. 231:** dla surface’u klienta, którego agent już nie ma: `deleteSurface`. **§7.6, l. 238:** „dla trzymanych surface’ów nie ma `deleteSurface`”.

- **Scenariusz:** klient trzyma `tasks-drawer`; agent usunął go podczas zerwanego połączenia. Resync dostaje go w `surfaces`.
- **Sprzeczność:** §7.5 nakazuje usunięcie, §7.6 go zabrania. To wpływa na widoczny stan, nie tylko na sposób implementacji.
- **Proponowana reguła:** zakaz `deleteSurface` i ponownego `createSurface` dotyczy wyłącznie surface’ów istniejących **po obu stronach**. Dla surface’u istniejącego tylko u klienta obowiązuje usunięcie z §7.5.

### 4. MEDIUM — nieostra granica błędu fatalnego ramki i niefatalnego odrzucenia wiadomości
**§5.4, l. 144:** „zły kształt `value`” → `profile:FRAME_INVALID`. **§11.5:** `NOT_OBJECT`, `PAYLOAD_COUNT` → diagnostyka.  
**`frame.schema.json`, `properties.value.properties.message`:** walidacja ramki obejmuje pełny schemat wiadomości.

- **Scenariusz:** po poprawnym `RUN_STARTED` przychodzi ramka z poprawnymi `profile`, `seq: 0`, ale `message: null` albo wiadomością mieszaną `stage` + `narration`.
- **Luka:** pełna walidacja schematu ramki odrzuca jej `value`, co prowadzi do błędu fatalnego. Przekazanie zawartości do `parseEventDiagnostic` prowadzi do niefatalnej diagnostyki. Wyjaśnienie, że schemat opisuje obowiązek agenta, nie wyznacza dokładnie granicy tych dwóch reakcji odbiorcy.
- **Proponowana reguła:** fatalna walidacja ramki sprawdza wyłącznie strukturę `value`, dozwolone/wymagane klucze, `profile` i `seq`; wymaga **obecności** `message`, ale nie jego poprawności. Następnie sprawdzana i konsumowana jest sekwencja. Każda wada obecnego `message`, także `null`, tablica i wiele payloadów, jest niefatalna według §11. Brak `message` pozostaje fatalny. Pełnego `frame.schema.json` nie wolno używać jako pojedynczego fatalnego guarda.

## Decyzja: NO-GO

Dla deklaracji **„P1.7b zamknięte, P1.6 może startować bez nowych reguł transportowych”** — do rozstrzygnięcia powyższych punktów.

### Potrzebne pliki
Do dokończenia kontroli zgodności, niezależnie od powyższych ustaleń:
- pełne schematy `flowassist-v2/` oraz `flowassist-transport-1/client-capabilities.schema.json`;
- `jsonPointer.ts`, `reducer.ts`, `store.ts`, `layout.ts`, `catalog.ts` i pełny ADR 0002;
- `transport/{types,capabilities,runPermission,mockTransport}.ts` oraz wspólny test zgodności transportu;
- przypięte źródła AG-UI: schemat, lifecycle, interrupt–resume, przetwarzanie i HTTP+SSE; odpowiednie źródła klienta 1.0.2;
- przypięte schematy A2UI klient ↔ agent oraz normatywna semantyka aktualizacji danych.

### Czego nie sprawdziłam
Nie uruchamiałam testów ani sond. Nie potwierdziłam niezależnie wyników autora, zachowania SDK ani zgodności z pełnymi źródłami upstream i niewysłanymi plikami repo. Powyższe uwagi wynikają z dostarczonego dokumentu i schematów.