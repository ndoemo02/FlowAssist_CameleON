# Profil transportowy `flowassist-transport/1`

- **Status:** normatywny (P1.7b, 2026-10-07). Decyzje właściciela: D2, D3, D6, D7, D9–D20, H1, M1, M2, N1–N3 (rejestr w §16).
- **Zakres:** jak klient CameleON i agent wymieniają komunikaty A2UI i rozszerzenia aplikacji przez AG-UI.
  To trzecia oś zgodności z [ADR 0002](../adr/0002-protocol-compatibility-axes.md). Adapter P1.6 implementuje ten
  dokument i nie dodaje reguł w locie.
- **Słownik normatywny** (BCP 14: RFC 2119, RFC 8174):
  - **MUSI** = MUST;
  - **NIE WOLNO** = MUST NOT;
  - **POWINIEN** = SHOULD;
  - **MOŻE** = MAY.

**Role:**
- **klient** — CameleON: adapter transportu i store;
- **agent** — producent strumienia AG-UI, czyli backend albo proxy, które mówi tym profilem.

**Egzekwowanie** — przy każdej regule:
- **[kod]** — klient egzekwuje ją już dziś (plik w nawiasie);
- **[P1.6]** — klient będzie ją egzekwował od adaptera P1.6;
- **[agent]** — obowiązek agenta, którego klient nie zawsze może wykryć.

## 1. Źródła (przypięte, research 2026-10-06)

| Źródło | Wersja | Rola |
|---|---|---|
| AG-UI spec 1.0 | `ag-ui-protocol/ag-ui` @ `a30600791dcb`, `docs/spec/1.0/**`, `schema.json` | binding, lifecycle, model przetwarzania |
| `@ag-ui/core`, `@ag-ui/client` | 1.0.2 | klient AG-UI dla adaptera P1.6 |
| A2UI v0.9.1 | `google/A2UI` @ `0b22a7e`; capabilities zvendorowane @ `d6f6a62` (md5 zgodne z `main`) | koperta, capabilities |
| `@ag-ui/a2ui-middleware` | 0.0.12 | konwencja oceniona i **niewspierana** w profilu/1 (§4.6) |

Cytaty z AG-UI, na których opierają się reguły:
- **F1.** Od klienta płynie jeden komunikat na bieg (`RunAgentInput`). W trakcie biegu nie ma kanału od klienta.
- **F2.** Wynik biegu MUSI jechać w polach standardowych (`RUN_FINISHED.outcome`), nigdy tylko w nowym zdarzeniu.
- **F5.** Binding HTTP + SSE daje kolejne i kompletne dostarczanie. Nie ma wznawiania. Zerwanie bez zdarzenia terminalnego to ucięty bieg. Komentarze SSE (`: keep-alive`) producent MOŻE wysyłać z dowolną częstotliwością.
- **F7.** `CUSTOM` o nieznanej nazwie konsument ignoruje. NIE WOLNO przenosić w nim semantyki zdarzenia standardowego.
- **F8.** Brak deklaracji `AgentCapabilities` NIE MOŻE blokować biegu.
- **F11.** Nierozpoznany materiał przeżywa (potok usuwa nieznane pola i zdarzenia z ostrzeżeniem). Zniekształcona znana wartość jest fatalna.

## 2. Osie i wersje

- **2.1 Koperta A2UI (oś 1)** [kod: `contract.ts`]:
  - wejście `version` ∈ {`v0.9`, `v0.9.1`}, bo upstream `server_to_client.json` v0.9.1 przyjmuje oba;
  - wyjście zawsze `v0.9.1`;
  - **A2UI v1.0 (status upstream: Candidate) nie jest częścią profilu/1.** Koperta z inną wersją jest odrzucana (§11). v1.0 zmienia między innymi semantykę usuwania danych, więc jej obsługa to przyszły profil `flowassist-transport/2`.
- **2.2 Katalog (oś 2):**
  - `catalogId = flowassist/v2` to kontrakt komponentów. Nowy identyfikator pojawia się tylko przy zmianie tego kontraktu;
  - obsługiwane reprezentacje to **capabilities** (`flowassist.kinds`), a nie katalog (D2);
  - katalogów inline profil/1 nie wspiera (I10). `acceptsInlineCatalogs` agenta jest ignorowane.
- **2.3 Profil (oś 3):**
  - identyfikator `flowassist-transport/1`;
  - rozszerzenie `flowassist` jest **obowiązkowe** po obu stronach;
  - tryb bazowy A2UI bez rozszerzenia to przyszły, jawnie wybierany osobny profil, a nie fallback.
- **2.4 AG-UI** (D18): profil/1 działa na **AG-UI 1.x**, binding **HTTP + SSE**. Protobuf i inne bindingi są poza profilem.
  - Klient MUSI wysłać `RunAgentInput.protocolVersion = "1.0"` [P1.6].
  - `RUN_STARTED.protocolVersion` **żądanego biegu** MUSI pasować do `^1\.(0|[1-9][0-9]*)$` [agent; P1.6]. Brak pola albo inna wartość kończy przebieg `profile:AGUI_VERSION`, bo producent 0.x nie wyrazi wyniku `interrupt` (§6).
  - Biegów replayu (§4.7) ta kontrola nie dotyczy, bo historia może pochodzić sprzed wersjonowania.
  - Nowszy minor `1.x`: klient kontynuuje i ostrzega w konsoli.
  - **Świadomy wyjątek od AG-UI:** AG-UI każe przy deklaracji nieczytelnej albo nowszej kontynuować z ostrzeżeniem. Profil/1 przerywa przy braku deklaracji i przy innym majorze.

## 3. Handshake możliwości

Mechanizm z P1.7a [kod: `transport/capabilities.ts`, `transport/runPermission.ts`, ADR 0002 „Handshake możliwości”].

- **3.1** Capabilities klienta:
  - `{ a2uiClientCapabilities: { "v0.9": { supportedCatalogIds } }, flowassist: { profile, kinds } }`;
  - snapshot zamrożony raz na przebieg (`startScenario`);
  - transport go nie buduje, tylko dołącza do **każdego** biegu (§4.4).
- **3.2** Capabilities agenta (`ServerCapabilities`: `transportProfiles`, `a2uiServerCapabilities`, `flowassist.kinds`) **nie są** AG-UI `AgentCapabilities` i NIE WOLNO ich przenosić w `AgentCapabilities.custom`. Profil kończy negocjację błędem przy ich braku, a AG-UI zabrania blokowania biegu z powodu deklaracji (F8). To dwa różne dokumenty.
- **3.3 Źródło (D9):** statyczna konfiguracja adaptera, czyli obiekt `ServerCapabilities` przypisany do endpointu agenta [P1.6]. `negotiate()` waliduje go przy każdym `start` (schemat `server-capabilities.schema.json`).
- **3.4** Negocjacja:
  - kroki 0–5 w stałej kolejności; pierwsza porażka wygrywa;
  - porażka kończy przebieg statusem `error` `negotiation:<przyczyna>` przed pierwszym zdarzeniem i bez wywołania backendu;
  - zgoda na wysyłkę jest per przebieg [kod].
- **3.5** Wynik negocjacji to zobowiązanie agenta. Agent MUSI emitować tylko elementy, których `kind` jest w wynegocjowanym `kinds`, z niepustym przecięciem reprezentacji [agent].
  - Klient kontroluje to odbiorczo: P10 daje fallback z raportem, a `validateProps` łapie rodzaj spoza katalogu [kod].
  - Element rodzaju obsługiwanego przez klienta, ale niezadeklarowanego przez agenta, klient renderuje. To niezgodność agenta bez ryzyka renderowania, bez osobnej reakcji.

## 4. Wiązanie z AG-UI (D6, D10)

- **4.1 Tożsamość** [P1.6]:
  - jeden przebieg CameleON (od `start` do stanu terminalnego) to **jeden `threadId`**: UUID, nowy przy każdym `start` (P7);
  - każde wywołanie backendu (**invocation**) to **jeden bieg AG-UI** z nowym `runId` (UUID);
  - liczbowy `runId` CameleON nie trafia na drut. Adapter mapuje `runId` AG-UI na `runId` CameleON.
