# ADR 0005: Zachowania ujawnione przez korpus fixture'ów (P0.2)

- **Status:** zaakceptowany: decyzje właściciela 2026-10-05 (tabela poniżej). W momencie zapisu nic nie było naprawione; ślady w `fixtures/traces/` to **baseline** sprzed poprawek.

| # | Decyzja | Realizacja |
|---|---|---|
| OBS-1 | **(b)** raport `VALIDATION_FAILED` w adapterze | w P1.6 (adapter AG-UI), kernel bez zmian |
| OBS-2 | **(b)** okres łaski 2 s także dla `stage.focus` agenta | **zrealizowane** commitem „fix(aiui): respect manual camera grace for stage focus” (kernel: `store.ts: dispatch`). W okresie łaski `stage.focus` agenta nie przejmuje kamery i nie zmienia `stage.focus` (jak hint `screen`); `drawer` z tego samego komunikatu stosowany normalnie. Po okresie łaski bez zmian: efekt kamery także dla niezmienionej wartości. Zmieniony ślad fixture 08; 4 testy przypadków w `loop.test.ts` |
| OBS-3 | **(a)** utrzymujemy `v0.9` + `v0.9.1` na wejściu | do czasu handshake'u i utwardzania wersji (P1.7, ADR 0002) |
| OBS-4 | **(b)** mieszane koperty odrzucane | **zrealizowane** commitem „fix(aiui): reject mixed protocol envelopes” (po P0.3): `parseEvent` wymaga dokładnie jednego klucza payloadu; zmieniony ślad fixture 12 (drawer zostaje `closed`, ostrzeżenie o odrzuceniu) |
- **Kontekst:** korpus (`src/features/aiui/__tests__/fixtures/`) odtwarza zdarzenia przez koordynator aplikacji. Zapisuje stan, efekty (kamera, TTS) i komunikaty wychodzące.
  - Ślady są w `fixtures/traces/*.trace.json`.
  - Jawne asercje są w `__tests__/replay.test.ts`; poniższe zachowania są tam przypięte jako **obecne**.
  - Zgodnie z planem v1.3.2 problem naprawia najwęższa warstwa, która jest jego właścicielem:
    - duplikat transportowy (ten sam identyfikator), replay, zła kolejność → adapter;
    - niepożądany wynik kernela dla różnych, legalnych zdarzeń → decyzja kernelowa;
    - nigdy deduplikacja po identycznym payloadzie.

## Do decyzji

### OBS-1: komunikat niezgodny z kontraktem jest odrzucany po cichu (fixture 03)
- **Obserwacja:** `createSurface` z obcym katalogiem: `parseEvent` zwraca `null`, a `store.dispatch` wypisuje tylko `console.warn`. Agent **nie dostaje** błędu. Dowiaduje się pośrednio dopiero przy kolejnym `updateComponents` (`SURFACE_NOT_FOUND`).
- **Właściciel:** to nie duplikat transportowy, tylko brak informacji zwrotnej o walidacji koperty. Odrzucenie dzieje się w koordynatorze `store.ts` (`apply`, za `transportDispatch`; kernel).
- **Opcje:**
  - (a) zostawić;
  - (b) adapter (P1.6) przed `onEvent` sam woła eksportowane `parseEvent` i przy `null` odsyła `VALIDATION_FAILED` w ramach profilu transportowego. Kernel bez zmian;
  - (c) raport w `store.dispatch`. Zmiana kernela.
- **Rekomendacja:** (b). Najwęższa warstwa, kernel nietknięty; mock jest skryptowany, więc problem dotyczy dopiero prawdziwego agenta.

### OBS-2: `stage.focus` agenta przerywa ręczny obrót bez okresu łaski (fixture 08)

> **Zrealizowane (b).** Opis poniżej dotyczy stanu baseline sprzed poprawki.
- **Obserwacja:**
  - `reducer.ts` emituje efekt `focus` przy każdym `stage.focus`, także gdy stan się nie zmienia;
  - `store.ts: runEffects` wykonuje `tweenTo` bez sprawdzenia `MANUAL_GRACE_MS`;
  - skutek: zaraz po ręcznym obrocie użytkownika powtórzone `stage.focus: 'back'` (inne zdarzenie, ta sama wartość) zabiera kamerę.

  Okres łaski P3 dotyczy dziś tylko hintu `screen`. Tabela C1 planu v1.2.1 mówi tymczasem, że blokada ręcznego suwaka dotyczy auto-poleceń agenta.