- **4.2 Biegi są sekwencyjne** [P1.6].
  - Następny bieg zaczyna się dopiero po **końcu invocation** poprzedniego: czysty koniec (§6.2) albo porzucenie po awarii transportu (§7.1).
  - Dwa biegi jednego przebiegu nigdy nie trwają równocześnie.
- **4.3 Rodzaje biegów:**
  - **start** — pierwszy bieg przebiegu;
  - **akcja** — odpowiedź na interrupt (§8);
  - **resync** — po awarii transportu (§7).
- **4.4 `RunAgentInput`** [P1.6] (schemat: `schemas/flowassist-transport-1/forwarded-props.schema.json`):

  | Pole | Reguła |
  |---|---|
  | `threadId`, `runId` | §4.1 |
  | `protocolVersion` | `"1.0"` |
  | `messages` | historia utrzymywana przez klienta AG-UI (wiadomości `activity` usunięte). Bieg startu: jedna wiadomość `user` z `prompt`, a bez niego z identyfikatorem scenariusza. Resync zastępujący niepotwierdzony start niesie **tę samą** wiadomość `user` (to samo `id`) |
  | `tools`, `context`, `state`, `parentRunId` | NIE WOLNO ich wysyłać. Profil/1 nie oferuje narzędzi frontendu, nie wstrzykuje katalogu (I10) i nie używa stanu współdzielonego |
  | `forwardedProps.flowassist` | `{ profile, capabilities, scenario?, resync?, a2uiErrors?, diagnostics? }` |
  | `resume` | w biegu akcji: odpowiedź na interrupt (§8.1). W biegu resync: wyłącznie porzucenie niepokrytego interruptu (§7.4) |

  Pola `forwardedProps.flowassist`:
  - `capabilities` — snapshot przebiegu, w **każdym** biegu;
  - `scenario` — w biegu startu oraz w biegu resync, który zastępuje niepotwierdzony start (§7.4);
  - `resync` — tylko w biegu resync;
  - `a2uiErrors` i `diagnostics` — według §11.4.
- **4.5 Ramka agent → klient** [agent; P1.6] (schemat `frame.schema.json`):
  ```json
  { "type": "CUSTOM", "name": "flowassist.frame",
    "value": { "profile": "flowassist-transport/1", "seq": 0, "message": { "version": "v0.9.1", "createSurface": { "surfaceId": "workspace", "catalogId": "flowassist/v2" } } } }
  ```
  - `value` jest zamknięte: tylko `profile`, `seq`, `message`.
  - `message` to **dokładnie jedna** wiadomość profilu: koperta A2UI (`createSurface` | `updateComponents` | `updateDataModel` | `deleteSurface`), `stage` albo `narration`.
  - Zdarzenie MOŻE nieść `subagentRunId`. Atrybucja nie zmienia reguł.
  - **Gdzie się waliduje:** klient sprawdza ramkę **po** potoku klienta AG-UI, który usuwa nieznane pola zdarzenia (F11). Dodatkowe pola zdarzenia nie przerywają więc biegu. Schemat ramki opisuje to, co agent MUSI emitować [agent], a zamknięte `value` i wiadomość sprawdza klient [P1.6].
- **4.6 Inne zdarzenia AG-UI** nie zmieniają stanu CameleON w profilu/1 [P1.6]:
  - `TEXT_MESSAGE_*`, `REASONING_*`, `TOOL_CALL_*`, `STATE_*`, `MESSAGES_SNAPSHOT`, `ACTIVITY_*`, `STEP_*`, `SUBAGENT_*`, `RAW`, `CUSTOM` o innej nazwie;
  - klient MOŻE je logować w dev;
  - wyjątek: `TOOL_CALL_*` liczy się do §6.1 (wywołania bez wyniku).

  Konwencja `@ag-ui/a2ui-middleware` (skumulowane `ACTIVITY_SNAPSHOT a2ui-surface` z `replace: true`) **nie jest wspierana**:
  - każda migawka ponawia `createSurface` (`SURFACE_EXISTS`, ADR 0005);
  - nie przenosi `stage`/`narration`;
  - wstrzykuje katalog do `context` (sprzeczne z I10).
- **4.7 Replay historii** [P1.6]: klient stosuje ramki, lifecycle i kontrolę wersji **wyłącznie z biegu, o który prosił** (`RUN_STARTED.runId` = `RunAgentInput.runId`). Biegi poprzedzające go w tym samym strumieniu pomija w całości, łącznie z ich spóźnionymi `RUN_ERROR` (§6.3).
- **4.8 Tożsamość biegu żądanego** (N3) [P1.6]. `agui:PROTOCOL_VIOLATION`, terminalnie i bez resync, gdy:
  - strumień zawierał biegi, ale żaden nie miał `RUN_STARTED.runId` = `RunAgentInput.runId` (AG-UI: bieg żądany powtarza `runId` wejścia), a odpowiedź skończyła się **czystym końcem body**.
    - Zerwanie połączenia przed `RUN_STARTED` biegu żądanego, np. w trakcie długiego replayu, pozostaje awarią transportu i prowadzi do resync (§7.1, D14);
  - po biegu żądanym pojawia się kolejny bieg.
    - To **reguła profilu, świadome zaostrzenie AG-UI**: AG-UI dopuszcza kolejny `RUN_STARTED` w tym samym strumieniu, ale w profilu/1 bieg żądany jest ostatni, bo klient nie ma czego stosować z biegów po nim;
  - `RUN_FINISHED` biegu żądanego ma inny `runId` niż jego `RUN_STARTED`;
  - zdarzenie brzegowe biegu żądanego ma `threadId` inny niż wejście.

## 5. Sekwencja ramek i deduplikacja (D6)

- **5.1 Zakres.** Licznik `seq` należy do **jednego biegu AG-UI**, czyli do jednego `RunAgentInput` (start, akcja, resync). Nie należy do przebiegu CameleON, wątku ani połączenia. Jeden licznik obejmuje wszystkie ramki biegu, także te z `subagentRunId` [agent].
- **5.2 Reset.**
  - Pierwsza ramka po `RUN_STARTED` żądanego biegu ma `seq = 0`, a każda kolejna `seq` poprzedniej + 1 (liczba całkowita ≤ 2^53 − 1) [agent; P1.6].
  - Każdy nowy bieg, w tym każda próba resync, zaczyna od `0`.
  - Ramek biegów replayu (§4.7) się nie liczy i nie stosuje.
- **5.3 Kontrola, a nie bufor.** Binding gwarantuje kolejność i kompletność (F5), więc klient niczego nie przestawia ani nie buforuje.
  - Ramka o `seq` innym niż oczekiwany (luka, cofnięcie, powtórzenie) jest **fatalna**: klient przerywa żądanie, a przebieg kończy się `error` `profile:FRAME_SEQUENCE` [P1.6].
  - Ramka poza jakimkolwiek otwartym biegiem to naruszenie AG-UI wykrywane przez potok klienta: `agui:PROTOCOL_VIOLATION`.
- **5.4 Ramka zniekształcona** (zły kształt `value`, nieznany klucz w `value`, `profile` inny niż wynegocjowany, `seq` niebędący liczbą całkowitą ≥ 0) jest fatalna: `profile:FRAME_INVALID` [P1.6]. Profil w każdej ramce działa jako echo negocjacji.
- **5.5 Deduplikacja.**
  - Tożsamością ramki jest para (`runId` AG-UI, `seq`), a ramka jest stosowana **najwyżej raz** [P1.6].
  - Powtórzenie klucza w biegu jest naruszeniem (§5.3), a nie cichym pominięciem.
  - Bieg już przetworzony, który pojawia się ponownie (replay), jest pomijany w całości (§4.7).
  - **Deduplikacji po treści nigdy nie ma** (ADR 0005): dwie identyczne wiadomości o różnych kluczach to dwa zdarzenia.
- **5.6 Bez ponownego dostarczenia.**
  - Ramek uciętego biegu nikt nie dosyła (F5). Ramki zastosowane przed ucięciem zostają.
  - Zgodność przywraca bieg resync (§7), którego treść jest idempotentna z konstrukcji: upsert komponentów, pełna wymiana danych, bez `createSurface` dla surface'ów klienta.

## 6. Lifecycle przebiegu (D10, D11)

- **6.1 Mapowanie.** Klient zapamiętuje wynik `RUN_FINISHED` żądanego biegu, a **status ustala dopiero na końcu invocation** (§6.2) [P1.6]:

  | Zdarzenie żądanego biegu | Status CameleON |
  |---|---|
  | `RUN_STARTED` | `running` (natychmiast) |
  | `RUN_FINISHED`, `outcome: interrupt` z **dokładnie jednym** interruptem `reason: "flowassist.awaiting_action"` | `awaiting_action` |
  | `RUN_FINISHED`, `outcome: interrupt` z innym zestawem | `error` `profile:UNSUPPORTED_INTERRUPTS` |
  | `RUN_FINISHED`, `outcome: success` albo brak `outcome` (także `outcome` nieznany, usunięty przez potok AG-UI) | `done` |
  | `RUN_FINISHED`, `success` z niepustym `pendingToolCallIds` **albo** z wywołaniem narzędzia (`TOOL_CALL_START`) w tym biegu bez `TOOL_CALL_RESULT` | `error` `profile:UNEXPECTED_TOOL_CALLS` (profil/1 nie oferuje narzędzi frontendu) |
  | `RUN_FINISHED`, `outcome: cancelled` | **`cancelled`**: nowy terminalny `RunStatus` (D11), w UI neutralny, bez alertu; AG-UI zabrania pokazania go jako sukcesu albo porażki |
  | `RUN_ERROR` przed końcem invocation (przed, w trakcie albo po `RUN_FINISHED`) | `error` `agent:<code ?? RUN_ERROR>: <message>`; **nigdy nie jest ponawiany automatycznie** (§7.1) |

- **6.2 Koniec invocation** (H1) [P1.6] następuje przy pierwszym z poniższych zdarzeń:
  - czysty koniec body odpowiedzi;
  - zerwanie połączenia **po** zdarzeniu terminalnym żądanego biegu;
  - upływ **5 s** (`terminalGraceMs`) od zdarzenia terminalnego żądanego biegu. Klient przerywa wtedy żądanie i traktuje je jak czysty koniec.

  Spóźniony `RUN_ERROR` przed końcem invocation wygrywa. `done` nigdy nie jest więc wysyłane wcześniej, a trwałość stanu terminalnego w store (I6) zostaje bez zmian.
- **6.3 Przypisanie `RUN_ERROR`** (zdarzenie nie niesie `runId`):
  - należy do **ostatniego biegu w strumieniu**, otwartego albo właśnie zamkniętego (spóźniony `RUN_ERROR`);
  - przed pierwszym `RUN_STARTED` należy do biegu żądanego;
  - `RUN_ERROR` przypisany do biegu replayu jest pomijany (§4.7).
- **6.4 Interrupt profilu** [agent] (schemat `interrupt.schema.json` opisuje obowiązek agenta):
  - `id` unikalny w biegu, `reason = "flowassist.awaiting_action"`;
  - **tożsamość decyzji** (N2): nowa logiczna decyzja MUSI dostać nowe `id` interruptu, a ponowne podniesienie tej samej nierozstrzygniętej decyzji (np. w resync) MOŻE zachować poprzednie. Klient wiąże z tym `id` akcję oczekującą (§8.3);
  - `message`, `toolCallId` i `responseSchema` klient ignoruje;
  - `expiresAt` NIE WOLNO wysyłać [agent]. **Klient go ignoruje** i nie odrzuca z tego powodu interruptu, bo klient profilu/1 nie ocenia wygaśnięcia.
- **6.5** Agent, który czeka na decyzję użytkownika, MUSI zakończyć bieg tym interruptem [agent]. AG-UI nie dopuszcza „sukcesu, który czeka” (F2).
- **6.6** Awaria transportu (§7.1) **nie** oznacza `done` ani `error`.

## 7. Awarie, połączenie, resync i `offline` (D14, H1, M2)

- **7.1 Klasyfikacja awarii według warstwy i przyczyny** (M2) [P1.6]. Klient nie zgaduje przyczyny z pozycji zdarzenia w strumieniu.

  | Klasa | Przypadki | Reakcja |
  |---|---|---|
  | **Awaria transportu** (jednoznaczna, wykryta przez adapter) | błąd sieci przed odpowiedzią (DNS, reset, brak sieci); brak nagłówków odpowiedzi w **30 s**; odpowiedź `408`, `429`, `502`, `503`, `504`; zerwanie połączenia w trakcie body przed zdarzeniem terminalnym żądanego biegu; **45 s bez żadnego ruchu SSE**; czysty koniec body bez zdarzenia terminalnego żądanego biegu, gdy strumień nie zawierał żadnego biegu albo zawierał bieg żądany (ucięty bieg, F5) | **resync** (§7.3–§7.4); status przebiegu bez zmian |
  | **Odrzucenie uprawnień** | `401`, `403` | `error` `transport:AUTH_REJECTED`, bez ponowień |
  | **Odrzucenie wejścia** | pozostałe `4xx` | `error` `transport:INPUT_REJECTED`, bez ponowień |
  | **Błąd serwera spoza listy przejściowej** | `500`, `501`, `505`–`599` | `error` `transport:SERVER_ERROR`, bez ponowień |
  | **Nieoczekiwana odpowiedź** | odpowiedź inna niż `200` z `Content-Type: text/event-stream` spoza wierszy wyżej (np. `204`, `3xx` po przekierowaniach, strona logowania sieci) | `error` `transport:UNEXPECTED_RESPONSE`, bez ponowień |
  | **Naruszenie profilu / protokołu** | `profile:*` (§5, §2.4, §6.1, §10.8), `agui:PROTOCOL_VIOLATION`, w tym **nieprawidłowy albo brakujący wymagany `runId`** (N3, §4.8) | `error`, bez ponowień i bez resync |
  | **Błąd agenta** | `RUN_ERROR` w dowolnym miejscu biegu żądanego, także jako pierwsze zdarzenie | `error` `agent:*`, bez ponowień |

  - Awarię transportu wykrytą przez siebie adapter kieruje **bezpośrednio do ścieżki resync**. NIE WOLNO mu syntetyzować `RUN_ERROR`, `RUN_FINISHED` ani statusu `agent:*`.
  - **Tylko** awaria transportu jest ponawiana automatycznie. Sieć nigdy nie daje terminalnego `error` (D14), a wszystkie pozostałe klasy są terminalne.
- **7.2 Ruch i limity czasu** (H1) [agent; P1.6]:
  - agent MUSI wysyłać w otwartej odpowiedzi co najmniej jedną linię SSE (zdarzenie albo komentarz `: keep-alive`) **co ≤ 15 s** (`keepAliveMaxIntervalMs`);
  - **ruchem** jest każda poprawna, kompletna linia SSE: pole `data`, inne pole albo komentarz `:`. Każda zeruje licznik ciszy;
  - **45 s bez ruchu** (`idleTimeoutMs`) przed zdarzeniem terminalnym żądanego biegu to zerwanie, czyli awaria transportu;
  - **30 s bez nagłówków odpowiedzi** (`headersTimeoutMs`) od wysłania żądania to awaria transportu;
  - po zdarzeniu terminalnym obowiązuje §6.2 (5 s).
- **7.3 Stan połączenia i próby** (D14) [P1.6]:
  - stan połączenia (`connected` | `reconnecting` | `offline`) to oś **niezależna** od `RunStatus`;
  - awaria transportu daje `reconnecting` i uruchamia **serię** maksymalnie 3 prób resync;
  - kolejne próby startują po 1 s, 2 s i 4 s od awarii albo od nieudanej poprzedniej próby. Przy `429` i `503` z nagłówkiem `Retry-After` opóźnienie wynosi max(harmonogram, `Retry-After`), ale nie więcej niż 60 s (`retryAfterMaxMs`);
  - `RUN_STARTED` biegu resync przywraca `connected`;
  - **próba jest udana dopiero na końcu invocation** biegu resync (§6.2). Wtedy licznik prób się zeruje. Awaria transportu po `RUN_STARTED`, ale przed końcem invocation, to nieudana próba tej samej serii;
  - **po 3 nieudanych próbach** połączenie przechodzi w `offline`, a **przebieg zostaje wznawialny**: status logiczny (`running` / `awaiting_action`) się nie zmienia;
  - inna niż transportowa porażka próby (§7.1) kończy przebieg zgodnie ze swoją klasą;
  - wznowienie z `offline` to nowa seria, uruchamiana jawnie przez użytkownika (kontrolka „Połącz ponownie”, `reconnect()` transportu, D20) albo raz przez zdarzenie przeglądarki `online`;
  - przebieg w `offline` kończy tylko użytkownik (`stop`, restart) albo agent po wznowieniu. `stop()` przerywa żądanie i serię prób.