- **Właściciel:** dwa różne, legalne zdarzenia (adapter ich nie odfiltruje) → **decyzja kernelowa** (`reducer.ts`, `store.ts`).
- **Opcje:**
  - (a) zostawić: `stage.focus` agenta to jawne polecenie reżysera i zawsze wygrywa (doprecyzować P3 w ADR 0001);
  - (b) objąć `stage.focus` okresem łaski P3, jak hint `screen`;
  - (c) emitować efekt `focus` tylko przy zmianie `stage.focus`. Wada: agent nie może wtedy ponownie „pokazać” Back po ręcznym obrocie.
- **Rekomendacja:** (b). Spójne z C1 i z obecną semantyką hintu `screen`; nie blokuje agenta po upływie okresu łaski.

### OBS-3: koperta `v0.9` przyjmowana (fixture 12)
- **Obserwacja:** `ACCEPTED_VERSIONS = {'v0.9', 'v0.9.1'}`; komunikat `v0.9` przechodzi jak `v0.9.1`.
- **Właściciel:** powierzchnia protokołu, `contract.ts` (oś 1, ADR 0002).
- **Opcje:**
  - (a) zostawić tolerancję i ją uzasadnić;
  - (b) zawęzić do `v0.9.1`. Jawna zmiana kontraktu.
- **Rekomendacja:** decyzja w ramach protocol hardening. Brak przesłanek pilności, bo mock wysyła `v0.9.1`.

### OBS-4: komunikat z kluczem `stage` i kluczem A2UI traktowany jako samo `stage` (fixture 12)

> **Zrealizowane (b).** Opis poniżej dotyczy stanu baseline sprzed poprawki.
- **Obserwacja:** `{ stage, version, createSurface }`: `parseEvent` sprawdza `stage` jako pierwsze i zwraca tylko je. `createSurface` **znika bez ostrzeżenia** i bez błędu do agenta. To samo dotyczy `narration`.
- **Właściciel:** powierzchnia protokołu, `contract.ts: parseEvent`. Nie kernel.
- **Opcje:**
  - (a) zostawić;
  - (b) odrzucać komunikaty mieszające rozszerzenie z kluczem A2UI (lub dwa rozszerzenia naraz), analogicznie do istniejącej reguły „dokładnie jeden klucz typu”. Jawna zmiana kontraktu z testem.
- **Rekomendacja:** (b) w protocol hardening. Ciche gubienie części komunikatu jest gorsze niż jawne odrzucenie.

## Udokumentowane, bez potrzeby decyzji (FYI)

- **OBS-5 (fixture 06):** przywrócenie ukrytego elementu daje `card`. Hint zapamiętany w `lastHint` w czasie ukrycia nie jest stosowany. Ponowne przysłanie **tego samego** hintu po przywróceniu nic nie zmienia (P4); agent musi zmienić wartość. To zgodne z „przywrócenie należy do użytkownika” (P5). Rekomendacja: zostawić, doprecyzować P5 w ADR 0001.
- **OBS-6 (fixture 12):**
  - pola układu od agenta (`x`, `y`, `scale`, `z`) są ignorowane bez informacji zwrotnej (I3, zgodnie z ADR 0001);
  - `presentation: 'dismissed'` od agenta unieważnia **cały** element (fallback z `VALIDATION_FAILED` z warstwy UI), a nie tylko hint.

  Rekomendacja: zostawić ścisłą walidację wartości wyliczeniowych. Ostrzeganie agenta o ignorowanych polach układu to rola lintu lub adaptera, nie kernela.
- **Fixture 04:** `VALIDATION_FAILED` dla fallbacku wysyła warstwa UI (`validationReporting.ts`, instalowany przez `AiUiOverlay`), nie koordynator, więc replay go nie widzi. Od review #5 raport liczony jest ze stanu (raz na wystąpienie, niezależnie od zamontowanych widoków); pokrywa go `__tests__/validationReporting.test.tsx`.
- **Fixture 08:**
  - powtórzone `narration` z `speak` mówi ponownie. Dla różnych zdarzeń to poprawne; dla tego samego identyfikatora deduplikuje adapter;
  - powtórzone `updateDataModel` nie ma efektów;
  - powtórzone `createSurface` → `SURFACE_EXISTS` bez resetu (zgodnie z A1).
- **Fixture 09, 10:** stary przebieg i ruch po `done` są ignorowane zgodnie z I6; akcja po `done` → ostrzeżenie w konsoli.