- **7.4 Bieg resync** [P1.6]:
  - ten sam `threadId`, nowy `runId`;
  - `forwardedProps.flowassist.resync = { surfaces: [<surfaceId trzymane przez klienta>] }`;
  - **start niepotwierdzony** (przebieg nie widział jeszcze żadnego `RUN_STARTED`): resync zastępuje start. Niesie `scenario`, `surfaces: []` i tę samą wiadomość `user` co start (§4.4);
  - akcji nie niesie nigdy (§8.4);
  - `resume`: jeśli klient trzyma otwarty interrupt, którego nie pokrył żaden bieg potwierdzony `RUN_STARTED` (typowo invocation akcji padła przed `RUN_STARTED`), resync **MUSI** go pokryć wpisem `{ interruptId, status: "cancelled" }` bez `payload`.
    - To porzucenie wymagane regułą pokrycia AG-UI (konsument nie może po cichu pominąć otwartego interruptu), a nie ponowienie akcji (zatwierdzone przez właściciela).
    - Bieg akcji, który dostał `RUN_STARTED`, pokrył interrupt, więc po jego awarii klient nie trzyma otwartego interruptu i `resume` jest nieobecne;
  - niesie raporty i diagnostykę według §11.4.
- **7.5 Obowiązek agenta w biegu resync** [agent]:
  - ramkami odtwarza **pełny bieżący stan**:
    - dla każdego swojego surface'u, który klient trzyma: `updateComponents` ze wszystkimi komponentami, a potem `updateDataModel` bez `path` (całość);
    - dla swojego surface'u, którego klient nie trzyma: `createSurface` + to samo;
    - dla surface'u trzymanego przez klienta, którego agent już nie ma: `deleteSurface`;
    - potem `stage` (bieżące) i `narration` (bieżący tekst albo `null`, `speak: false`);
  - **trwająca praca:** jeśli osierocony bieg (po zerwaniu) nadal pracuje, resync go **przejmuje**. Po odtworzeniu stanu strumieniuje dalszą pracę i kończy się jej **faktycznym** wynikiem. NIE WOLNO mu kończyć się `success`, gdy praca trwa. Na wątku jest najwyżej jeden aktywny bieg agenta;
  - bez trwającej pracy kończy bieżącym wynikiem lifecycle (§6). Otwarty interrupt podnosi ponownie;
  - wpis `resume` ze `status: "cancelled"` dla interruptu `flowassist.awaiting_action` oznacza „decyzja nie zapadła”, a nie odrzucenie decyzji. Agent NIE MOŻE z tego powodu ani z powodu niepokrytego interruptu odrzucić wejścia resync (`4xx` ani `RUN_ERROR`), ani uznać decyzji za podjętą. MUSI ponownie podnieść interrupt, jeśli nadal czeka;
  - wpis dotyczący interruptu, którego agent już nie ma (akcja jednak dotarła), to w AG-UI „nierozpoznany wpis”: agent kontynuuje i ostrzega;
  - resync ze `scenario` dla wątku, którego agent nie zna (start nie dotarł), traktuje jak bieg startu tego scenariusza. Dla znanego wątku `scenario` ignoruje i odtwarza stan.
- **7.6** Resync **nie resetuje układu**: dla trzymanych surface'ów nie ma `deleteSurface`, a członkostwo wynika z `children` (P6). Komponenty, które agent porzucił, zostają w mapie, ale nie są członkami.

## 8. Akcje semantyczne (I9, D12, M1)

- **8.1** Akcja to **nowy bieg AG-UI**, który odpowiada na otwarty interrupt [P1.6]. Przykład wejścia biegu akcji (fragment `RunAgentInput`):
  ```json
  { "resume": [{ "interruptId": "int-1", "status": "resolved",
                 "payload": { "version": "v0.9.1", "action": { "name": "approve", "surfaceId": "hud", "sourceComponentId": "approval", "timestamp": "2026-10-07T10:00:00.000Z", "context": { "itemId": "c1", "workspace": { "screen": null, "focus": null, "dismissed": [] } } } } }] }
  ```
  - `payload` jest dokładnie kopertą klient → agent A2UI (`client_to_server.json` upstream);
  - `context` to kontekst podany przez wywołującego, np. `itemId` [kod: `ScreenLayer.tsx`, `WorkspaceLayer.tsx`]. Do niego klient dokłada `workspace` = migawkę układu **bez współrzędnych** [kod: `store.ts: sendAction`].
- **8.2** Tożsamością akcji jest `runId` invocation, która ją niesie. **Potwierdzeniem** przyjęcia jest `RUN_STARTED` tego biegu. Osobnego identyfikatora akcji nie ma.
- **8.3 Jedno miejsce na akcję** (D12 + M1 + N1 + N2, decyzje właściciela) [P1.6].
  - **Bieżący interrupt** to interrupt z ostatniego wyniku `awaiting_action`, którego nie pokryła jeszcze żadna invocation potwierdzona `RUN_STARTED`.
    - Bieg akcji z `RUN_STARTED` go pokrywa; resync go porzuca (§7.4).
    - Brak takiego interruptu oznacza „brak bieżącego interruptu”.
  - Przebieg ma **jedno** miejsce na akcję. Zajmuje je:
    - **akcja w locie** — od przyjęcia przez klienta do **końca invocation**, która ją niesie: czysty koniec (§6.2) albo porzucenie po awarii transportu (§7.1, akcja staje się niepewna, §8.4);
    - **albo akcja oczekująca** z zapamiętanym oczekiwanym interruptem (`expectedInterruptId`).

  Zasady:
  - **W trakcie aktywnej invocation (start, akcja, resync) oraz w `reconnecting` / `offline` klient niczego nie wysyła** (N1, §4.2).
    - Akcja może wtedy jedynie zająć miejsce jako akcja oczekująca, jeśli miejsce jest wolne **i** klient ma bieżący interrupt. Klient zapamiętuje wtedy `expectedInterruptId` = id bieżącego interruptu.
    - W każdym innym przypadku akcja jest **odrzucana lokalnie** z komunikatem.
  - Akcja w `awaiting_action`, gdy **żadna invocation nie trwa**, połączenie jest `connected`, miejsce wolne, a klient ma bieżący interrupt, jest wysyłana od razu jako bieg akcji odpowiadający na ten interrupt (akcja w locie).
  - Każda akcja, gdy miejsce jest zajęte (w locie albo oczekująca), jest **odrzucana lokalnie** z komunikatem dla użytkownika. Nie zastępuje akcji w miejscu i nie trafia do żadnej kolejki (podwójny klik nie zatwierdzi kolejnej decyzji).
  - Akcja oczekująca jest rozpatrywana **dopiero po końcu invocation** (§6.2) z wynikiem `awaiting_action`. Wtedy klient sprawdza **wszystkie** warunki:
    - interrupt z tego wyniku ma `id` równe `expectedInterruptId`;
    - surface `surfaceId` istnieje, a komponent `sourceComponentId` istnieje na tym surface;
    - jeśli `context.itemId` jest podany, element jest nadal członkiem `Workspace.children` z **tą samą tożsamością wpisu układu** (`instance` z `layout.ts`, P6: ponowne dodanie = nowy wpis = nowa tożsamość).
      - `rev` się **nie** liczy. Rośnie przy zmianach spoza gestu, także niezwiązanych z decyzją (przeliczenie siatki po dodaniu innego elementu, hint agenta, zrzucenie z focusu albo ekranu, `layout.ts`), więc dawałby fałszywe porzucenia;
      - odcisku propsów nie ma (decyzja właściciela).

    Zgodność oznacza nowy bieg akcji (akcja w locie). Niezgodność dowolnego warunku oznacza **porzucenie z lokalnym komunikatem**, bez wysyłki.
  - Po wyniku innym niż `awaiting_action` (`done`, `error`, `cancelled`) albo po `stop` akcja oczekująca przepada z komunikatem.
- **8.4 Brak replay** [P1.6]: profil/1 nie klasyfikuje idempotencji, więc każda akcja jest nieidempotentna, a **wysłana** akcja nigdy nie jest ponawiana automatycznie.
  - Akcja jest „wysłana” od chwili wysłania żądania HTTP z jej `resume`.
  - Awaria transportu po tej chwili, a przed potwierdzeniem (`RUN_STARTED`) albo przed końcem invocation, czyni akcję **niepewną**: mogła dotrzeć. Klient:
    - nie wysyła jej drugi raz;
    - ogłasza „akcja mogła nie dotrzeć”;
    - zwalnia miejsce (§8.3);
    - przechodzi do resync, który akcji nie niesie.

    Jeśli invocation nie dostała `RUN_STARTED`, resync porzuca jej interrupt wpisem `cancelled` (§7.4), a agent podnosi decyzję ponownie (§7.5).
  - Odtworzony stan pokazuje skutek, a użytkownik może kliknąć ponownie.
  - Oczekująca akcja (§8.3) nie była wysłana, więc jej późniejsze wysłanie nie jest ponowieniem.

## 9. `stage` i `narration`

- **9.1** Należą do profilu, a nie do katalogu:
  - obowiązują niezależnie od `catalogId`;
  - nie mają `version` ani `surfaceId`;
  - jadą tym samym kanałem ramek i w tej samej kolejności `seq` co koperty A2UI.
- **9.2** `narration` to **dyrektywa prezentacji**: podpis i TTS w HUD, a nie wiadomość rozmowy.
  - Klient nie zapisuje jej w historii, a agent nie wznawia z niej rozmowy.
  - Agent, który chce mieć wypowiedź w historii wątku, emituje ją **dodatkowo** jako standardowe `TEXT_MESSAGE_*`, które profil/1 ignoruje (§4.6).
  - `CUSTOM` nie przenosi więc wyłącznie semantyki zdarzenia standardowego (F7).
- **9.3 Obiekty zamknięte** (D17) [P1.6; dziś częściowo]:
  - `stage`: tylko `focus` (`front` | `back`) i `drawer` (`open` | `closed`), co najmniej jedno [kod];
  - `narration`: tylko `text` (string | `null`) i `speak` (boolean, opcjonalne). Dziś nieznane klucze przechodzą [P1.6];
  - nieznane pole odrzuca wiadomość z raportem (§11).

## 10. Reguły danych

- **10.1 Obiekty zamknięte A2UI** (D17) [P1.6] (schemat `message.schema.json`):
  - koperta zawiera tylko `version` i jeden payload;
  - treść payloadu zawiera tylko pola schematu upstream v0.9.1 (`additionalProperties: false`). Dziś nieznane pola są ignorowane;
  - `createSurface.theme` i `createSurface.sendDataModel` są dozwolone kształtem upstream, ale klient je ignoruje (I10; `sendDataModel` jest poza profilem/1);
  - propsy komponentów zostają otwarte jak dziś (I3, OBS-6).
- **10.2 Atomowość.**
  - Błąd wykryty na granicy albo przy stosowaniu koperty odrzuca **całą** wiadomość, także `updateComponents`, gdy zła jest jedna pozycja (jak OBS-4, bez częściowej konsumpcji) [kod + P1.6]. Do takich błędów należą: kształt koperty, `id`/`children`, limity, klucze zarezerwowane, wersja oraz §10.4–10.7.
  - Błąd semantyczny propsów po przyjęciu daje fallback **elementu** z raportem [kod: `validationReporting.ts`].
- **10.3 Binding** to wartość propsa **najwyższego poziomu**: obiekt z dokładnie jednym własnym kluczem `path` typu string [kod: `contract.ts: isBinding`]. `{path}` zagnieżdżony głębiej to **dana**.
- **10.4 Q1** [P1.6]: binding w propsie spoza `CATALOG_PROPS[component]` [kod: `catalog.ts`] odrzuca kopertę z `VALIDATION_FAILED` `/updateComponents/components/{id}/{prop}`.
  - Kernelowa ścieżka ST-1(b) („binding poza katalogiem wstrzymuje gotowość”) zostaje dla `devDispatch`, ale z transportu jest nieosiągalna.
- **10.5 ST-4 (a)** [P1.6]: binding w `WorkspaceItem.presentation` albo `WorkspaceItem.priority` (`literalOnlyProps`) odrzuca kopertę z raportem jak w §10.4. Układ czyta te pola tylko dosłownie (ADR 0007).
- **10.6 Identyfikatory** (D19) [P1.6]:
  - `id` komponentu i wpisy `children` NIE MOGĄ zawierać `/` ani `~`. Segmenty ścieżek raportów (§11.3) nie wymagają wtedy escapowania RFC 6901;
  - nazwy zarezerwowane `__proto__`, `constructor`, `prototype` są zakazane jako `id`, wpis `children` i segment ścieżki [kod: FU-4].
- **10.7 Tablice w `updateDataModel.path`** (D16, ADR 0002 „Otwarte” 4) [P1.6; dziś: `jsonPointer.ts: setAt` dopisuje, tworzy dziury i robi `splice`]:
  - zapis pod indeksem `< długość` zastępuje, a `= długość` dopisuje (jak `add` w RFC 6902);
  - **`> długość` odrzuca kopertę** z `VALIDATION_FAILED` `/updateDataModel/path`, bo dziur nie da się wyrazić w JSON. Wykrywa to stosowanie koperty w reducerze, więc raport wymaga efektu raportu z reducera (zmiana kernela w zakresie D16, za zgodą przy commicie P1.6);
  - usunięcie (brak `value`) elementu tablicy **zachowuje długość**, a element staje się `undefined` (A2UI v0.9.1). Walidatory treści traktują `undefined` jak brak wartości (fallback z raportem);
  - reguła dotyczy też segmentów pośrednich. Indeksy kanoniczne bez zmian (ADR 0002), klucze obiektów bez zmian.
- **10.8 Limity** (D15):
  - ścieżka `updateDataModel`: ≤ 512 punktów kodowych i ≤ 32 segmenty [kod: FU-3];
  - **zdarzenie AG-UI** (bajty UTF-8 pola `data` jednej ramki SSE, mierzone **przed** `JSON.parse` we własnej warstwie strumienia adaptera) ≤ **1 MiB**. Przekroczenie jest fatalne: `profile:EVENT_TOO_LARGE` [P1.6];
  - **wiadomość profilu** (`JSON.stringify(frame.message)`, bajty UTF-8) ≤ **256 KiB**. Przekroczenie odrzuca wiadomość z diagnostyką `MESSAGE_TOO_LARGE`; `seq` liczy się dalej [P1.6].
- **10.9 Świeżość danych** [P1.6]:
  - klient przekazuje do `transportDispatch` wynik **round-tripu JSON** pola `frame.message`;
  - nigdy nie przekazuje obiektu dzielonego z potokiem klienta AG-UI, nie zatrzymuje referencji i nie mutuje.

  To spełnia założenie guarda FU-4 (ADR 0002: guard sprawdza migawkę, a store trzyma referencje).
- **10.10 Klucze zarezerwowane w danych** [kod: FU-4]: własny klucz `__proto__`, `constructor` albo `prototype` **gdziekolwiek** w wiadomości, także w legalnych danych (nazwa kolumny, klucz mapy), odrzuca całą wiadomość. Agent MUSI zmieniać nazwy takich kluczy [agent].

## 11. Raportowanie (D7, D13)

- **11.1 Dwie klasy** (oba warianty A2UI `error` wymagają `surfaceId`):
  - **raport A2UI** `{ version: "v0.9.1", error }` (schemat upstream) — tylko gdy surface jest znany i poprawny (`surfaceId` ∈ `workspace` | `tasks-drawer` | `hud`);
  - **diagnostyka profilu** `{ code, message, frame?: { runId, seq }, path? }` (schemat `diagnostic.schema.json`) — wszystko bez surface'u.
- **11.2 Zamknięte listy kodów:**
  - raport A2UI:
    - `VALIDATION_FAILED` (upstream);
    - `SURFACE_EXISTS`, `SURFACE_NOT_FOUND` [kod: `reducer.ts`];
  - diagnostyka:
    - `ENVELOPE_REJECTED` (koperta odrzucona, surface nieustalony);
    - `STAGE_REJECTED`;
    - `NARRATION_REJECTED`;
    - `MESSAGE_TOO_LARGE`;
  - status `error` przebiegu (format `<przestrzeń>:<KOD>[: szczegół]`):
    - `negotiation:<przyczyna>` [kod];
    - `profile:FRAME_INVALID`, `profile:FRAME_SEQUENCE`, `profile:EVENT_TOO_LARGE`, `profile:AGUI_VERSION`, `profile:UNSUPPORTED_INTERRUPTS`, `profile:UNEXPECTED_TOOL_CALLS`;
    - `agui:PROTOCOL_VIOLATION`;
    - `agent:<kod>`;
    - `transport:AUTH_REJECTED`, `transport:INPUT_REJECTED`, `transport:SERVER_ERROR`, `transport:UNEXPECTED_RESPONSE`.

  Awaria transportu (§7.1) nie kończy przebiegu, więc kodów błędu sieciowego nie ma. Mock P1.6 zgłasza nieznany scenariusz jako `agent:UNKNOWN_SCENARIO` (dziś: tekst poza listą, `mockTransport.ts`).
- **11.3 `path`** to wskaźnik JSON (RFC 6901) z segmentami opartymi na `id`, nigdy na indeksie. Rodzinę wyznacza pierwszy segment:
  - **wiadomość odrzucona na granicy albo przy stosowaniu koperty** — klucz payloadu: `/version`, `/createSurface/catalogId`, `/updateComponents/components/{id}/children`, `/updateDataModel/path`, `/updateDataModel/value/{klucz}…`;
  - **problem stanu po przyjęciu** — `/components/{id}{wskaźnik propsa}` [kod: `workspace.ts`, `resolveTree.ts`].

  Gdy segmentu nie da się wyrazić przez `id` (komponent bez poprawnego `id`, element tablicy w danych), ścieżka **kończy się na kolekcji**, czyli bez indeksu: `/updateComponents/components`, `/updateDataModel/value/rows`.
- **11.4 Dostarczenie** (D13) [P1.6]:
  - raporty i diagnostyka **nie uruchamiają biegu**. Klient zbiera je i dołącza do **następnego** biegu (akcji albo resync) w `forwardedProps.flowassist.a2uiErrors` i `diagnostics`;
  - limit łącznie 32 pozycje; najstarsze odpadają z ostrzeżeniem w konsoli;
  - pozycje potwierdza `RUN_STARTED` biegu, który je niósł;
  - po stanie terminalnym przebiegu niewysłane pozycje przepadają;
  - deduplikacja raportów renderera „raz na wystąpienie” [kod: `validationReporting.ts`] się nie zmienia.
- **11.5 Wariant diagnostyczny `parseEvent`** (D7) [kod: `contract.ts: parseEventDiagnostic`, `PARSE_REASONS`; test `parseDiagnostic.test.ts`]:
  - `parseEventDiagnostic(raw)` zwraca `{ ok: true, event }` albo `{ ok: false, reason, path, surfaceId? }`;
  - `parseEvent` pozostaje opakowaniem o identycznym zachowaniu (ślady replay bez zmian).

  Zamknięta lista przyczyn dzisiejszych gałęzi odrzucenia i ich mapowanie na raport:

  | Przyczyna | Raport |
  |---|---|
  | `NOT_OBJECT`, `PAYLOAD_COUNT` | `ENVELOPE_REJECTED` |
  | `RESERVED_KEY` | `VALIDATION_FAILED` ze ścieżką do klucza (§11.3), gdy surface znany; w przeciwnym razie `ENVELOPE_` / `STAGE_` / `NARRATION_REJECTED` według rodzaju wiadomości |
  | `STAGE_INVALID` | `STAGE_REJECTED` |
  | `NARRATION_INVALID` | `NARRATION_REJECTED` |
  | `VERSION_UNSUPPORTED` | `VALIDATION_FAILED` `/version`, gdy surface znany; w przeciwnym razie `ENVELOPE_REJECTED` |
  | `SURFACE_UNKNOWN` | `ENVELOPE_REJECTED` (`path` `/<payload>/surfaceId`) |
  | `CATALOG_MISMATCH` | `VALIDATION_FAILED` `/createSurface/catalogId` |
  | `COMPONENT_INVALID` | `VALIDATION_FAILED` `/updateComponents/components/{id}…` albo `/updateComponents/components` |
  | `PATH_INVALID`, `PATH_LIMIT` | `VALIDATION_FAILED` `/updateDataModel/path` |

  P1.6 dodaje przyczyny nowych kontroli: `UNKNOWN_FIELD` (§9.3, §10.1), `ID_INVALID` (§10.6), `BINDING_NOT_ALLOWED` (§10.4, §10.5). Raport dla `> długość` (§10.7) powstaje w reducerze.

## 12. Model zagrożeń transportu (podsumowanie)

Dane od agenta są niezaufane. Granica protokołu [kod: `parseEvent`] i walidatory katalogu [kod: `catalog.ts`] obowiązują dla każdej ścieżki wejścia.
- Adapter dodaje:
  - limity bajtów i czasu (§10.8, §7.2);
  - świeżość (§10.9);
  - kontrolę ramek (§5);
  - reguły danych (§10.4–10.7).
- Nic wykonywalnego od agenta (I10).
- `RAW` i `CUSTOM` o innej nazwie nie mają wpływu na stan.

## 13. Obowiązki agenta (lista kontrolna)

1. Deklaruje `ServerCapabilities` profilu/1 w konfiguracji klienta (§3.3) i emituje tylko wynegocjowane rodzaje i reprezentacje (§3.5).
2. W `RUN_STARTED` deklaruje `protocolVersion` `1.x` (§2.4).
3. Każdą wiadomość profilu wysyła jako `CUSTOM flowassist.frame` z `profile` i ciągłym `seq` od `0` w każdym biegu (§4.5, §5).
4. W otwartej odpowiedzi wysyła ruch SSE (zdarzenie albo `: keep-alive`) co ≤ 15 s i zamyka body zaraz po zdarzeniu terminalnym (§7.2, §6.2).
5. Czekając na użytkownika, kończy bieg interruptem `flowassist.awaiting_action`. Zawsze dokładnie jednym, bez `expiresAt`. Nowa decyzja dostaje nowe `id` interruptu (§6.4).
6. Kończy przebieg wynikiem `success`, a przerwanie z własnej woli zgłasza wynikiem `cancelled`. Nie wywołuje narzędzi frontendu (§6.1).
7. Akcję czyta z `resume[0].payload` (koperta A2UI `action`) i nie zakłada jej ponowienia (§8).
8. W biegu resync (§7.5):
   - odtwarza pełny stan bez `createSurface` dla surface'ów klienta;
   - przejmuje trwającą pracę i kończy ją faktycznym wynikiem;
   - porzucony interrupt traktuje jako „decyzja nie zapadła” i podnosi go ponownie, bez odrzucania wejścia;
   - resync ze `scenario` dla nieznanego wątku traktuje jak start.
9. Nie używa katalogów inline, `context`, `tools` ani `state`. `id` nie zawiera `/` ani `~`, a dane nie zawierają kluczy zarezerwowanych (§10).
10. `narration` traktuje jako dyrektywę prezentacji. Wypowiedź do historii emituje dodatkowo jako `TEXT_MESSAGE_*` (§9.2).
11. Czyta raporty klienta z `forwardedProps.flowassist.a2uiErrors` i `diagnostics` (§11.4).

## 14. Macierz pokrycia (reakcja klienta)

| Wejście | Reakcja | Status CameleON | Połączenie | Raport | § |
|---|---|---|---|---|---|
| `start`, negocjacja nieudana | brak żądania HTTP | `error` `negotiation:*` | — | — | 3.4 |
| awaria transportu dowolnej invocation (sieć, 30 s bez nagłówków, `408`, `429`, `502`–`504`, zerwanie, 45 s ciszy, koniec bez zdarzenia terminalnego) | resync (start niepotwierdzony: ze `scenario`) | bez zmian | `reconnecting` | — | 7.1, 7.3, 7.4 |
| `401` / `403` | — | `error` `transport:AUTH_REJECTED` | — | — | 7.1 |
| inne `4xx` | — | `error` `transport:INPUT_REJECTED` | — | — | 7.1 |
| `500`, `501`, `505`–`599` | — | `error` `transport:SERVER_ERROR` | — | — | 7.1 |
| odpowiedź inna niż `200` + SSE (`204`, `3xx`, strona logowania sieci) | — | `error` `transport:UNEXPECTED_RESPONSE` | — | — | 7.1 |
| `429` / `503` z `Retry-After` | następna próba po max(harmonogram, `Retry-After` ≤ 60 s) | bez zmian | `reconnecting` | — | 7.3 |
| resync, gdy klient trzyma niepokryty interrupt (invocation akcji padła przed `RUN_STARTED`) | `resume` z wpisem `cancelled` bez `payload` | bez zmian | `reconnecting` | — | 7.4, 7.5 |
| `RUN_STARTED` żądanego biegu, `protocolVersion` `1.x` | potwierdza akcję i raporty | `running` | `connected` | — | 6.1, 8.2, 11.4 |
| `RUN_STARTED` żądanego biegu bez wersji / inny major | przerwanie | `error` `profile:AGUI_VERSION` | — | — | 2.4 |
| czysty koniec body, biegi w strumieniu, ale żaden z żądanym `runId` | bez resync | `error` `agui:PROTOCOL_VIOLATION` | — | — | 4.8, 7.1 |
| w trakcie strumienia: bieg po żądanym (zaostrzenie profilu); niezgodny `runId` / `threadId` biegu żądanego | przerwanie, bez resync | `error` `agui:PROTOCOL_VIOLATION` | — | — | 4.8, 7.1 |
| zerwanie połączenia przed `RUN_STARTED` biegu żądanego (np. w trakcie replayu) | resync | bez zmian | `reconnecting` | — | 4.8, 7.1 |
| biegi replayu (inny `runId`), także ich spóźnione `RUN_ERROR` i brak wersji | pominięte w całości | — | — | — | 4.7, 6.3 |
| `CUSTOM flowassist.frame` poprawna | round-trip → `transportDispatch` | — | — | — | 4.5, 10.9 |
| ramka: zły kształt / profil / typ `seq` / nieznany klucz w `value` | przerwanie | `error` `profile:FRAME_INVALID` | — | — | 5.4 |
| ramka: luka / cofnięcie / powtórzenie `seq` | przerwanie | `error` `profile:FRAME_SEQUENCE` | — | — | 5.3 |
| ramka poza otwartym biegiem | przerwanie (potok AG-UI) | `error` `agui:PROTOCOL_VIOLATION` | — | — | 5.3 |
| dodatkowe pole zdarzenia AG-UI | usunięte przez potok AG-UI z ostrzeżeniem | — | — | — | 4.5, F11 |
| wiadomość > 256 KiB | pominięta | — | — | `MESSAGE_TOO_LARGE` | 10.8 |
| zdarzenie > 1 MiB | przerwanie | `error` `profile:EVENT_TOO_LARGE` | — | — | 10.8 |
| wiadomość odrzucona, surface znany | pominięta | — | — | `VALIDATION_FAILED` | 11 |
| wiadomość odrzucona, surface nieznany / `stage` / `narration` | pominięta | — | — | `ENVELOPE_` / `STAGE_` / `NARRATION_REJECTED` | 11 |
| nieznane pole w kopercie / payloadzie / `stage` / `narration` | wiadomość pominięta | — | — | jak wyżej | 9.3, 10.1 |
| klucz zarezerwowany, `/` lub `~` w `id` | wiadomość pominięta | — | — | jak wyżej | 10.6, 10.10 |
| binding poza `CATALOG_PROPS` / w `presentation`, `priority` | koperta pominięta | — | — | `VALIDATION_FAILED` | 10.4, 10.5 |
| `updateDataModel`: indeks > długość | koperta pominięta | — | — | `VALIDATION_FAILED` `/updateDataModel/path` | 10.7 |
| `createSurface` istniejącego / operacja na nieistniejącym | reducer | — | — | `SURFACE_EXISTS` / `SURFACE_NOT_FOUND` | 11.2 |
| inne zdarzenia AG-UI (`TEXT_*`, `STATE_*`, `ACTIVITY_*`, `STEP_*`, `SUBAGENT_*`, `REASONING_*`, `MESSAGES_SNAPSHOT`, `RAW`, inny `CUSTOM`) | ignorowane (log dev) | — | — | — | 4.6 |
| `TOOL_CALL_*` | ignorowane, liczone do §6.1 | — | — | — | 4.6, 6.1 |
| nieznany typ zdarzenia | potok AG-UI odrzuca z ostrzeżeniem | — | — | — | F11 |
| naruszenie AG-UI | przerwanie | `error` `agui:PROTOCOL_VIOLATION` | — | — | F11 |
| `RUN_FINISHED` interrupt `flowassist.awaiting_action` ×1 | ustal na końcu invocation | `awaiting_action` | — | — | 6.1, 6.2 |
| `RUN_FINISHED` interrupt — inny zestaw | — | `error` `profile:UNSUPPORTED_INTERRUPTS` | — | — | 6.1 |
| interrupt z `expiresAt` | pole ignorowane | jak wyżej | — | — | 6.4 |
| `RUN_FINISHED` success / brak / nieznany `outcome` | ustal na końcu invocation | `done` | — | — | 6.1 |
| `RUN_FINISHED` success + `pendingToolCallIds` albo wywołanie narzędzia bez wyniku | — | `error` `profile:UNEXPECTED_TOOL_CALLS` | — | — | 6.1 |
| `RUN_FINISHED` cancelled | — | `cancelled` | — | — | 6.1 |
| `RUN_ERROR` żądanego biegu (pierwsze zdarzenie, w trakcie, spóźniony) | bez ponowień | `error` `agent:*` | — | — | 6.1, 6.3, 7.1 |
| body otwarte > 5 s po zdarzeniu terminalnym | przerwanie, czysty koniec | wg zapamiętanego wyniku | — | — | 6.2 |
| zerwanie po zdarzeniu terminalnym | czysty koniec | wg zapamiętanego wyniku | — | — | 6.2 |
| awaria transportu po `RUN_STARTED` resync, przed końcem invocation | nieudana próba tej samej serii | bez zmian | `reconnecting` | — | 7.3 |
| 3 nieudane próby | koniec serii | bez zmian (wznawialny) | `offline` | — | 7.3 |
| `offline` + „Połącz ponownie” / zdarzenie `online` | nowa seria resync | bez zmian | `reconnecting` | — | 7.3 |
| `stop()` | przerwanie; akcja w miejscu i raporty przepadają | `idle` | — | — | 7.3, 8.3 |
| akcja w `awaiting_action`, żadna invocation nie trwa, `connected`, miejsce wolne, jest bieżący interrupt | bieg akcji z `resume` (akcja w locie) | `running` po `RUN_STARTED` | — | — | 8.1, 8.3 |
| akcja w trakcie dowolnej invocation albo w `reconnecting` / `offline`, miejsce wolne, jest bieżący interrupt | oczekująca z `expectedInterruptId`; **nic nie jest wysyłane** | — | — | — | 8.3 |
| akcja bez bieżącego interruptu (poza `awaiting_action` albo interrupt już pokryty) | odrzucona lokalnie z komunikatem | — | — | — | 8.3 |
| akcja, gdy miejsce zajęte (w locie albo oczekująca) | odrzucona lokalnie z komunikatem | — | — | — | 8.3 |
| koniec invocation z `awaiting_action` i akcja oczekująca: zgodne `interruptId`, surface, komponent, `instance` elementu | nowy bieg akcji | `running` po `RUN_STARTED` | — | — | 8.3 |
| j.w., dowolna niezgodność | porzucona z komunikatem, bez wysyłki | `awaiting_action` | — | — | 8.3 |
| awaria transportu po wysłaniu akcji | akcja niepewna: bez ponowienia, komunikat, miejsce zwolnione, resync | bez zmian | `reconnecting` | — | 8.4, 7.4 |
| raport renderera (`send(error)`) | do raportów następnego biegu | — | — | — | 11.4 |

## 15. Reguły maszynowe profilu

Blok niżej jest **normatywnym źródłem** stałych profilu. Zmiana dowolnej wartości to świadoma zmiana profilu (ADR 0002).
- **Parytet** [kod]: blok = `transport/profile.ts: PROFILE_RULES` (`profileSchemas.test.ts`, `transportCapabilities.test.ts`).
  Blok jest też strażnikiem dryfu `PROFILE_RULES`: ręcznie edytowany literał w osobnym pliku, a nie snapshot.
- Stałe schematów (`schemas/flowassist-transport-1/`) też są porównywane z blokiem.
- Stałe adaptera (limity bajtów i czasu, reconnect, akcje, kody) nie mają jeszcze konsumenta w runtime; użyje ich adapter P1.6.

<!-- profile-rules:begin -->
```json
{
  "profile": "flowassist-transport/1",
  "envelope": { "send": "v0.9.1", "accept": ["v0.9", "v0.9.1"] },
  "presentations": ["card", "focus", "screen"],
  "limits": {
    "dataModelPathMaxLength": 512,
    "dataModelPathMaxSegments": 32,
    "eventMaxBytes": 1048576,
    "messageMaxBytes": 262144,
    "pendingReportsMax": 32
  },
  "reservedKeys": ["__proto__", "constructor", "prototype"],
  "agui": {
    "protocolVersion": "1.0",
    "protocolVersionPattern": "^1\\.(0|[1-9][0-9]*)$",
    "frameEventName": "flowassist.frame",
    "awaitingActionReason": "flowassist.awaiting_action"
  },
  "timeouts": {
    "keepAliveMaxIntervalMs": 15000,
    "idleTimeoutMs": 45000,
    "headersTimeoutMs": 30000,
    "terminalGraceMs": 5000
  },
  "reconnect": {
    "delaysMs": [1000, 2000, 4000],
    "retryableHttpStatus": [408, 429, 502, 503, 504],
    "retryAfterMaxMs": 60000
  },
  "actions": { "slots": 1, "pendingMatch": ["interruptId", "surfaceId", "sourceComponentId", "itemInstance"] },
  "literalOnlyProps": { "WorkspaceItem": ["presentation", "priority"] },
  "idForbiddenChars": ["/", "~"],
  "codes": {
    "a2uiErrors": ["VALIDATION_FAILED", "SURFACE_EXISTS", "SURFACE_NOT_FOUND"],
    "diagnostics": ["ENVELOPE_REJECTED", "STAGE_REJECTED", "NARRATION_REJECTED", "MESSAGE_TOO_LARGE"],
    "runErrors": [
      "profile:FRAME_INVALID", "profile:FRAME_SEQUENCE", "profile:EVENT_TOO_LARGE", "profile:AGUI_VERSION",
      "profile:UNSUPPORTED_INTERRUPTS", "profile:UNEXPECTED_TOOL_CALLS", "agui:PROTOCOL_VIOLATION",
      "transport:AUTH_REJECTED", "transport:INPUT_REJECTED", "transport:SERVER_ERROR", "transport:UNEXPECTED_RESPONSE"
    ],
    "runErrorPrefixes": ["negotiation:", "agent:"],
    "parseReasons": [
      "NOT_OBJECT", "RESERVED_KEY", "PAYLOAD_COUNT", "STAGE_INVALID", "NARRATION_INVALID", "VERSION_UNSUPPORTED",
      "SURFACE_UNKNOWN", "CATALOG_MISMATCH", "COMPONENT_INVALID", "PATH_INVALID", "PATH_LIMIT"
    ]
  }
}
```
<!-- profile-rules:end -->

## 16. Rejestr decyzji

| # | Decyzja | Stan |
|---|---|---|
| D1, D2, D4, D5, D8 | handshake P1.7a | zrealizowane (`fdc79b6`) |
| D3 | profil jako dokument w repo + schematy | ten dokument |
| D6 | wiązanie: ramki `CUSTOM flowassist.frame`; `seq` per bieg AG-UI, reset w każdym biegu, kontrola fatalna, deduplikacja po (`runId`, `seq`), nigdy po treści | §4–§5 |
| D7 | `parseEventDiagnostic` — czysty refaktor w P1.7b (pakiet 2) | §11.5 |
| D9 | `ServerCapabilities` ze statycznej konfiguracji adaptera | §3.3 |
| D10 | `awaiting_action` = interrupt `flowassist.awaiting_action`; akcja w `resume.payload` | §6, §8 |
| D11 | `RUN_FINISHED cancelled` → nowy terminalny `RunStatus 'cancelled'` (P1.6, zmiana kernela zatwierdzona) | §6.1 |
| D12 + M1 | jedno miejsce na akcję: akcja w locie zajmuje je do końca swojej invocation; kolejne odrzucane lokalnie; brak replay (właściciel) | §8.3–8.4 |
| N1 | w trakcie aktywnej invocation i bez połączenia nic nie jest wysyłane; akcja może jedynie zająć wolne miejsce jako oczekująca, gdy jest bieżący interrupt; walidacja i nowa invocation dopiero po końcu poprzedniej (właściciel) | §8.3 |
| N2 | akcja oczekująca przechowuje `expectedInterruptId`; przed wysyłką zgodność `interruptId`, komponentu źródłowego i tożsamości wpisu (`instance`), bez odcisku propsów; nowa decyzja = nowe `id` interruptu (właściciel) | §6.4, §8.3 |
| N3 | nieprawidłowy albo brakujący wymagany `runId` (przy czystym końcu body) = `agui:PROTOCOL_VIOLATION`, terminalnie, bez resync (właściciel); bieg po żądanym = świadome zaostrzenie AG-UI w profilu/1 | §4.8, §7.1 |
| D13 | raporty doklejane do następnego biegu (zmienia przypadek 2 testu zgodności i mock w P1.6) | §11.4 |
| D14 | resync 1/2/4 s; potem `offline`, przebieg wznawialny, bez `error` z sieci, także dla startu (właściciel) | §7.3 |
| H1 | keep-alive ≤ 15 s; 45 s bez ruchu SSE = zerwanie; 30 s na nagłówki; 5 s po zdarzeniu terminalnym; komentarz SSE to ruch (właściciel) | §6.2, §7.2 |
| M2 | klasyfikacja awarii według warstwy i przyczyny; automatycznie ponawiana tylko jednoznaczna awaria transportu; `401`/`403`, błędy profilu i protokołu oraz `RUN_ERROR` agenta bez ponowień; adapter nie syntetyzuje błędu agenta (właściciel) | §7.1 |
| — | niepewna akcja: po awarii przed potwierdzeniem bez drugiej wysyłki; resync porzuca interrupt (`cancelled`), agent podnosi decyzję ponownie (właściciel) | §7.4, §7.5, §8.4 |
| D15 | limity 1 MiB / 256 KiB | §10.8 |
| D16 | tablice: indeks ≤ długość, usuwanie zachowuje długość | §10.7 |
| D17 | obiekty zamknięte (koperty A2UI, `stage`, `narration`) | §9.3, §10.1 |
| D18 | AG-UI major 1 wymagany dla biegu żądanego (świadomy wyjątek od „kontynuuj i ostrzeż”) | §2.4 |
| D19 | zakaz `/` i `~` w `id` / `children` | §10.6 |
| D20 | addytywne API transportu P1.6: stan połączenia, `reconnect()`, komunikaty, `BackendCall 'resync'` | §7, §8 |

Implementacja reguł oznaczonych [P1.6] należy do P1.6 i każda zmiana zachowania przechodzi przez zgodę właściciela przy commicie.
